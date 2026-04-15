namespace Codepods.Core.Domain;

public sealed class RelayBinding
{
    public int Id { get; set; }
    public int AgentId { get; set; }
    public string ServiceKind { get; set; } = string.Empty;
    public int TargetPort { get; set; }
    public int RelayPort { get; set; }
    public bool Enabled { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
