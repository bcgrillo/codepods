namespace Codepods.Runtime.FileSystem;

public sealed class SystemFileSystem : IFileSystem
{
    public bool FileExists(string path) => File.Exists(path);
    public bool DirectoryExists(string path) => Directory.Exists(path);
    public void CreateDirectory(string path) => Directory.CreateDirectory(path);
    public IEnumerable<string> GetDirectories(string path) => Directory.GetDirectories(path);
    public IEnumerable<string> EnumerateFiles(string path, string searchPattern, SearchOption searchOption)
        => Directory.EnumerateFiles(path, searchPattern, searchOption);
    public IEnumerable<string> ReadAllLines(string path) => File.ReadAllLines(path);
    public string ReadAllText(string path) => File.ReadAllText(path);
    public byte[] ReadAllBytes(string path) => File.ReadAllBytes(path);
    public void WriteAllText(string path, string content) => File.WriteAllText(path, content);
    public void WriteAllBytes(string path, byte[] content) => File.WriteAllBytes(path, content);
    public void DeleteFile(string path) => File.Delete(path);
    public void MoveFile(string sourceFileName, string destFileName) => File.Move(sourceFileName, destFileName);
    public long GetFileLength(string path) => new FileInfo(path).Length;
    public DateTimeOffset GetLastWriteTimeUtc(string path) => File.GetLastWriteTimeUtc(path);
    public void DeleteDirectory(string path, bool recursive) => Directory.Delete(path, recursive);
    public void MoveDirectory(string sourceDirName, string destDirName) => Directory.Move(sourceDirName, destDirName);
}
