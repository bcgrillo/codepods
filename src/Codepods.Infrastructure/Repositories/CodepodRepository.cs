using Codepods.Core.Domain;
using Codepods.Core.Ports;
using Codepods.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Codepods.Infrastructure.Repositories;

public sealed class CodepodRepository : ICodepodRepository
{
    private readonly CodepodsDbContext _db;

    public CodepodRepository(CodepodsDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<Codepod>> ListAsync(CancellationToken ct = default)
        => await _db.Codepods.AsNoTracking().OrderBy(x => x.Id).ToListAsync(ct);

    public Task<Codepod?> GetAsync(int id, CancellationToken ct = default)
        => _db.Codepods.FirstOrDefaultAsync(x => x.Id == id, ct);

    public async Task<Codepod> AddAsync(Codepod row, CancellationToken ct = default)
    {
        _db.Codepods.Add(row);
        await _db.SaveChangesAsync(ct);
        return row;
    }

    public async Task<Codepod> UpdateAsync(Codepod row, CancellationToken ct = default)
    {
        _db.Codepods.Update(row);
        await _db.SaveChangesAsync(ct);
        return row;
    }

    public async Task DeleteAsync(int id, CancellationToken ct = default)
    {
        var row = await _db.Codepods.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (row is null)
        {
            return;
        }

        _db.Codepods.Remove(row);
        await _db.SaveChangesAsync(ct);
    }
}
