using Codepods.Core.Domain;

namespace Codepods.Core.Ports;

public interface IAgentRepository
{
    Task<IReadOnlyList<Agent>> ListAsync(CancellationToken ct = default);
    Task<Agent?> GetByIdAsync(int id, CancellationToken ct = default);
    Task<Agent?> GetByNameAsync(string name, CancellationToken ct = default);
    Task<Agent> AddAsync(Agent agent, CancellationToken ct = default);
    Task<Agent> UpdateAsync(Agent agent, CancellationToken ct = default);
    Task DeleteAsync(int id, CancellationToken ct = default);
}
