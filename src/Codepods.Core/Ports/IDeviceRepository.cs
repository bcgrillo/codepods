using Codepods.Core.Domain;

namespace Codepods.Core.Ports;

public interface IDeviceRepository
{
    Task<AuthorizedDevice?> GetAuthorizedAsync(int userId, string fingerprint, CancellationToken ct = default);
    Task<IReadOnlyList<AuthorizedDevice>> ListByUserAsync(int userId, CancellationToken ct = default);
    Task<AuthorizedDevice> AddAsync(AuthorizedDevice device, CancellationToken ct = default);
    Task<AuthorizedDevice> UpdateAsync(AuthorizedDevice device, CancellationToken ct = default);
    Task<bool> RevokeAsync(int userId, string fingerprint, CancellationToken ct = default);
}
