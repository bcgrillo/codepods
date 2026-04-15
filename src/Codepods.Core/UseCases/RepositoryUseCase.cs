using Codepods.Core.Domain;
using Codepods.Core.Ports;

namespace Codepods.Core.UseCases;

public sealed class RepositoryUseCase
{
    private readonly IRepositoryRepository _repositories;

    public RepositoryUseCase(IRepositoryRepository repositories)
    {
        _repositories = repositories;
    }

    public Task<IReadOnlyList<Repository>> ListAsync(CancellationToken ct = default) => _repositories.ListAsync(ct);

    public async Task<Repository> GetAsync(int id, CancellationToken ct = default)
        => await _repositories.GetAsync(id, ct) ?? throw new InvalidOperationException("Repository not found");

    public async Task<Repository> CreateAsync(string name, string url, string? description, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException("name is required");
        }
        if (string.IsNullOrWhiteSpace(url))
        {
            throw new InvalidOperationException("url is required");
        }

        return await _repositories.AddAsync(new Repository
        {
            Name = name.Trim(),
            Url = url.Trim(),
            Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim()
        }, ct);
    }

    public async Task<Repository> UpdateAsync(int id, string? name, string? url, string? description, CancellationToken ct = default)
    {
        var row = await GetAsync(id, ct);
        if (!string.IsNullOrWhiteSpace(name))
        {
            row.Name = name.Trim();
        }
        if (!string.IsNullOrWhiteSpace(url))
        {
            row.Url = url.Trim();
        }
        if (description is not null)
        {
            row.Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        }
        row.UpdatedAtUtc = DateTime.UtcNow;
        return await _repositories.UpdateAsync(row, ct);
    }

    public Task DeleteAsync(int id, CancellationToken ct = default) => _repositories.DeleteAsync(id, ct);
}
