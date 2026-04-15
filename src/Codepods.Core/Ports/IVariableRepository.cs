using Codepods.Core.Domain;

namespace Codepods.Core.Ports;

public interface IVariableRepository
{
    Task<IReadOnlyList<Variable>> ListAsync(int? codepodId = null, CancellationToken ct = default);
    Task<Variable?> GetAsync(int id, CancellationToken ct = default);
    Task<Variable> AddAsync(Variable row, CancellationToken ct = default);
    Task<Variable> UpdateAsync(Variable row, CancellationToken ct = default);
    Task DeleteAsync(int id, CancellationToken ct = default);
}
