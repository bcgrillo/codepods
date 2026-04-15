using System.Diagnostics;
using System.Text.RegularExpressions;
using Codepods.Core.Configuration;
using Codepods.Core.Ports;
using Codepods.Runtime.FileSystem;

namespace Codepods.Runtime.Docker;

public sealed class DockerAgentRuntime : IAgentRuntime
{
    private const string SharedTypeName = "shared";
    private readonly string _rootPath;
    private readonly string _agentTypesRoot;
    private readonly string _dataDir;
    private readonly string _tmpRenderRoot;
    private readonly IFileSystem _fileSystem;
    private readonly IVariableRepository _variables;

    public DockerAgentRuntime(CodepodsConfig config, IFileSystem fileSystem, IVariableRepository variables)
    {
        _rootPath = config.App.RootPath;
        _agentTypesRoot = config.App.AgentTypesPath;
        _fileSystem = fileSystem;
        _variables = variables;
        _dataDir = config.App.DataDir;
        _tmpRenderRoot = config.App.TmpRenderDir;
    }

    public async Task<IDictionary<string, string>> ListRuntimeStatusesAsync(CancellationToken ct = default)
    {
        var output = await RunDockerAsync(
            "ps -a --format \"{{.Names}}\\t{{.Status}}\" --filter label=com.codepods.managed=true",
            ct);

        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var parts = line.Split('\t', 2, StringSplitOptions.TrimEntries);
            if (parts.Length == 2)
            {
                result[parts[0]] = parts[1];
            }
        }

        return result;
    }

    public async Task CreateAgentAsync(string name, string agentType, bool restore = false, CancellationToken ct = default)
    {
        EnsureRuntimeDirs();
        var normalizedName = name.Trim();
        var normalizedType = agentType.Trim();
        var metadata = LoadMetadata(normalizedType);
        var env = await CollectRenderVarsAsync(ct);
        var agentDataDir = Path.Combine(_dataDir, normalizedName);
        if (restore)
        {
            var trashSource = Path.Combine(_dataDir, ".trash", normalizedName);
            if (_fileSystem.DirectoryExists(trashSource) && !_fileSystem.DirectoryExists(agentDataDir))
            {
                _fileSystem.MoveDirectory(trashSource, agentDataDir);
            }
        }
        else
        {
            _fileSystem.CreateDirectory(agentDataDir);
        }

        var (sharedRenderDir, typeRenderDir) = RenderConfig(normalizedName, normalizedType, env, metadata.IncludeSharedTemplateFiles);
        var envFilePath = BuildEnvFile(normalizedName, normalizedType, env, metadata.IncludeSharedTemplateFiles);
        var mounts = BuildMountArgs(normalizedName, metadata.Mounts);

        var args = new List<string>
        {
            "run",
            "-d",
            "--name",
            normalizedName,
            "--label",
            "com.codepods.managed=true"
        };

        if (!string.IsNullOrWhiteSpace(envFilePath))
        {
            args.Add("--env-file");
            args.Add(envFilePath!);
        }

        args.AddRange(mounts);
        args.Add(metadata.Image);

        await RunDockerAsync(args, ct);
        await ConfigureAgentAsync(metadata, normalizedName, normalizedType, sharedRenderDir, typeRenderDir, ct);
    }

    public Task WakeAgentAsync(string name, CancellationToken ct = default)
        => RunDockerAsync(new[] { "start", name }, ct);

    public Task SleepAgentAsync(string name, CancellationToken ct = default)
        => RunDockerAsync(new[] { "stop", name }, ct);

    public Task RemoveAgentAsync(string name, CancellationToken ct = default)
        => RunDockerAsync(new[] { "rm", "-f", name }, ct);

    private void EnsureRuntimeDirs()
    {
        _fileSystem.CreateDirectory(_dataDir);
        _fileSystem.CreateDirectory(Path.Combine(_dataDir, ".trash"));
        _fileSystem.CreateDirectory(_tmpRenderRoot);
    }

    private AgentTypeMetadata LoadMetadata(string agentType)
    {
        var image = $"codepods-{agentType}:dev";
        var mounts = new List<string>();
        var configureScript = "configure.sh";
        var includeSharedTemplateFiles = false;
        var sharedConfigureScript = "shared-configure.sh";
        var manifestPath = Path.Combine(_agentTypesRoot, agentType, "manifest.yml");
        if (!_fileSystem.FileExists(manifestPath))
        {
            return new AgentTypeMetadata(image, mounts, configureScript, includeSharedTemplateFiles, sharedConfigureScript);
        }

        string section = string.Empty;
        foreach (var raw in _fileSystem.ReadAllLines(manifestPath))
        {
            var line = raw.TrimEnd();
            if (string.IsNullOrWhiteSpace(line) || line.TrimStart().StartsWith('#'))
            {
                continue;
            }

            var trimmed = line.Trim();
            if (trimmed.EndsWith(":", StringComparison.Ordinal))
            {
                section = trimmed[..^1].Trim();
                continue;
            }

            if (trimmed.StartsWith("- ", StringComparison.Ordinal) &&
                section.Equals("mounts", StringComparison.OrdinalIgnoreCase))
            {
                mounts.Add(trimmed[2..].Trim().Trim('"', '\''));
                continue;
            }

            var idx = trimmed.IndexOf(':');
            if (idx <= 0)
            {
                continue;
            }

            var key = trimmed[..idx].Trim();
            var value = trimmed[(idx + 1)..].Trim().Trim('"', '\'');
            if (key.Equals("configure_script", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(value))
            {
                configureScript = value;
            }
            else if (key.Equals("include_shared_template_files", StringComparison.OrdinalIgnoreCase) && bool.TryParse(value, out var includeShared))
            {
                includeSharedTemplateFiles = includeShared;
            }
            else if (key.Equals("shared_configure_script", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(value))
            {
                sharedConfigureScript = value;
            }
        }

        return new AgentTypeMetadata(image, mounts, configureScript, includeSharedTemplateFiles, sharedConfigureScript);
    }

    private string? BuildEnvFile(string agentName, string agentType, Dictionary<string, string> env, bool includeSharedTemplateFiles)
    {
        var templates = new List<string>();
        if (includeSharedTemplateFiles)
        {
            templates.Add(Path.Combine(_agentTypesRoot, SharedTypeName, ".env.template"));
        }
        templates.Add(Path.Combine(_agentTypesRoot, agentType, ".env.template"));

        var renderDir = Path.Combine(_tmpRenderRoot, agentName, agentType, "config", "env");
        _fileSystem.CreateDirectory(renderDir);
        var compiledPath = Path.Combine(renderDir, "container.env");

        var wroteAny = false;
        using (var writer = new StreamWriter(compiledPath, append: false))
        {
            foreach (var template in templates)
            {
                if (!_fileSystem.FileExists(template))
                {
                    continue;
                }

                var text = _fileSystem.ReadAllText(template);
                var rendered = Regex.Replace(text, "\\$\\{([^}]+)\\}", match =>
                {
                    var key = match.Groups[1].Value;
                    return env.TryGetValue(key, out var value) ? value : match.Value;
                });

                writer.WriteLine(rendered);
                wroteAny = true;
            }
        }

        if (wroteAny)
        {
            return compiledPath;
        }

        return null;
    }

    private async Task<Dictionary<string, string>> CollectRenderVarsAsync(CancellationToken ct)
    {
        // Agent template rendering must only use configured variables from DB.
        var rows = await _variables.ListAsync(null, ct);
        return rows
            .Where(x => x.CodepodId is null)
            .OrderBy(x => x.Id)
            .ToDictionary(x => x.Name, x => x.IsSecret ? Codepods.Core.Security.SecretCipher.Decrypt(x.Value) : x.Value, StringComparer.Ordinal);
    }

    private (string SharedRenderDir, string TypeRenderDir) RenderConfig(string agentName, string agentType, Dictionary<string, string> env, bool includeSharedTemplateFiles)
    {
        var sharedRenderDir = RenderDir(agentName, SharedTypeName);
        var typeRenderDir = RenderDir(agentName, agentType);
        if (includeSharedTemplateFiles)
        {
            RenderConfigTree(Path.Combine(_agentTypesRoot, SharedTypeName), sharedRenderDir, env);
        }
        RenderConfigTree(Path.Combine(_agentTypesRoot, agentType), typeRenderDir, env);
        return (sharedRenderDir, typeRenderDir);
    }

    private string RenderDir(string agentName, string agentType)
    {
        var path = Path.Combine(_tmpRenderRoot, agentName, agentType, "config");
        if (_fileSystem.DirectoryExists(path))
        {
            _fileSystem.DeleteDirectory(path, recursive: true);
        }

        _fileSystem.CreateDirectory(path);
        return path;
    }

    private void RenderConfigTree(string sourceDir, string targetDir, Dictionary<string, string> env)
    {
        var filesRoot = Path.Combine(sourceDir, "files");
        if (!_fileSystem.DirectoryExists(filesRoot))
        {
            return;
        }

        foreach (var template in _fileSystem.EnumerateFiles(filesRoot, "*.template", SearchOption.AllDirectories).OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
        {
            var relative = Path.GetRelativePath(filesRoot, template);
            var targetRelative = relative.EndsWith(".template", StringComparison.OrdinalIgnoreCase)
                ? relative[..^".template".Length]
                : relative;
            var destination = Path.Combine(targetDir, targetRelative);
            var destinationDir = Path.GetDirectoryName(destination);
            if (!string.IsNullOrWhiteSpace(destinationDir))
            {
                _fileSystem.CreateDirectory(destinationDir);
            }

            var text = _fileSystem.ReadAllText(template);
            var rendered = Regex.Replace(text, "\\$\\{([^}]+)\\}", match =>
            {
                var key = match.Groups[1].Value;
                return env.TryGetValue(key, out var value) ? value : match.Value;
            });
            _fileSystem.WriteAllText(destination, rendered);
        }
    }

    private async Task ConfigureAgentAsync(AgentTypeMetadata metadata, string agentName, string agentType, string sharedRenderDir, string typeRenderDir, CancellationToken ct)
    {
        if (metadata.IncludeSharedTemplateFiles)
        {
            await ApplyConfigScriptAsync(
                agentName,
                ResolveSharedConfigureScriptPath(metadata.SharedConfigureScript),
                sharedRenderDir,
                typeRenderDir,
                ct);
        }
        await ApplyConfigScriptAsync(
            agentName,
            ResolveConfigureScriptPath(agentType, metadata.ConfigureScript),
            sharedRenderDir,
            typeRenderDir,
            ct);
    }

    private string ResolveConfigureScriptPath(string agentType, string scriptName)
    {
        var effectiveScript = string.IsNullOrWhiteSpace(scriptName) ? "configure.sh" : scriptName.Trim();
        var scriptPath = Path.Combine(_agentTypesRoot, agentType, effectiveScript);
        if (!_fileSystem.FileExists(scriptPath))
        {
            throw new InvalidOperationException($"Missing config script: {scriptPath}");
        }

        return scriptPath;
    }

    private string ResolveSharedConfigureScriptPath(string scriptName)
    {
        var effectiveScript = string.IsNullOrWhiteSpace(scriptName) ? "shared-configure.sh" : scriptName.Trim();
        var scriptPath = Path.Combine(_agentTypesRoot, SharedTypeName, effectiveScript);
        if (!_fileSystem.FileExists(scriptPath))
        {
            throw new InvalidOperationException($"Missing shared config script: {scriptPath}");
        }

        return scriptPath;
    }

    private async Task ApplyConfigScriptAsync(
        string agentName,
        string scriptPath,
        string sharedRenderDir,
        string typeRenderDir,
        CancellationToken ct)
    {
        var env = Environment.GetEnvironmentVariables()
            .Cast<System.Collections.DictionaryEntry>()
            .Where(x => x.Key is not null && x.Value is not null)
            .ToDictionary(x => x.Key!.ToString()!, x => x.Value!.ToString()!, StringComparer.Ordinal);
        env["CODEPODS_AGENT_NAME"] = agentName;
        env["CODEPODS_SHARED_RENDER_DIR"] = sharedRenderDir;
        env["CODEPODS_TYPE_RENDER_DIR"] = typeRenderDir;

        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "bash",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            }
        };

        process.StartInfo.ArgumentList.Add(scriptPath);
        foreach (var kv in env)
        {
            process.StartInfo.Environment[kv.Key] = kv.Value;
        }

        process.Start();
        var stdout = await process.StandardOutput.ReadToEndAsync(ct);
        var stderr = await process.StandardError.ReadToEndAsync(ct);
        await process.WaitForExitAsync(ct);
        if (process.ExitCode != 0)
        {
            var detail = string.IsNullOrWhiteSpace(stderr) ? stdout : stderr;
            throw new InvalidOperationException($"Failed running {scriptPath}: {detail.Trim()}");
        }
    }

    private List<string> BuildMountArgs(string agentName, IReadOnlyList<string> mounts)
    {
        var args = new List<string>();
        foreach (var mount in mounts)
        {
            var parts = mount.Split('|', StringSplitOptions.TrimEntries);
            if (parts.Length < 2 || string.IsNullOrWhiteSpace(parts[0]) || string.IsNullOrWhiteSpace(parts[1]))
            {
                continue;
            }

            var hostDir = Path.Combine(_dataDir, agentName, parts[0]);
            _fileSystem.CreateDirectory(hostDir);
            args.Add("-v");
            args.Add($"{hostDir}:{parts[1]}");
        }

        return args;
    }

    private static async Task<string> RunDockerAsync(IReadOnlyList<string> args, CancellationToken ct)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "docker",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            }
        };

        foreach (var arg in args)
        {
            process.StartInfo.ArgumentList.Add(arg);
        }

        process.Start();
        var stdout = await process.StandardOutput.ReadToEndAsync(ct);
        var stderr = await process.StandardError.ReadToEndAsync(ct);
        await process.WaitForExitAsync(ct);

        if (process.ExitCode != 0)
        {
            var joined = string.Join(" ", args);
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(stderr) ? $"docker failed: {joined}" : stderr.Trim());
        }

        return stdout;
    }

    private static async Task<string> RunDockerAsync(string args, CancellationToken ct)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "docker",
                Arguments = args,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };

        process.Start();
        var stdout = await process.StandardOutput.ReadToEndAsync(ct);
        var stderr = await process.StandardError.ReadToEndAsync(ct);
        await process.WaitForExitAsync(ct);

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(stderr) ? $"docker failed: {args}" : stderr.Trim());
        }

        return stdout;
    }

    private sealed record AgentTypeMetadata(
        string Image,
        IReadOnlyList<string> Mounts,
        string ConfigureScript,
        bool IncludeSharedTemplateFiles,
        string SharedConfigureScript);
}
