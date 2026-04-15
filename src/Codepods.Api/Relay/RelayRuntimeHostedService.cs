using System.Diagnostics;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using Codepods.Core.Security;
using Codepods.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Codepods.Api.Relay;

public sealed class RelayRuntimeHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<RelayRuntimeHostedService> _logger;
    private readonly RelayRuntimeSettings _settings;
    private readonly string _sessionSecret;
    private readonly string _relayCookieName;
    private readonly Dictionary<int, ActiveRelay> _active = new();
    private readonly TimeSpan _reconcileEvery = TimeSpan.FromSeconds(3);
    private X509Certificate2? _certificate;
    private bool _certWarningLogged;

    public RelayRuntimeHostedService(IServiceScopeFactory scopeFactory, ILogger<RelayRuntimeHostedService> logger, RelayRuntimeSettings settings)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _settings = settings;
        _sessionSecret = settings.SessionSecret;
        _relayCookieName = settings.RelayCookieName;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ReconcileAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "relay reconcile failed");
            }

            await Task.Delay(_reconcileEvery, stoppingToken);
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        foreach (var relay in _active.Values)
        {
            relay.Cts.Cancel();
            relay.Listener.Stop();
        }

        _active.Clear();
        await base.StopAsync(cancellationToken);
    }

    private async Task ReconcileAsync(CancellationToken ct)
    {
        List<DesiredRelay> desired;
        using (var scope = _scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CodepodsDbContext>();
            desired = await (
                from relay in db.RelayBindings.AsNoTracking()
                join agent in db.Agents.AsNoTracking() on relay.AgentId equals agent.Id
                where relay.Enabled
                select new DesiredRelay(
                    relay.Id,
                    relay.AgentId,
                    agent.Name,
                    relay.ServiceKind,
                    relay.RelayPort,
                    relay.TargetPort))
                .ToListAsync(ct);
        }

        var desiredIds = desired.Select(x => x.RelayId).ToHashSet();
        foreach (var staleId in _active.Keys.Where(x => !desiredIds.Contains(x)).ToList())
        {
            StopRelay(staleId);
        }

        if (desired.Count == 0)
        {
            return;
        }

        if (!TryLoadCertificate(out var cert))
        {
            return;
        }

        foreach (var row in desired)
        {
            var targetHost = await ResolveContainerIpAsync(row.AgentName, ct);
            if (string.IsNullOrWhiteSpace(targetHost))
            {
                _logger.LogWarning("relay {RelayId}: missing container IP for agent {AgentName}", row.RelayId, row.AgentName);
                continue;
            }

            var desiredState = row with { TargetHost = targetHost };
            if (_active.TryGetValue(row.RelayId, out var running))
            {
                if (running.Target.Equals(desiredState))
                {
                    continue;
                }

                StopRelay(row.RelayId);
            }

            var listener = new TcpListener(System.Net.IPAddress.Any, row.RelayPort);
            listener.Start(100);
            var relayCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            var active = new ActiveRelay(desiredState, listener, relayCts);
            _active[row.RelayId] = active;
            _ = Task.Run(() => AcceptLoopAsync(active, cert, relayCts.Token), relayCts.Token);
            _logger.LogInformation("relay {RelayId} listening on :{RelayPort} -> {TargetHost}:{TargetPort}",
                row.RelayId,
                row.RelayPort,
                desiredState.TargetHost,
                row.TargetPort);
        }
    }

    private bool TryLoadCertificate(out X509Certificate2 cert)
    {
        cert = null!;
        if (_certificate is not null)
        {
            cert = _certificate;
            return true;
        }

        if (TryResolveCertificate(out var certPath, out var keyPath))
        {
            _certificate = X509Certificate2.CreateFromPemFile(certPath, keyPath);
            cert = _certificate;
            _certWarningLogged = false;
            return true;
        }

        if (!_certWarningLogged)
        {
            _logger.LogWarning("relay certificate/key not found; set PUBLIC_DOMAIN or TLS_CERT_PATH/TLS_KEY_PATH");
            _certWarningLogged = true;
        }
        return false;
    }

    private void StopRelay(int relayId)
    {
        if (!_active.TryGetValue(relayId, out var relay))
        {
            return;
        }

        relay.Cts.Cancel();
        relay.Listener.Stop();
        _active.Remove(relayId);
        _logger.LogInformation("relay {RelayId} stopped", relayId);
    }

    private async Task AcceptLoopAsync(ActiveRelay relay, X509Certificate2 cert, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            TcpClient client;
            try
            {
                client = await relay.Listener.AcceptTcpClientAsync(ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception)
            {
                if (!ct.IsCancellationRequested)
                {
                    await Task.Delay(200, ct);
                }

                continue;
            }

            _ = Task.Run(() => HandleClientAsync(client, relay.Target, cert, ct), ct);
        }
    }

    private async Task HandleClientAsync(TcpClient client, DesiredRelay target, X509Certificate2 cert, CancellationToken ct)
    {
        using var _ = client;
        try
        {
            using var tls = new SslStream(client.GetStream(), false);
            await tls.AuthenticateAsServerAsync(new SslServerAuthenticationOptions
            {
                EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
                ServerCertificate = cert,
                ClientCertificateRequired = false
            }, ct);

            var (rawHead, body, headers) = await ReadHeadersAsync(tls, ct);
            if (rawHead is null)
            {
                return;
            }

            if (!IsAuthorized(headers, target))
            {
                await WriteHttpErrorAsync(tls, 401, "Unauthorized", ct);
                return;
            }

            using var upstream = new TcpClient();
            await upstream.ConnectAsync(target.TargetHost, target.TargetPort, ct);
            using var upstreamStream = upstream.GetStream();

            await upstreamStream.WriteAsync(rawHead, ct);
            await upstreamStream.WriteAsync(body, ct);
            await upstreamStream.FlushAsync(ct);

            var toUpstream = PipeAsync(tls, upstreamStream, ct);
            var toClient = PipeAsync(upstreamStream, tls, ct);
            await Task.WhenAny(toUpstream, toClient);
        }
        catch
        {
            // keep relay resilient; request-level failures are expected on dropped clients.
        }
    }

    private async Task<(byte[]? RawHead, byte[] Body, Dictionary<string, string> Headers)> ReadHeadersAsync(Stream stream, CancellationToken ct)
    {
        var buffer = new byte[4096];
        var collected = new List<byte>(8192);
        while (!ct.IsCancellationRequested)
        {
            var read = await stream.ReadAsync(buffer, ct);
            if (read <= 0)
            {
                break;
            }

            collected.AddRange(buffer.AsSpan(0, read).ToArray());
            var markerIdx = FindHeaderMarker(collected);
            if (markerIdx < 0)
            {
                if (collected.Count > 65536)
                {
                    break;
                }

                continue;
            }

            var headBytes = collected.Take(markerIdx + 4).ToArray();
            var bodyBytes = collected.Skip(markerIdx + 4).ToArray();
            var headText = Encoding.UTF8.GetString(headBytes);
            var headers = ParseHeaders(headText);
            return (headBytes, bodyBytes, headers);
        }

        return (null, Array.Empty<byte>(), new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase));
    }

    private bool IsAuthorized(Dictionary<string, string> headers, DesiredRelay target)
    {
        if (!headers.TryGetValue("cookie", out var cookieHeader) || string.IsNullOrWhiteSpace(cookieHeader))
        {
            return false;
        }

        var token = ExtractCookie(cookieHeader, _relayCookieName);
        if (string.IsNullOrWhiteSpace(token))
        {
            return false;
        }
        var normalizedToken = NormalizeRelayCookieToken(token);
        if (string.IsNullOrWhiteSpace(normalizedToken))
        {
            return false;
        }

        Dictionary<string, System.Text.Json.JsonElement> payload;
        try
        {
            payload = TokenCodec.DecodeToken(normalizedToken, _sessionSecret);
        }
        catch
        {
            return false;
        }

        if (!payload.TryGetValue("type", out var typeNode) || !string.Equals(typeNode.GetString(), "relay", StringComparison.Ordinal))
        {
            return false;
        }

        return payload.TryGetValue("relay_id", out var relayIdNode) && relayIdNode.GetInt32() == target.RelayId
            && payload.TryGetValue("agent_id", out var agentIdNode) && agentIdNode.GetInt32() == target.AgentId
            && payload.TryGetValue("relay_port", out var relayPortNode) && relayPortNode.GetInt32() == target.RelayPort
            && payload.TryGetValue("service_kind", out var kindNode) && string.Equals(kindNode.GetString(), target.ServiceKind, StringComparison.OrdinalIgnoreCase);
    }

    private static async Task WriteHttpErrorAsync(Stream stream, int statusCode, string reason, CancellationToken ct)
    {
        var payload = Encoding.ASCII.GetBytes($"HTTP/1.1 {statusCode} {reason}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        await stream.WriteAsync(payload, ct);
        await stream.FlushAsync(ct);
    }

    private static async Task PipeAsync(Stream source, Stream target, CancellationToken ct)
    {
        var buffer = new byte[65536];
        while (!ct.IsCancellationRequested)
        {
            var read = await source.ReadAsync(buffer, ct);
            if (read <= 0)
            {
                break;
            }

            await target.WriteAsync(buffer.AsMemory(0, read), ct);
            await target.FlushAsync(ct);
        }
    }

    private static Dictionary<string, string> ParseHeaders(string headText)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var lines = headText.Split("\r\n");
        foreach (var line in lines.Skip(1))
        {
            var idx = line.IndexOf(':');
            if (idx <= 0)
            {
                continue;
            }

            var key = line[..idx].Trim();
            var value = line[(idx + 1)..].Trim();
            if (!string.IsNullOrWhiteSpace(key))
            {
                result[key] = value;
            }
        }

        return result;
    }

    private static string? ExtractCookie(string cookieHeader, string name)
    {
        foreach (var part in cookieHeader.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var idx = part.IndexOf('=');
            if (idx <= 0)
            {
                continue;
            }

            var key = part[..idx].Trim();
            if (!string.Equals(key, name, StringComparison.Ordinal))
            {
                continue;
            }

            return part[(idx + 1)..].Trim();
        }

        return null;
    }

    private static string NormalizeRelayCookieToken(string token)
    {
        var value = token.Trim().Trim('"');
        if (value.Length == 0)
        {
            return string.Empty;
        }

        // Cookie values can be URL-encoded by framework/client (%2F, %2B, %3D).
        // Decode before token validation.
        try
        {
            value = (WebUtility.UrlDecode(value) ?? value).Trim().Trim('"');
        }
        catch
        {
            // Keep original value if decoding fails unexpectedly.
        }

        return value;
    }

    private static int FindHeaderMarker(List<byte> data)
    {
        for (var i = 0; i <= data.Count - 4; i++)
        {
            if (data[i] == 13 && data[i + 1] == 10 && data[i + 2] == 13 && data[i + 3] == 10)
            {
                return i;
            }
        }

        return -1;
    }

    private static async Task<string?> ResolveContainerIpAsync(string containerName, CancellationToken ct)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "docker",
                Arguments = $"inspect --format \"{{{{.NetworkSettings.IPAddress}}}}\" \"{containerName.Replace("\"", "\\\"", StringComparison.Ordinal)}\"",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };

        process.Start();
        var stdout = await process.StandardOutput.ReadToEndAsync(ct);
        await process.WaitForExitAsync(ct);
        if (process.ExitCode != 0)
        {
            return null;
        }

        var ip = stdout.Trim();
        return string.IsNullOrWhiteSpace(ip) ? null : ip;
    }

    private bool TryResolveCertificate(out string certPath, out string keyPath)
    {
        certPath = string.Empty;
        keyPath = string.Empty;

        var certEnv = _settings.TlsCertPath;
        var keyEnv = _settings.TlsKeyPath;
        if (!string.IsNullOrWhiteSpace(certEnv) && !string.IsNullOrWhiteSpace(keyEnv) && File.Exists(certEnv) && File.Exists(keyEnv))
        {
            certPath = certEnv;
            keyPath = keyEnv;
            return true;
        }

        var publicDomain = ResolvePublicDomain();
        if (string.IsNullOrWhiteSpace(publicDomain))
        {
            return false;
        }

        var candidates = new[]
        {
            (Cert: $"/etc/codepods/certs/{publicDomain}/fullchain.pem", Key: $"/etc/codepods/certs/{publicDomain}/privkey.pem"),
            (Cert: $"/etc/letsencrypt/live/{publicDomain}/fullchain.pem", Key: $"/etc/letsencrypt/live/{publicDomain}/privkey.pem")
        };
        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate.Cert) && File.Exists(candidate.Key))
            {
                certPath = candidate.Cert;
                keyPath = candidate.Key;
                return true;
            }
        }

        return false;
    }

    private string ResolvePublicDomain()
    {
        var env = _settings.PublicDomain;
        if (!string.IsNullOrWhiteSpace(env))
        {
            return env.Trim();
        }

        var baseUrl = _settings.WebBaseUrl;
        if (!string.IsNullOrWhiteSpace(baseUrl) && Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri))
        {
            return uri.Host;
        }

        return TryDiscoverSingleCertDomain();
    }

    private static string TryDiscoverSingleCertDomain()
    {
        var fromCodepods = DiscoverDomainsIn("/etc/codepods/certs");
        if (fromCodepods.Count == 1)
        {
            return fromCodepods[0];
        }

        var fromLetsEncrypt = DiscoverDomainsIn("/etc/letsencrypt/live");
        if (fromLetsEncrypt.Count == 1)
        {
            return fromLetsEncrypt[0];
        }

        return string.Empty;
    }

    private static List<string> DiscoverDomainsIn(string root)
    {
        var result = new List<string>();
        if (!Directory.Exists(root))
        {
            return result;
        }

        foreach (var dir in Directory.GetDirectories(root))
        {
            var domain = Path.GetFileName(dir);
            if (string.IsNullOrWhiteSpace(domain))
            {
                continue;
            }

            var cert = Path.Combine(dir, "fullchain.pem");
            var key = Path.Combine(dir, "privkey.pem");
            if (File.Exists(cert) && File.Exists(key))
            {
                result.Add(domain);
            }
        }

        return result;
    }

    private sealed record DesiredRelay(
        int RelayId,
        int AgentId,
        string AgentName,
        string ServiceKind,
        int RelayPort,
        int TargetPort)
    {
        public string TargetHost { get; init; } = string.Empty;
    }

    private sealed record ActiveRelay(DesiredRelay Target, TcpListener Listener, CancellationTokenSource Cts);
}
