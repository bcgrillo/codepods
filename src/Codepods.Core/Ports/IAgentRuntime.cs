namespace Codepods.Core.Ports;

public interface IAgentRuntime
{
    Task<IDictionary<string, string>> ListRuntimeStatusesAsync(CancellationToken ct = default);
    Task CreateAgentAsync(string name, string agentType, bool restore = false, CancellationToken ct = default);
    Task WakeAgentAsync(string name, CancellationToken ct = default);
    Task SleepAgentAsync(string name, CancellationToken ct = default);
    Task RemoveAgentAsync(string name, CancellationToken ct = default);
}
