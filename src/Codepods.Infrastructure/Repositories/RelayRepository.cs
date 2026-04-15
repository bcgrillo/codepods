using Codepods.Core.Domain;
using Codepods.Core.Ports;
using Codepods.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Codepods.Infrastructure.Repositories;

public sealed class RelayRepository : IRelayRepository
{
    private readonly CodepodsDbContext _db;

    public RelayRepository(CodepodsDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<RelayBinding>> ListAsync(CancellationToken ct = default)
        => await _db.RelayBindings.AsNoTracking().OrderBy(x => x.Id).ToListAsync(ct);

    public async Task<IReadOnlyList<RelayBinding>> ListByAgentAsync(int agentId, CancellationToken ct = default)
        => await _db.RelayBindings.AsNoTracking()
            .Where(x => x.AgentId == agentId)
            .OrderBy(x => x.Id)
            .ToListAsync(ct);

    public Task<RelayBinding?> GetAsync(int relayId, CancellationToken ct = default)
        => _db.RelayBindings.FirstOrDefaultAsync(x => x.Id == relayId, ct);

    public Task<RelayBinding?> GetByAgentAndKindAsync(int agentId, string serviceKind, CancellationToken ct = default)
        => _db.RelayBindings.FirstOrDefaultAsync(
            x => x.AgentId == agentId && x.ServiceKind == serviceKind,
            ct);

    public async Task<RelayBinding> AddAsync(RelayBinding relay, CancellationToken ct = default)
    {
        _db.RelayBindings.Add(relay);
        await _db.SaveChangesAsync(ct);
        return relay;
    }

    public async Task<RelayBinding> UpdateAsync(RelayBinding relay, CancellationToken ct = default)
    {
        _db.RelayBindings.Update(relay);
        await _db.SaveChangesAsync(ct);
        return relay;
    }

    public async Task DeleteByAgentAsync(int agentId, CancellationToken ct = default)
    {
        var rows = await _db.RelayBindings.Where(x => x.AgentId == agentId).ToListAsync(ct);
        if (rows.Count == 0)
        {
            return;
        }

        _db.RelayBindings.RemoveRange(rows);
        await _db.SaveChangesAsync(ct);
    }
}
