using Codepods.Core.Domain;

namespace Codepods.Core.Ports;

public interface IProviderRepository
{
    Task<IReadOnlyList<Provider>> ListAsync(CancellationToken ct = default);
    Task<Provider?> GetAsync(int id, CancellationToken ct = default);
    Task<Provider> AddAsync(Provider row, CancellationToken ct = default);
    Task<Provider> UpdateAsync(Provider row, CancellationToken ct = default);
    Task DeleteAsync(int id, CancellationToken ct = default);
}
