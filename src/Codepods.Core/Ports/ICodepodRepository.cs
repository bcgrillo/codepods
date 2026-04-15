using Codepods.Core.Domain;

namespace Codepods.Core.Ports;

public interface ICodepodRepository
{
    Task<IReadOnlyList<Codepod>> ListAsync(CancellationToken ct = default);
    Task<Codepod?> GetAsync(int id, CancellationToken ct = default);
    Task<Codepod> AddAsync(Codepod row, CancellationToken ct = default);
    Task<Codepod> UpdateAsync(Codepod row, CancellationToken ct = default);
    Task DeleteAsync(int id, CancellationToken ct = default);
}
