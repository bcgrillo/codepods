using Codepods.Core.Domain;
using Codepods.Core.Ports;
using Codepods.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Codepods.Infrastructure.Repositories;

public sealed class UserRepository : IUserRepository
{
    private readonly CodepodsDbContext _db;

    public UserRepository(CodepodsDbContext db)
    {
        _db = db;
    }

    public Task<User?> GetByIdAsync(int userId, CancellationToken ct = default)
        => _db.Users.FirstOrDefaultAsync(x => x.Id == userId, ct);

    public Task<User?> GetByUsernameAsync(string username, CancellationToken ct = default)
        => _db.Users.FirstOrDefaultAsync(x => x.Username == username, ct);

    public async Task<IReadOnlyList<User>> ListAsync(CancellationToken ct = default)
        => await _db.Users.AsNoTracking().OrderBy(x => x.Username).ToListAsync(ct);

    public async Task<User> AddAsync(User user, CancellationToken ct = default)
    {
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);
        return user;
    }

    public async Task<User> UpdateAsync(User user, CancellationToken ct = default)
    {
        _db.Users.Update(user);
        await _db.SaveChangesAsync(ct);
        return user;
    }

    public async Task DeleteByUsernameAsync(string username, CancellationToken ct = default)
    {
        var row = await _db.Users.FirstOrDefaultAsync(x => x.Username == username, ct);
        if (row is null)
        {
            return;
        }

        _db.Users.Remove(row);
        await _db.SaveChangesAsync(ct);
    }
}
