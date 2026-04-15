using System.Text.Json;

namespace Codepods.Core.Domain;

public sealed class Agent
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string AgentType { get; set; } = string.Empty;
    public AgentStatus Status { get; set; } = AgentStatus.Pending;
    public string MetadataJson { get; set; } = "{}";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public IReadOnlyList<ServicePort> Services()
    {
        try
        {
            using var doc = JsonDocument.Parse(MetadataJson);
            if (!doc.RootElement.TryGetProperty("services", out var servicesNode) || servicesNode.ValueKind != JsonValueKind.Array)
            {
                return Array.Empty<ServicePort>();
            }

            var result = new List<ServicePort>();
            foreach (var item in servicesNode.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                var id = item.TryGetProperty("id", out var idNode) ? idNode.GetString() ?? string.Empty : string.Empty;
                var kind = item.TryGetProperty("kind", out var kindNode) ? kindNode.GetString() ?? string.Empty : string.Empty;
                var rawPort = item.TryGetProperty("port", out var portNode) ? portNode.GetString() ?? string.Empty : string.Empty;
                if (!int.TryParse(rawPort, out var port))
                {
                    continue;
                }

                if (!string.IsNullOrWhiteSpace(id) && !string.IsNullOrWhiteSpace(kind))
                {
                    result.Add(new ServicePort(id.Trim(), kind.Trim(), port));
                }
            }

            return result;
        }
        catch
        {
            return Array.Empty<ServicePort>();
        }
    }
}
