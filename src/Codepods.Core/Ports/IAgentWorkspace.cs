namespace Codepods.Core.Ports;

public interface IAgentWorkspace
{
    Task<string> NextAgentNameAsync(CancellationToken ct = default);
    Task<IReadOnlyList<string>> ListTrashAsync(CancellationToken ct = default);
    Task<bool> HasTrashAsync(string name, CancellationToken ct = default);
    Task RestoreTrashAsync(string name, CancellationToken ct = default);
    Task MoveToTrashAsync(string name, CancellationToken ct = default);
}
