using Codepods.Core.Configuration;
using Codepods.Core.Ports;

namespace Codepods.Core.UseCases;

public sealed class SystemConfigUseCase
{
    private readonly CodepodsConfig _config;
    private readonly IWebHostController _webHostController;

    public SystemConfigUseCase(CodepodsConfig config, IWebHostController webHostController)
    {
        _config = config;
        _webHostController = webHostController;
    }

    public SystemConfigView Get()
    {
        return ToView();
    }

    public async Task<SystemConfigMutationResult> UpdateAsync(SystemConfigUpdate update, bool reload, CancellationToken ct = default)
    {
        Apply(update);
        _config.Save();

        WebHostStatus? reloadStatus = null;
        if (reload)
        {
            reloadStatus = await ReloadAsync(ct);
        }

        return new SystemConfigMutationResult(ToView(), reloadStatus);
    }

    public Task<WebHostStatus> ReloadAsync(CancellationToken ct = default)
    {
        var (host, port) = ResolveWebBinding();
        return _webHostController.RestartAsync(host, port, ct);
    }

    private void Apply(SystemConfigUpdate update)
    {
        if (update.Auth is not null)
        {
            if (update.Auth.RequireApprovedDevice.HasValue)
            {
                _config.Auth.RequireApprovedDevice = update.Auth.RequireApprovedDevice.Value;
            }
            if (update.Auth.SessionLifetime.HasValue && update.Auth.SessionLifetime.Value > 0)
            {
                _config.Auth.SessionLifetime = update.Auth.SessionLifetime.Value;
            }
        }

        if (update.Relay is not null)
        {
            if (update.Relay.PortMin.HasValue) _config.Relay.PortMin = update.Relay.PortMin.Value;
            if (update.Relay.PortMax.HasValue) _config.Relay.PortMax = update.Relay.PortMax.Value;
            if (update.Relay.TokenLifetime.HasValue) _config.Relay.TokenLifetime = update.Relay.TokenLifetime.Value;
            if (update.Relay.CookieLifetime.HasValue) _config.Relay.CookieLifetime = update.Relay.CookieLifetime.Value;
            if (update.Relay.CookieName is not null) _config.Relay.CookieName = update.Relay.CookieName.Trim();
        }

        if (update.Web is not null)
        {
            if (update.Web.SwaggerEnabled.HasValue) _config.Web.SwaggerEnabled = update.Web.SwaggerEnabled.Value;
            if (update.Web.PublicDomain is not null) _config.Web.PublicDomain = update.Web.PublicDomain.Trim();
            if (update.Web.BaseUrl is not null) _config.Web.BaseUrl = update.Web.BaseUrl.Trim();
            if (update.Web.CorsOrigins is not null) _config.Web.CorsOrigins = update.Web.CorsOrigins.Trim();
        }

        if (update.Tls is not null)
        {
            if (update.Tls.CertPath is not null) _config.Tls.CertPath = update.Tls.CertPath.Trim();
            if (update.Tls.KeyPath is not null) _config.Tls.KeyPath = update.Tls.KeyPath.Trim();
            if (update.Tls.CertbotEmail is not null) _config.Tls.CertbotEmail = update.Tls.CertbotEmail.Trim();
        }
    }

    private (string Host, int Port) ResolveWebBinding()
    {
        if (!string.IsNullOrWhiteSpace(_config.Web.BaseUrl) && Uri.TryCreate(_config.Web.BaseUrl, UriKind.Absolute, out var uri))
        {
            var port = uri.IsDefaultPort ? 8000 : uri.Port;
            return ("0.0.0.0", port);
        }

        return ("0.0.0.0", 8000);
    }

    private SystemConfigView ToView()
    {
        return new SystemConfigView(
            _config.ConfigPath(),
            new SystemAuthView(_config.Auth.BootstrapUser, _config.Auth.RequireApprovedDevice, _config.Auth.SessionLifetime),
            new SystemRelayView(_config.Relay.PortMin, _config.Relay.PortMax, _config.Relay.TokenLifetime, _config.Relay.CookieLifetime, _config.Relay.CookieName),
            new SystemWebView(_config.Web.PublicDomain, _config.Web.BaseUrl, _config.Web.CorsOrigins, _config.Web.SwaggerEnabled),
            new SystemTlsView(_config.Tls.CertPath, _config.Tls.KeyPath, _config.Tls.CertbotEmail));
    }
}

public sealed record SystemConfigView(
    string ConfigPath,
    SystemAuthView Auth,
    SystemRelayView Relay,
    SystemWebView Web,
    SystemTlsView Tls);

public sealed record SystemAuthView(string BootstrapUser, bool RequireApprovedDevice, int SessionLifetime);
public sealed record SystemRelayView(int PortMin, int PortMax, int TokenLifetime, int CookieLifetime, string CookieName);
public sealed record SystemWebView(string PublicDomain, string BaseUrl, string CorsOrigins, bool SwaggerEnabled);
public sealed record SystemTlsView(string CertPath, string KeyPath, string CertbotEmail);

public sealed record SystemConfigMutationResult(SystemConfigView Config, WebHostStatus? Reload);

public sealed record SystemConfigUpdate(SystemAuthUpdate? Auth, SystemRelayUpdate? Relay, SystemWebUpdate? Web, SystemTlsUpdate? Tls);
public sealed record SystemAuthUpdate(bool? RequireApprovedDevice, int? SessionLifetime);
public sealed record SystemRelayUpdate(int? PortMin, int? PortMax, int? TokenLifetime, int? CookieLifetime, string? CookieName);
public sealed record SystemWebUpdate(string? PublicDomain, string? BaseUrl, string? CorsOrigins, bool? SwaggerEnabled);
public sealed record SystemTlsUpdate(string? CertPath, string? KeyPath, string? CertbotEmail);