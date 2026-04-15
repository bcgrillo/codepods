namespace Codepods.Runtime.FileSystem;

public interface IFileSystem
{
    bool FileExists(string path);
    bool DirectoryExists(string path);
    void CreateDirectory(string path);
    IEnumerable<string> GetDirectories(string path);
    IEnumerable<string> EnumerateFiles(string path, string searchPattern, SearchOption searchOption);
    IEnumerable<string> ReadAllLines(string path);
    string ReadAllText(string path);
    byte[] ReadAllBytes(string path);
    void WriteAllText(string path, string content);
    void WriteAllBytes(string path, byte[] content);
    void DeleteFile(string path);
    void MoveFile(string sourceFileName, string destFileName);
    long GetFileLength(string path);
    DateTimeOffset GetLastWriteTimeUtc(string path);
    void DeleteDirectory(string path, bool recursive);
    void MoveDirectory(string sourceDirName, string destDirName);
}
