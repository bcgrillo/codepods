using Codepods.Core.Ports;
using Codepods.Core.Configuration;
using Codepods.Runtime.FileSystem;

namespace Codepods.Runtime.Catalog;

public sealed class FileSystemAgentWorkspace : IAgentWorkspace
{
    private readonly string _dataDir;
    private readonly IFileSystem _fileSystem;

    public FileSystemAgentWorkspace(CodepodsConfig config, IFileSystem fileSystem)
    {
        _dataDir = config.App.DataDir;
        _fileSystem = fileSystem;
    }

    public Task<string> NextAgentNameAsync(CancellationToken ct = default)
    {
        EnsureDirs();
        var max = 0;
        foreach (var dir in _fileSystem.GetDirectories(_dataDir))
        {
            var name = Path.GetFileName(dir);
            if (!name.StartsWith("agente-", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }
            var suffix = name.Split('-', 2).LastOrDefault() ?? string.Empty;
            if (int.TryParse(suffix, out var n))
            {
                max = Math.Max(max, n);
            }
        }

        return Task.FromResult($"agente-{max + 1}");
    }

    public Task<IReadOnlyList<string>> ListTrashAsync(CancellationToken ct = default)
    {
        EnsureDirs();
        var trash = TrashDir();
        if (!_fileSystem.DirectoryExists(trash))
        {
            return Task.FromResult<IReadOnlyList<string>>(Array.Empty<string>());
        }

        var names = _fileSystem.GetDirectories(trash)
            .Select(Path.GetFileName)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
            .ToList();
        return Task.FromResult<IReadOnlyList<string>>(names!);
    }

    public Task<bool> HasTrashAsync(string name, CancellationToken ct = default)
    {
        EnsureDirs();
        var path = Path.Combine(TrashDir(), name.Trim());
        return Task.FromResult(_fileSystem.DirectoryExists(path));
    }

    public Task RestoreTrashAsync(string name, CancellationToken ct = default)
    {
        EnsureDirs();
        var normalized = name.Trim();
        var src = Path.Combine(TrashDir(), normalized);
        if (!_fileSystem.DirectoryExists(src))
        {
            throw new InvalidOperationException($"No trash entry for {normalized}");
        }

        var dst = Path.Combine(_dataDir, normalized);
        if (_fileSystem.DirectoryExists(dst))
        {
            throw new InvalidOperationException($"Target data dir already exists: {dst}");
        }

        _fileSystem.MoveDirectory(src, dst);
        return Task.CompletedTask;
    }

    public Task MoveToTrashAsync(string name, CancellationToken ct = default)
    {
        EnsureDirs();
        var normalized = name.Trim();
        var src = Path.Combine(_dataDir, normalized);
        if (!_fileSystem.DirectoryExists(src))
        {
            return Task.CompletedTask;
        }

        var trash = TrashDir();
        _fileSystem.CreateDirectory(trash);
        var dst = Path.Combine(trash, normalized);
        if (_fileSystem.DirectoryExists(dst))
        {
            dst = Path.Combine(trash, $"{normalized}.{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}");
        }

        _fileSystem.MoveDirectory(src, dst);
        return Task.CompletedTask;
    }

    private void EnsureDirs()
    {
        _fileSystem.CreateDirectory(_dataDir);
        _fileSystem.CreateDirectory(TrashDir());
    }

    private string TrashDir() => Path.Combine(_dataDir, ".trash");
}
