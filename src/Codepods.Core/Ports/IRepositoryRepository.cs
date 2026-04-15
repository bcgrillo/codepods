using Codepods.Core.Domain;

namespace Codepods.Core.Ports;

public interface IRepositoryRepository
{
    Task<IReadOnlyList<Repository>> ListAsync(CancellationToken ct = default);
    Task<Repository?> GetAsync(int id, CancellationToken ct = default);
    Task<Repository> AddAsync(Repository row, CancellationToken ct = default);
    Task<Repository> UpdateAsync(Repository row, CancellationToken ct = default);
    Task DeleteAsync(int id, CancellationToken ct = default);
}
