using Codepods.Core.Domain;
using Codepods.Core.Ports;
using Codepods.Core.Security;

namespace Codepods.Core.UseCases;

public sealed class AuthUseCase
{
    private readonly IUserRepository _users;
    private readonly IDeviceRepository _devices;

    public AuthUseCase(IUserRepository users, IDeviceRepository devices)
    {
        _users = users;
        _devices = devices;
    }

    public async Task EnsureBootstrapAsync(string username, string password, CancellationToken ct = default)
    {
        var existing = await _users.ListAsync(ct);
        if (existing.Count > 0)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(password))
        {
            throw new InvalidOperationException("Bootstrap password is required for first bootstrap.");
        }

        await _users.AddAsync(new User
        {
            Username = username.Trim(),
            PasswordHash = PasswordHasher.Hash(password),
            IsSuperadmin = true,
            IsActive = true
        }, ct);
    }

    public async Task<User> AuthenticateAsync(string username, string password, string? deviceId, bool requireApprovedDevice, string deviceSecret, CancellationToken ct = default)
    {
        var user = await _users.GetByUsernameAsync(username.Trim(), ct);
        if (user is null || !user.IsActive)
        {
            throw new InvalidOperationException("invalid credentials");
        }

        if (!PasswordHasher.Verify(password, user.PasswordHash))
        {
            throw new InvalidOperationException("invalid credentials");
        }

        if (requireApprovedDevice)
        {
            if (string.IsNullOrWhiteSpace(deviceId))
            {
                throw new InvalidOperationException("device_id required");
            }

            var fp = DeviceFingerprint(deviceId, deviceSecret);
            var approved = await _devices.GetAuthorizedAsync(user.Id, fp, ct);
            if (approved is null)
            {
                throw new InvalidOperationException("device not authorized");
            }

            approved.LastSeenAtUtc = DateTime.UtcNow;
            await _devices.UpdateAsync(approved, ct);
        }

        return user;
    }

    public static string DeviceFingerprint(string deviceId, string secret)
    {
        using var hmac = new System.Security.Cryptography.HMACSHA256(System.Text.Encoding.UTF8.GetBytes(secret));
        var bytes = hmac.ComputeHash(System.Text.Encoding.UTF8.GetBytes(deviceId.Trim()));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
