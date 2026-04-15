using System.Text.Json;
using Codepods.Core.Ports;
using Codepods.Runtime.FileSystem;

namespace Codepods.Runtime.Catalog;

public sealed class FileSystemAgentTypeCatalog : IAgentTypeCatalog
{
    private readonly string _agentTypesRoot;
    private readonly IFileSystem _fileSystem;

    public FileSystemAgentTypeCatalog(string agentTypesRoot, IFileSystem fileSystem)
    {
        _agentTypesRoot = agentTypesRoot;
        _fileSystem = fileSystem;
    }

    public bool Exists(string agentType)
    {
        var normalized = agentType.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }
        if (string.Equals(normalized, "shared", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var manifestPath = Path.Combine(_agentTypesRoot, normalized, "manifest.yml");
        return _fileSystem.FileExists(manifestPath);
    }

    public string LoadMetadataJson(string agentType)
    {
        var manifestPath = Path.Combine(_agentTypesRoot, agentType.Trim(), "manifest.yml");
        if (!_fileSystem.FileExists(manifestPath))
        {
            throw new InvalidOperationException($"Manifest not found: {manifestPath}");
        }

        var manifest = ParseManifest(manifestPath);
        var payload = new Dictionary<string, object?>
        {
            ["display_name"] = manifest.DisplayName ?? agentType.Trim(),
            ["description"] = manifest.Description ?? agentType.Trim(),
            ["services"] = manifest.Services,
            ["mounts"] = manifest.Mounts,
            ["start_command"] = manifest.StartCommand ?? string.Empty,
            ["configure_script"] = manifest.ConfigureScript ?? "configure.sh",
            ["include_shared_template_files"] = manifest.IncludeSharedTemplateFiles,
            ["shared_configure_script"] = manifest.SharedConfigureScript ?? "shared-configure.sh",
            ["icon"] = manifest.Icon,
            ["icon_dark"] = manifest.IconDark
        };

        return JsonSerializer.Serialize(payload);
    }

    public IReadOnlyList<AgentTypeInfo> ListTypes()
    {
        if (!_fileSystem.DirectoryExists(_agentTypesRoot))
        {
            return Array.Empty<AgentTypeInfo>();
        }

        var results = new List<AgentTypeInfo>();
        foreach (var dir in _fileSystem.GetDirectories(_agentTypesRoot).OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
        {
            var name = Path.GetFileName(dir);
            if (string.IsNullOrWhiteSpace(name) || string.Equals(name, "shared", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var manifestPath = Path.Combine(dir, "manifest.yml");
            if (!_fileSystem.FileExists(manifestPath))
            {
                continue;
            }

            var manifest = ParseManifest(manifestPath);
            var (iconLightBase64, iconDarkBase64, iconMimeType) = LoadIcons(dir, manifest.Icon, manifest.IconDark);
            results.Add(new AgentTypeInfo(
                name,
                manifest.Description ?? name,
                $"codepods-{name}:dev",
                iconLightBase64,
                iconDarkBase64,
                iconMimeType));
        }

        return results;
    }

    public IReadOnlyList<TemplateInfo> ListTemplates()
    {
        if (!_fileSystem.DirectoryExists(_agentTypesRoot))
        {
            return Array.Empty<TemplateInfo>();
        }

        var entries = _fileSystem.GetDirectories(_agentTypesRoot)
            .Select(path => new { Path = path, Name = Path.GetFileName(path) })
            .Where(x => !string.IsNullOrWhiteSpace(x.Name))
            .OrderByDescending(x => string.Equals(x.Name, "shared", StringComparison.OrdinalIgnoreCase))
            .ThenBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var results = new List<TemplateInfo>(entries.Count);
        foreach (var entry in entries)
        {
            var manifestPath = Path.Combine(entry.Path, "manifest.yml");
            var manifest = _fileSystem.FileExists(manifestPath) ? ParseManifest(manifestPath) : EmptyManifest();
            var (iconLightBase64, iconDarkBase64, iconMimeType) = LoadIcons(entry.Path, manifest.Icon, manifest.IconDark);
            results.Add(new TemplateInfo(
                entry.Name!,
                manifest.Description ?? entry.Name!,
                string.Equals(entry.Name, "shared", StringComparison.OrdinalIgnoreCase),
                iconLightBase64,
                iconDarkBase64,
                iconMimeType));
        }

        return results;
    }

    private (string? IconLightBase64, string? IconDarkBase64, string? MimeType) LoadIcons(string templateDir, string? iconRelativePath, string? iconDarkRelativePath)
    {
        var lightPath = ResolveIconPath(templateDir, iconRelativePath);
        var darkPath = ResolveIconPath(templateDir, iconDarkRelativePath);
        if (darkPath is null && lightPath is not null)
        {
            darkPath = lightPath;
        }

        if (lightPath is null && darkPath is null)
        {
            return (null, null, null);
        }

        var mime = GuessMimeType(lightPath ?? darkPath!);
        var lightBytes = lightPath is null ? null : _fileSystem.ReadAllBytes(lightPath);
        var darkBytes = darkPath is null ? null : _fileSystem.ReadAllBytes(darkPath);
        return (
            lightBytes is null ? null : Convert.ToBase64String(lightBytes),
            darkBytes is null ? null : Convert.ToBase64String(darkBytes),
            mime);
    }

    private string? ResolveIconPath(string templateDir, string? manifestValue)
    {
        var normalized = (manifestValue ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        var candidate = Path.GetFullPath(Path.Combine(templateDir, normalized.Replace('/', Path.DirectorySeparatorChar)));
        var normalizedTemplateDir = Path.GetFullPath(templateDir);
        if (!candidate.StartsWith(normalizedTemplateDir, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }
        if (!_fileSystem.FileExists(candidate))
        {
            return null;
        }

        return candidate;
    }

    private static string GuessMimeType(string path)
    {
        var extension = Path.GetExtension(path).ToLowerInvariant();
        return extension switch
        {
            ".svg" => "image/svg+xml",
            ".png" => "image/png",
            ".jpg" => "image/jpeg",
            ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            _ => "application/octet-stream"
        };
    }

    private ManifestData ParseManifest(string manifestPath)
    {
        var data = EmptyManifest();
        var section = string.Empty;

        foreach (var rawLine in _fileSystem.ReadAllLines(manifestPath))
        {
            var line = rawLine.TrimEnd();
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

            if (trimmed.StartsWith("- ", StringComparison.Ordinal))
            {
                var item = trimmed[2..].Trim().Trim('"', '\'');
                if (section.Equals("services", StringComparison.OrdinalIgnoreCase))
                {
                    var parts = item.Split('|', StringSplitOptions.TrimEntries);
                    if (parts.Length == 3 && int.TryParse(parts[2], out _))
                    {
                        data.Services.Add(new Dictionary<string, string>
                        {
                            ["id"] = parts[0],
                            ["kind"] = parts[1],
                            ["port"] = parts[2]
                        });
                    }
                }
                else if (section.Equals("mounts", StringComparison.OrdinalIgnoreCase))
                {
                    data.Mounts.Add(item);
                }

                continue;
            }

            var idx = trimmed.IndexOf(':');
            if (idx <= 0)
            {
                continue;
            }

            var key = trimmed[..idx].Trim();
            var value = trimmed[(idx + 1)..].Trim().Trim('"', '\'');
            switch (key)
            {
                case "display_name":
                    data.DisplayName = value;
                    break;
                case "description":
                    data.Description = value;
                    break;
                case "start_command":
                    data.StartCommand = value;
                    break;
                case "configure_script":
                    data.ConfigureScript = value;
                    break;
                case "include_shared_template_files":
                    if (bool.TryParse(value, out var includeShared))
                    {
                        data.IncludeSharedTemplateFiles = includeShared;
                    }
                    break;
                case "shared_configure_script":
                    data.SharedConfigureScript = value;
                    break;
                case "icon":
                    data.Icon = value;
                    break;
                case "icon_dark":
                    data.IconDark = value;
                    break;
            }
        }

        return data;
    }

    private static ManifestData EmptyManifest() => new()
    {
        Services = new List<Dictionary<string, string>>(),
        Mounts = new List<string>()
    };

    private sealed class ManifestData
    {
        public string? DisplayName { get; set; }
        public string? Description { get; set; }
        public string? StartCommand { get; set; }
        public string? ConfigureScript { get; set; }
        public bool IncludeSharedTemplateFiles { get; set; }
        public string? SharedConfigureScript { get; set; }
        public string? Icon { get; set; }
        public string? IconDark { get; set; }
        public List<Dictionary<string, string>> Services { get; set; } = [];
        public List<string> Mounts { get; set; } = [];
    }
}
