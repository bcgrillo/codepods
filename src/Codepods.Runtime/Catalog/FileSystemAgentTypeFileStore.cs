using Codepods.Core.Ports;
using Codepods.Runtime.FileSystem;

namespace Codepods.Runtime.Catalog;

public sealed class FileSystemAgentTypeFileStore : IAgentTypeFileStore
{
    private readonly string _agentTypesRoot;
    private readonly IFileSystem _fileSystem;
    private static readonly HashSet<string> TextExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".txt", ".md", ".yml", ".yaml", ".json", ".toml", ".xml", ".ini", ".cfg", ".conf", ".env", ".template",
        ".sh", ".bash", ".zsh", ".ps1", ".cmd", ".bat",
        ".py", ".js", ".ts", ".tsx", ".jsx", ".cs", ".java", ".go", ".rs", ".rb", ".php", ".sql",
        ".html", ".css", ".scss", ".sass", ".less", ".svg", ".dockerfile"
    };

    public FileSystemAgentTypeFileStore(string agentTypesRoot, IFileSystem fileSystem)
    {
        _agentTypesRoot = agentTypesRoot;
        _fileSystem = fileSystem;
    }

    public IReadOnlyList<string> ListTemplates()
    {
        if (!_fileSystem.DirectoryExists(_agentTypesRoot))
        {
            return Array.Empty<string>();
        }

        return _fileSystem
            .GetDirectories(_agentTypesRoot)
            .Select(Path.GetFileName)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
            .ToArray()!;
    }

    public IReadOnlyList<AgentTypeFileEntry> ListFiles(string templateName)
    {
        var baseDir = ResolveBaseDir(templateName);
        var files = _fileSystem
            .EnumerateFiles(baseDir, "*", SearchOption.AllDirectories)
            .Select(path =>
            {
                var relativePath = Path.GetRelativePath(baseDir, path).Replace('\\', '/');
                return new AgentTypeFileEntry(
                    relativePath,
                    _fileSystem.GetFileLength(path),
                    _fileSystem.GetLastWriteTimeUtc(path),
                    IsTextEditable(relativePath));
            })
            .OrderBy(entry => HasSubfolder(entry.Path) ? 0 : 1)
            .ThenBy(entry => entry.Path, StringComparer.CurrentCultureIgnoreCase)
            .ToArray();

        return files;
    }

    public string ReadTextFile(string templateName, string fileName)
    {
        var bytes = ReadFileBytes(templateName, fileName);
        if (!IsTextEditable(fileName))
        {
            throw new InvalidOperationException("Binary file cannot be edited as text.");
        }

        if (ContainsNullByte(bytes))
        {
            throw new InvalidOperationException("Binary file cannot be edited as text.");
        }

        return System.Text.Encoding.UTF8.GetString(bytes);
    }

    public byte[] ReadFileBytes(string templateName, string fileName)
    {
        var path = ResolvePath(templateName, fileName);
        if (!_fileSystem.FileExists(path))
        {
            throw new FileNotFoundException($"File not found: {path}");
        }

        return _fileSystem.ReadAllBytes(path);
    }

    public void CreateFile(string templateName, string fileName, byte[] content)
    {
        var path = ResolvePath(templateName, fileName);
        if (_fileSystem.FileExists(path))
        {
            throw new InvalidOperationException($"File already exists: {fileName}");
        }

        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrWhiteSpace(dir))
        {
            _fileSystem.CreateDirectory(dir);
        }

        _fileSystem.WriteAllBytes(path, content);
    }

    public void WriteFile(string templateName, string fileName, byte[] content)
    {
        var path = ResolvePath(templateName, fileName);
        if (!_fileSystem.FileExists(path))
        {
            throw new FileNotFoundException($"File not found: {path}");
        }

        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrWhiteSpace(dir))
        {
            _fileSystem.CreateDirectory(dir);
        }

        _fileSystem.WriteAllBytes(path, content);
    }

    public void DeleteFile(string templateName, string fileName)
    {
        var path = ResolvePath(templateName, fileName);
        if (!_fileSystem.FileExists(path))
        {
            throw new FileNotFoundException($"File not found: {path}");
        }

        _fileSystem.DeleteFile(path);
    }

    public void RenameFile(string templateName, string fromFileName, string toFileName)
    {
        var sourcePath = ResolvePath(templateName, fromFileName);
        var destinationPath = ResolvePath(templateName, toFileName);
        if (!_fileSystem.FileExists(sourcePath))
        {
            throw new FileNotFoundException($"File not found: {sourcePath}");
        }
        if (_fileSystem.FileExists(destinationPath))
        {
            throw new InvalidOperationException($"Destination file already exists: {toFileName}");
        }

        var destinationDir = Path.GetDirectoryName(destinationPath);
        if (!string.IsNullOrWhiteSpace(destinationDir))
        {
            _fileSystem.CreateDirectory(destinationDir);
        }

        _fileSystem.MoveFile(sourcePath, destinationPath);
    }

    private string ResolveBaseDir(string templateName)
    {
        var normalizedName = templateName.Trim();
        if (string.IsNullOrWhiteSpace(normalizedName))
        {
            throw new InvalidOperationException("template_name is required");
        }

        var baseDir = Path.GetFullPath(Path.Combine(_agentTypesRoot, normalizedName));
        var rootDir = Path.GetFullPath(_agentTypesRoot);
        if (!baseDir.StartsWith(rootDir, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Invalid template name");
        }
        if (!_fileSystem.DirectoryExists(baseDir))
        {
            throw new InvalidOperationException($"Template not found: {normalizedName}");
        }

        return baseDir;
    }

    private string ResolvePath(string templateName, string fileName)
    {
        var baseDir = ResolveBaseDir(templateName);
        var normalizedFile = fileName.Trim().Replace('\\', '/');
        if (string.IsNullOrWhiteSpace(normalizedFile))
        {
            throw new InvalidOperationException("template_name and file_name are required");
        }
        if (normalizedFile.StartsWith('/') || normalizedFile.Contains("..", StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Invalid file path");
        }

        var target = Path.GetFullPath(Path.Combine(baseDir, normalizedFile));
        if (!target.StartsWith(baseDir, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Invalid file path");
        }

        return target;
    }

    private static bool IsTextEditable(string filePath)
    {
        var fileName = Path.GetFileName(filePath);
        if (!string.IsNullOrEmpty(fileName) && fileName.StartsWith(".", StringComparison.Ordinal))
        {
            return true;
        }

        var extension = Path.GetExtension(filePath);
        if (string.IsNullOrWhiteSpace(extension))
        {
            return true;
        }

        return TextExtensions.Contains(extension);
    }

    private static bool ContainsNullByte(byte[] bytes)
    {
        for (var i = 0; i < bytes.Length; i++)
        {
            if (bytes[i] == 0)
            {
                return true;
            }
        }

        return false;
    }

    private static bool HasSubfolder(string relativePath) => relativePath.Contains('/', StringComparison.Ordinal);
}
