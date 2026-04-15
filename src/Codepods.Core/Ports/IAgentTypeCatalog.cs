namespace Codepods.Core.Ports;

public interface IAgentTypeCatalog
{
    bool Exists(string agentType);
    string LoadMetadataJson(string agentType);
    IReadOnlyList<AgentTypeInfo> ListTypes();
    IReadOnlyList<TemplateInfo> ListTemplates();
}

public sealed record AgentTypeInfo(
    string Name,
    string Description,
    string Image,
    string? IconLightBase64,
    string? IconDarkBase64,
    string? IconMimeType);

public sealed record TemplateInfo(
    string Name,
    string Description,
    bool IsShared,
    string? IconLightBase64,
    string? IconDarkBase64,
    string? IconMimeType);
