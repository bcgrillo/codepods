using Codepods.Core.Domain;
using Codepods.Core.Ports;
using Codepods.Core.Security;

namespace Codepods.Core.UseCases;

public sealed class UserDeviceUseCase
{
    private readonly IUserRepository _users;
    private readonly IDeviceRepository _devices;

    public UserDeviceUseCase(IUserRepository users, IDeviceRepository devices)
    {
        _users = users;
        _devices = devices;
    }

    public Task<IReadOnlyList<User>> ListUsersAsync(CancellationToken ct = default) => _users.ListAsync(ct);

    public async Task<User> AddUserAsync(string username, string password, bool isSuperadmin, CancellationToken ct = default)
    {
        var normalized = username.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new InvalidOperationException("username is required");
        }
        if (string.IsNullOrWhiteSpace(password))
        {
            throw new InvalidOperationException("password is required");
        }
        var exists = await _users.GetByUsernameAsync(normalized, ct);
        if (exists is not null)
        {
            throw new InvalidOperationException($"User already exists: {normalized}");
        }

        return await _users.AddAsync(new User
        {
            Username = normalized,
            PasswordHash = PasswordHasher.Hash(password),
            IsSuperadmin = isSuperadmin,
            IsActive = true
        }, ct);
    }

    public Task RemoveUserAsync(string username, CancellationToken ct = default)
        => _users.DeleteByUsernameAsync(username.Trim(), ct);

    public async Task<IReadOnlyList<AuthorizedDevice>> ListDevicesAsync(string username, CancellationToken ct = default)
    {
        var user = await _users.GetByUsernameAsync(username.Trim(), ct) ?? throw new InvalidOperationException("User not found");
        return await _devices.ListByUserAsync(user.Id, ct);
    }

    public async Task<DeviceEnrollment> AddDeviceAsync(string username, string name, string? deviceId, string deviceSecret, CancellationToken ct = default)
    {
        var user = await _users.GetByUsernameAsync(username.Trim(), ct) ?? throw new InvalidOperationException("User not found");
        var normalizedName = name.Trim();
        if (string.IsNullOrWhiteSpace(normalizedName))
        {
            throw new InvalidOperationException("device name is required");
        }

        var resolvedDeviceId = string.IsNullOrWhiteSpace(deviceId)
            ? Guid.NewGuid().ToString("N")
            : deviceId!.Trim();
        var fp = AuthUseCase.DeviceFingerprint(resolvedDeviceId, deviceSecret);
        var existing = await _devices.GetAuthorizedAsync(user.Id, fp, ct);
        if (existing is null)
        {
            await _devices.AddAsync(new AuthorizedDevice
            {
                UserId = user.Id,
                Name = normalizedName,
                DeviceFingerprint = fp,
                CreatedAtUtc = DateTime.UtcNow,
                LastSeenAtUtc = DateTime.UtcNow
            }, ct);
        }
        else
        {
            existing.Name = normalizedName;
            existing.LastSeenAtUtc = DateTime.UtcNow;
            existing.RevokedAtUtc = null;
            await _devices.UpdateAsync(existing, ct);
        }

        return new DeviceEnrollment(user.Username, normalizedName, resolvedDeviceId, fp);
    }

    public async Task RemoveDeviceAsync(string username, string? deviceId, string? fingerprint, string deviceSecret, CancellationToken ct = default)
    {
        var user = await _users.GetByUsernameAsync(username.Trim(), ct) ?? throw new InvalidOperationException("User not found");
        var resolved = string.Empty;
        if (!string.IsNullOrWhiteSpace(fingerprint))
        {
            resolved = fingerprint.Trim().ToLowerInvariant();
        }
        else if (!string.IsNullOrWhiteSpace(deviceId))
        {
            resolved = AuthUseCase.DeviceFingerprint(deviceId.Trim(), deviceSecret);
        }
        else
        {
            throw new InvalidOperationException("device_id or fingerprint is required");
        }

        var removed = await _devices.RevokeAsync(user.Id, resolved, ct);
        if (!removed)
        {
            throw new InvalidOperationException("Device not found");
        }
    }
}

public sealed record DeviceEnrollment(string Username, string Name, string DeviceId, string Fingerprint);
