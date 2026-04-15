namespace Codepods.Core.Ports;

public interface IAgentTypeFileStore
{
    IReadOnlyList<string> ListTemplates();
    IReadOnlyList<AgentTypeFileEntry> ListFiles(string templateName);
    byte[] ReadFileBytes(string templateName, string fileName);
    string ReadTextFile(string templateName, string fileName);
    void CreateFile(string templateName, string fileName, byte[] content);
    void WriteFile(string templateName, string fileName, byte[] content);
    void DeleteFile(string templateName, string fileName);
    void RenameFile(string templateName, string fromFileName, string toFileName);
}

public sealed record AgentTypeFileEntry(
    string Path,
    long Size,
    DateTimeOffset UpdatedAtUtc,
    bool IsTextEditable);
