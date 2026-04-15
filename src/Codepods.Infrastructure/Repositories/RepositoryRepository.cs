using Codepods.Core.Domain;
using Codepods.Core.Ports;
using Codepods.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Codepods.Infrastructure.Repositories;

public sealed class RepositoryRepository : IRepositoryRepository
{
    private readonly CodepodsDbContext _db;

    public RepositoryRepository(CodepodsDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<Repository>> ListAsync(CancellationToken ct = default)
        => await _db.Repositories.AsNoTracking().OrderBy(x => x.Id).ToListAsync(ct);

    public Task<Repository?> GetAsync(int id, CancellationToken ct = default)
        => _db.Repositories.FirstOrDefaultAsync(x => x.Id == id, ct);

    public async Task<Repository> AddAsync(Repository row, CancellationToken ct = default)
    {
        _db.Repositories.Add(row);
        await _db.SaveChangesAsync(ct);
        return row;
    }

    public async Task<Repository> UpdateAsync(Repository row, CancellationToken ct = default)
    {
        _db.Repositories.Update(row);
        await _db.SaveChangesAsync(ct);
        return row;
    }

    public async Task DeleteAsync(int id, CancellationToken ct = default)
    {
        var row = await _db.Repositories.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (row is null)
        {
            return;
        }

        _db.Repositories.Remove(row);
        await _db.SaveChangesAsync(ct);
    }
}
