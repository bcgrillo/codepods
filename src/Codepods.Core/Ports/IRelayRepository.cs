using Codepods.Core.Domain;

namespace Codepods.Core.Ports;

public interface IRelayRepository
{
    Task<IReadOnlyList<RelayBinding>> ListAsync(CancellationToken ct = default);
    Task<IReadOnlyList<RelayBinding>> ListByAgentAsync(int agentId, CancellationToken ct = default);
    Task<RelayBinding?> GetAsync(int relayId, CancellationToken ct = default);
    Task<RelayBinding?> GetByAgentAndKindAsync(int agentId, string serviceKind, CancellationToken ct = default);
    Task<RelayBinding> AddAsync(RelayBinding relay, CancellationToken ct = default);
    Task<RelayBinding> UpdateAsync(RelayBinding relay, CancellationToken ct = default);
    Task DeleteByAgentAsync(int agentId, CancellationToken ct = default);
}
