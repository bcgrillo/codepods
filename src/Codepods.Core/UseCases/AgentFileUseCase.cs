using Codepods.Core.Ports;

namespace Codepods.Core.UseCases;

public sealed class AgentFileUseCase
{
    private readonly IAgentTypeFileStore _files;

    public AgentFileUseCase(IAgentTypeFileStore files)
    {
        _files = files;
    }

    public IReadOnlyList<string> ListTemplates() => _files.ListTemplates();

    public IReadOnlyList<AgentTypeFileEntry> List(string templateName) => _files.ListFiles(templateName);

    public byte[] ReadBytes(string templateName, string fileName) => _files.ReadFileBytes(templateName, fileName);

    public string ReadText(string templateName, string fileName) => _files.ReadTextFile(templateName, fileName);

    public void Create(string templateName, string fileName, byte[] content) => _files.CreateFile(templateName, fileName, content);

    public void Write(string templateName, string fileName, byte[] content) => _files.WriteFile(templateName, fileName, content);

    public void Delete(string templateName, string fileName) => _files.DeleteFile(templateName, fileName);

    public void Rename(string templateName, string fromFileName, string toFileName) => _files.RenameFile(templateName, fromFileName, toFileName);
}
