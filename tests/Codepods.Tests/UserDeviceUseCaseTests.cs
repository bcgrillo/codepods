using Codepods.Core.Domain;
using Codepods.Core.Ports;
using Codepods.Core.Security;
using Codepods.Core.UseCases;
using Xunit;

namespace Codepods.Tests;

public sealed class UserDeviceUseCaseTests
{
    [Fact]
    public async Task AddUser_AddDevice_ListAndRemoveDevice_Works()
    {
        var users = new InMemoryUserRepositoryForTests();
        var devices = new InMemoryDeviceRepositoryForTests();
        var useCase = new UserDeviceUseCase(users, devices);

        var user = await useCase.AddUserAsync("admin", "secret", isSuperadmin: true);
        Assert.True(user.IsSuperadmin);
        Assert.NotEqual("secret", user.PasswordHash);

        var enrollment = await useCase.AddDeviceAsync("admin", "Laptop", "device-01", "dev-secret");
        Assert.Equal("admin", enrollment.Username);
        Assert.Equal("device-01", enrollment.DeviceId);
        Assert.Equal(AuthUseCase.DeviceFingerprint("device-01", "dev-secret"), enrollment.Fingerprint);

        var listed = await useCase.ListDevicesAsync("admin");
        Assert.Single(listed);
        Assert.Equal(enrollment.Fingerprint, listed[0].DeviceFingerprint);

        await useCase.RemoveDeviceAsync("admin", "device-01", null, "dev-secret");
        var listedAfter = await useCase.ListDevicesAsync("admin");
        Assert.Empty(listedAfter);
    }
}

file sealed class InMemoryUserRepositoryForTests : IUserRepository
{
    private readonly List<User> _rows = new();
    private int _id = 1;

    public Task<User?> GetByIdAsync(int userId, CancellationToken ct = default)
        => Task.FromResult(_rows.FirstOrDefault(x => x.Id == userId) is { } found ? Clone(found) : null);

    public Task<User?> GetByUsernameAsync(string username, CancellationToken ct = default)
        => Task.FromResult(_rows.FirstOrDefault(x => x.Username == username) is { } found ? Clone(found) : null);

    public Task<IReadOnlyList<User>> ListAsync(CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<User>>(_rows.Select(Clone).ToList());

    public Task<User> AddAsync(User user, CancellationToken ct = default)
    {
        var copy = Clone(user);
        copy.Id = _id++;
        _rows.Add(copy);
        return Task.FromResult(Clone(copy));
    }

    public Task<User> UpdateAsync(User user, CancellationToken ct = default)
    {
        var idx = _rows.FindIndex(x => x.Id == user.Id);
        if (idx < 0)
        {
            throw new InvalidOperationException("User not found");
        }

        _rows[idx] = Clone(user);
        return Task.FromResult(Clone(_rows[idx]));
    }

    public Task DeleteByUsernameAsync(string username, CancellationToken ct = default)
    {
        _rows.RemoveAll(x => string.Equals(x.Username, username, StringComparison.Ordinal));
        return Task.CompletedTask;
    }

    private static User Clone(User row) => new()
    {
        Id = row.Id,
        Username = row.Username,
        PasswordHash = row.PasswordHash,
        IsSuperadmin = row.IsSuperadmin,
        IsActive = row.IsActive,
        CreatedAtUtc = row.CreatedAtUtc,
        UpdatedAtUtc = row.UpdatedAtUtc
    };
}

file sealed class InMemoryDeviceRepositoryForTests : IDeviceRepository
{
    private readonly List<AuthorizedDevice> _rows = new();
    private int _id = 1;

    public Task<AuthorizedDevice?> GetAuthorizedAsync(int userId, string fingerprint, CancellationToken ct = default)
    {
        var found = _rows.FirstOrDefault(x =>
            x.UserId == userId &&
            string.Equals(x.DeviceFingerprint, fingerprint, StringComparison.OrdinalIgnoreCase) &&
            x.RevokedAtUtc is null);
        return Task.FromResult(found is null ? null : Clone(found));
    }

    public Task<IReadOnlyList<AuthorizedDevice>> ListByUserAsync(int userId, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<AuthorizedDevice>>(
            _rows
                .Where(x => x.UserId == userId && x.RevokedAtUtc is null)
                .Select(Clone)
                .ToList());

    public Task<AuthorizedDevice> AddAsync(AuthorizedDevice device, CancellationToken ct = default)
    {
        var copy = Clone(device);
        copy.Id = _id++;
        _rows.Add(copy);
        return Task.FromResult(Clone(copy));
    }

    public Task<AuthorizedDevice> UpdateAsync(AuthorizedDevice device, CancellationToken ct = default)
    {
        var idx = _rows.FindIndex(x => x.Id == device.Id);
        if (idx < 0)
        {
            throw new InvalidOperationException("Device not found");
        }

        _rows[idx] = Clone(device);
        return Task.FromResult(Clone(_rows[idx]));
    }

    public Task<bool> RevokeAsync(int userId, string fingerprint, CancellationToken ct = default)
    {
        var idx = _rows.FindIndex(x =>
            x.UserId == userId &&
            string.Equals(x.DeviceFingerprint, fingerprint, StringComparison.OrdinalIgnoreCase) &&
            x.RevokedAtUtc is null);
        if (idx < 0)
        {
            return Task.FromResult(false);
        }

        _rows[idx].RevokedAtUtc = DateTime.UtcNow;
        return Task.FromResult(true);
    }

    private static AuthorizedDevice Clone(AuthorizedDevice row) => new()
    {
        Id = row.Id,
        UserId = row.UserId,
        Name = row.Name,
        DeviceFingerprint = row.DeviceFingerprint,
        CreatedAtUtc = row.CreatedAtUtc,
        LastSeenAtUtc = row.LastSeenAtUtc,
        RevokedAtUtc = row.RevokedAtUtc
    };
}
