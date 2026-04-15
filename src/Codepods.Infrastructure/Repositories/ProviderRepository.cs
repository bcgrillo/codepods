using Codepods.Core.Domain;
using Codepods.Core.Ports;
using Codepods.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Codepods.Infrastructure.Repositories;

public sealed class ProviderRepository : IProviderRepository
{
    private readonly CodepodsDbContext _db;

    public ProviderRepository(CodepodsDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<Provider>> ListAsync(CancellationToken ct = default)
        => await _db.Providers.AsNoTracking().OrderBy(x => x.Id).ToListAsync(ct);

    public Task<Provider?> GetAsync(int id, CancellationToken ct = default)
        => _db.Providers.FirstOrDefaultAsync(x => x.Id == id, ct);

    public async Task<Provider> AddAsync(Provider row, CancellationToken ct = default)
    {
        _db.Providers.Add(row);
        await _db.SaveChangesAsync(ct);
        return row;
    }

    public async Task<Provider> UpdateAsync(Provider row, CancellationToken ct = default)
    {
        _db.Providers.Update(row);
        await _db.SaveChangesAsync(ct);
        return row;
    }

    public async Task DeleteAsync(int id, CancellationToken ct = default)
    {
        var row = await _db.Providers.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (row is null)
        {
            return;
        }

        _db.Providers.Remove(row);
        await _db.SaveChangesAsync(ct);
    }
}
