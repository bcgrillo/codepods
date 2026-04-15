using Codepods.Core.Domain;
using Codepods.Core.Ports;
using Codepods.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Codepods.Infrastructure.Repositories;

public sealed class DeviceRepository : IDeviceRepository
{
    private readonly CodepodsDbContext _db;

    public DeviceRepository(CodepodsDbContext db)
    {
        _db = db;
    }

    public Task<AuthorizedDevice?> GetAuthorizedAsync(int userId, string fingerprint, CancellationToken ct = default)
        => _db.AuthorizedDevices.FirstOrDefaultAsync(
            x => x.UserId == userId && x.DeviceFingerprint == fingerprint && x.RevokedAtUtc == null,
            ct);

    public async Task<IReadOnlyList<AuthorizedDevice>> ListByUserAsync(int userId, CancellationToken ct = default)
        => await _db.AuthorizedDevices.AsNoTracking()
            .Where(x => x.UserId == userId && x.RevokedAtUtc == null)
            .OrderBy(x => x.Name)
            .ToListAsync(ct);

    public async Task<AuthorizedDevice> AddAsync(AuthorizedDevice device, CancellationToken ct = default)
    {
        _db.AuthorizedDevices.Add(device);
        await _db.SaveChangesAsync(ct);
        return device;
    }

    public async Task<AuthorizedDevice> UpdateAsync(AuthorizedDevice device, CancellationToken ct = default)
    {
        _db.AuthorizedDevices.Update(device);
        await _db.SaveChangesAsync(ct);
        return device;
    }

    public async Task<bool> RevokeAsync(int userId, string fingerprint, CancellationToken ct = default)
    {
        var row = await _db.AuthorizedDevices.FirstOrDefaultAsync(
            x => x.UserId == userId && x.DeviceFingerprint == fingerprint && x.RevokedAtUtc == null,
            ct);
        if (row is null)
        {
            return false;
        }

        row.RevokedAtUtc = DateTime.UtcNow;
        row.LastSeenAtUtc = DateTime.UtcNow;
        _db.AuthorizedDevices.Update(row);
        await _db.SaveChangesAsync(ct);
        return true;
    }
}
