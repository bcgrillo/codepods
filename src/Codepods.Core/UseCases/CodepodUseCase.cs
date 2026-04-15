using Codepods.Core.Domain;
using Codepods.Core.Ports;

namespace Codepods.Core.UseCases;

public sealed class CodepodUseCase
{
    private readonly ICodepodRepository _codepods;

    public CodepodUseCase(ICodepodRepository codepods)
    {
        _codepods = codepods;
    }

    public Task<IReadOnlyList<Codepod>> ListAsync(CancellationToken ct = default) => _codepods.ListAsync(ct);

    public async Task<Codepod> GetAsync(int id, CancellationToken ct = default)
        => await _codepods.GetAsync(id, ct) ?? throw new InvalidOperationException("Codepod not found");

    public async Task<Codepod> CreateAsync(string name, string? description, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException("name is required");
        }

        return await _codepods.AddAsync(new Codepod
        {
            Name = name.Trim(),
            Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim()
        }, ct);
    }

    public async Task<Codepod> UpdateAsync(int id, string? name, string? description, CancellationToken ct = default)
    {
        var row = await GetAsync(id, ct);
        if (!string.IsNullOrWhiteSpace(name))
        {
            row.Name = name.Trim();
        }
        if (description is not null)
        {
            row.Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        }
        row.UpdatedAtUtc = DateTime.UtcNow;
        return await _codepods.UpdateAsync(row, ct);
    }

    public Task DeleteAsync(int id, CancellationToken ct = default) => _codepods.DeleteAsync(id, ct);
}
