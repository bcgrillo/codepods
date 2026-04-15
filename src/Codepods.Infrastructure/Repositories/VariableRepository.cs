using Codepods.Core.Domain;
using Codepods.Core.Ports;
using Codepods.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Codepods.Infrastructure.Repositories;

public sealed class VariableRepository : IVariableRepository
{
    private readonly CodepodsDbContext _db;

    public VariableRepository(CodepodsDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<Variable>> ListAsync(int? codepodId = null, CancellationToken ct = default)
    {
        var query = _db.Variables.AsNoTracking().AsQueryable();
        if (codepodId.HasValue)
        {
            query = query.Where(x => x.CodepodId == codepodId.Value);
        }

        return await query.OrderBy(x => x.Id).ToListAsync(ct);
    }

    public Task<Variable?> GetAsync(int id, CancellationToken ct = default)
        => _db.Variables.FirstOrDefaultAsync(x => x.Id == id, ct);

    public async Task<Variable> AddAsync(Variable row, CancellationToken ct = default)
    {
        _db.Variables.Add(row);
        await _db.SaveChangesAsync(ct);
        return row;
    }

    public async Task<Variable> UpdateAsync(Variable row, CancellationToken ct = default)
    {
        _db.Variables.Update(row);
        await _db.SaveChangesAsync(ct);
        return row;
    }

    public async Task DeleteAsync(int id, CancellationToken ct = default)
    {
        var row = await _db.Variables.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (row is null)
        {
            return;
        }

        _db.Variables.Remove(row);
        await _db.SaveChangesAsync(ct);
    }
}
