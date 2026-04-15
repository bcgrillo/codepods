namespace Codepods.Core.Ports;

public interface IWebHostController
{
    Task<WebHostStatus> StartAsync(string host, int port, CancellationToken ct = default);
    Task<WebHostStatus> StopAsync(CancellationToken ct = default);
    Task<WebHostStatus> RestartAsync(string host, int port, CancellationToken ct = default);
    Task<WebHostStatus> StatusAsync(CancellationToken ct = default);
}

public sealed record WebHostStatus(bool Running, int? Pid, string? Url, string? LogPath, string Message);
