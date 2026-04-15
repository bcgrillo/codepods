using Codepods.Core.Domain;
using Codepods.Core.Ports;
using Codepods.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Codepods.Infrastructure.Repositories;

public sealed class AgentRepository : IAgentRepository
{
    private readonly CodepodsDbContext _db;

    public AgentRepository(CodepodsDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<Agent>> ListAsync(CancellationToken ct = default)
        => await _db.Agents.AsNoTracking().OrderBy(x => x.Name).ToListAsync(ct);

    public Task<Agent?> GetByIdAsync(int id, CancellationToken ct = default)
        => _db.Agents.FirstOrDefaultAsync(x => x.Id == id, ct);

    public Task<Agent?> GetByNameAsync(string name, CancellationToken ct = default)
        => _db.Agents.FirstOrDefaultAsync(x => x.Name == name, ct);

    public async Task<Agent> AddAsync(Agent agent, CancellationToken ct = default)
    {
        _db.Agents.Add(agent);
        await _db.SaveChangesAsync(ct);
        return agent;
    }

    public async Task<Agent> UpdateAsync(Agent agent, CancellationToken ct = default)
    {
        _db.Agents.Update(agent);
        await _db.SaveChangesAsync(ct);
        return agent;
    }

    public async Task DeleteAsync(int id, CancellationToken ct = default)
    {
        var row = await _db.Agents.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (row is null)
        {
            return;
        }

        _db.Agents.Remove(row);
        await _db.SaveChangesAsync(ct);
    }
}
