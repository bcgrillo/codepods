namespace Codepods.Core.Configuration;

public sealed class CodepodsConfig
{
    public AppSection App { get; init; } = new();
    public DbSection Db { get; init; } = new();
    public AuthSection Auth { get; init; } = new();
    public RelaySection Relay { get; init; } = new();
    public WebSection Web { get; init; } = new();
    public TlsSection Tls { get; init; } = new();
    public KeysSection Keys { get; init; } = new();

    public static CodepodsConfig Load(string rootPath)
    {
        var normalizedRoot = Path.GetFullPath(rootPath);
        var config = CreateDefaults(normalizedRoot);
        var configPath = Path.Combine(normalizedRoot, "var", "config.toml");
        if (!File.Exists(configPath))
        {
            return config;
        }

        var section = string.Empty;
        foreach (var raw in File.ReadLines(configPath))
        {
            var line = raw.Trim();
            if (string.IsNullOrWhiteSpace(line) || line.StartsWith('#'))
            {
                continue;
            }

            if (line.StartsWith('[') && line.EndsWith(']') && line.Length > 2)
            {
                section = line[1..^1].Trim().ToLowerInvariant();
                continue;
            }

            var eq = line.IndexOf('=');
            if (eq <= 0)
            {
                continue;
            }

            var key = line[..eq].Trim().ToLowerInvariant();
            var value = ParseTomlScalar(line[(eq + 1)..]);
            Apply(config, section, key, value);
        }

        config.App.RootPath = normalizedRoot;
        return config;
    }

    public string ConfigPath()
    {
        return Path.Combine(App.RootPath, "var", "config.toml");
    }

    public void Save()
    {
        var path = ConfigPath();
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrWhiteSpace(dir))
        {
            Directory.CreateDirectory(dir);
        }

        using var writer = new StreamWriter(path, append: false);
        writer.WriteLine("# Managed by Codepods");
        writer.WriteLine();

        writer.WriteLine("[app]");
        writer.WriteLine($"root_path = \"{Escape(App.RootPath)}\"");
        writer.WriteLine($"templates_path = \"{Escape(App.AgentTypesPath)}\"");
        writer.WriteLine($"data_dir = \"{Escape(App.DataDir)}\"");
        writer.WriteLine($"tmp_render_dir = \"{Escape(App.TmpRenderDir)}\"");
        writer.WriteLine();

        writer.WriteLine("[db]");
        writer.WriteLine($"sqlite_path = \"{Escape(Db.SqlitePath)}\"");
        writer.WriteLine();

        writer.WriteLine("[auth]");
        writer.WriteLine($"bootstrap_user = \"{Escape(Auth.BootstrapUser)}\"");
        writer.WriteLine($"bootstrap_password = \"{Escape(Auth.BootstrapPassword)}\"");
        writer.WriteLine($"require_approved_device = {Auth.RequireApprovedDevice.ToString().ToLowerInvariant()}");
        writer.WriteLine($"session_lifetime = {Auth.SessionLifetime}");
        writer.WriteLine();

        writer.WriteLine("[relay]");
        writer.WriteLine($"port_min = {Relay.PortMin}");
        writer.WriteLine($"port_max = {Relay.PortMax}");
        writer.WriteLine($"token_lifetime = {Relay.TokenLifetime}");
        writer.WriteLine($"cookie_lifetime = {Relay.CookieLifetime}");
        writer.WriteLine($"cookie_name = \"{Escape(Relay.CookieName)}\"");
        writer.WriteLine();

        writer.WriteLine("[web]");
        writer.WriteLine($"swagger_enabled = {Web.SwaggerEnabled.ToString().ToLowerInvariant()}");
        if (!string.IsNullOrWhiteSpace(Web.PublicDomain))
        {
            writer.WriteLine($"public_domain = \"{Escape(Web.PublicDomain)}\"");
        }
        if (!string.IsNullOrWhiteSpace(Web.BaseUrl))
        {
            writer.WriteLine($"base_url = \"{Escape(Web.BaseUrl)}\"");
        }
        if (!string.IsNullOrWhiteSpace(Web.CorsOrigins))
        {
            writer.WriteLine($"cors_origins = \"{Escape(Web.CorsOrigins)}\"");
        }
        writer.WriteLine();

        writer.WriteLine("[tls]");
        if (!string.IsNullOrWhiteSpace(Tls.CertPath))
        {
            writer.WriteLine($"cert_path = \"{Escape(Tls.CertPath)}\"");
        }
        if (!string.IsNullOrWhiteSpace(Tls.KeyPath))
        {
            writer.WriteLine($"key_path = \"{Escape(Tls.KeyPath)}\"");
        }
        if (!string.IsNullOrWhiteSpace(Tls.CertbotEmail))
        {
            writer.WriteLine($"certbot_email = \"{Escape(Tls.CertbotEmail)}\"");
        }
        writer.WriteLine();

        writer.WriteLine("[keys]");
        writer.WriteLine($"master_key_path = \"{Escape(Keys.MasterKeyPath)}\"");
    }

    private static CodepodsConfig CreateDefaults(string root)
    {
        return new CodepodsConfig
        {
            App = new AppSection
            {
                RootPath = root,
                AgentTypesPath = Path.Combine(root, "templates"),
                DataDir = Path.Combine(root, "var", "data"),
                TmpRenderDir = Path.Combine(root, "var", "tmp", "codepods")
            },
            Db = new DbSection
            {
                SqlitePath = Path.Combine(root, "var", "codepods.db")
            },
            Auth = new AuthSection
            {
                BootstrapUser = "admin",
                BootstrapPassword = string.Empty,
                RequireApprovedDevice = true,
                SessionLifetime = 86400
            },
            Relay = new RelaySection
            {
                PortMin = 10000,
                PortMax = 10100,
                TokenLifetime = 120,
                CookieLifetime = 14400,
                CookieName = "relay_session"
            },
            Web = new WebSection
            {
                SwaggerEnabled = true
            },
            Tls = new TlsSection(),
            Keys = new KeysSection
            {
                MasterKeyPath = Path.Combine(root, "var", "keys", "master.key")
            }
        };
    }

    private static string ParseTomlScalar(string raw)
    {
        var value = raw.Trim();
        var comment = value.IndexOf('#');
        if (comment >= 0)
        {
            value = value[..comment].Trim();
        }

        if (value.Length >= 2 && value.StartsWith('"') && value.EndsWith('"'))
        {
            value = value[1..^1]
                .Replace("\\\"", "\"")
                .Replace("\\\\", "\\");
        }

        return value;
    }

    private static string Escape(string value)
    {
        return value
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("\"", "\\\"", StringComparison.Ordinal);
    }

    private static void Apply(CodepodsConfig cfg, string section, string key, string value)
    {
        switch (section)
        {
            case "app":
                if (key == "root_path") cfg.App.RootPath = value;
                else if (key == "templates_path") cfg.App.AgentTypesPath = value;
                else if (key == "data_dir") cfg.App.DataDir = value;
                else if (key == "tmp_render_dir") cfg.App.TmpRenderDir = value;
                break;

            case "db":
                if (key == "sqlite_path") cfg.Db.SqlitePath = value;
                break;

            case "auth":
                if (key == "bootstrap_user") cfg.Auth.BootstrapUser = value;
                else if (key == "bootstrap_password") cfg.Auth.BootstrapPassword = value;
                else if (key == "require_approved_device" && bool.TryParse(value, out var requireDevice)) cfg.Auth.RequireApprovedDevice = requireDevice;
                else if (key == "session_lifetime" && int.TryParse(value, out var sessionLifetime)) cfg.Auth.SessionLifetime = sessionLifetime;
                break;

            case "relay":
                if (key == "port_min" && int.TryParse(value, out var min)) cfg.Relay.PortMin = min;
                else if (key == "port_max" && int.TryParse(value, out var max)) cfg.Relay.PortMax = max;
                else if (key == "token_lifetime" && int.TryParse(value, out var tokenTtl)) cfg.Relay.TokenLifetime = tokenTtl;
                else if (key == "cookie_lifetime" && int.TryParse(value, out var cookieTtl)) cfg.Relay.CookieLifetime = cookieTtl;
                else if (key == "cookie_name") cfg.Relay.CookieName = value;
                break;

            case "web":
                if (key == "base_url") cfg.Web.BaseUrl = value;
                else if (key == "public_domain") cfg.Web.PublicDomain = value;
                else if (key == "cors_origins") cfg.Web.CorsOrigins = value;
                else if (key == "swagger_enabled" && bool.TryParse(value, out var swagger)) cfg.Web.SwaggerEnabled = swagger;
                break;

            case "tls":
                if (key == "cert_path") cfg.Tls.CertPath = value;
                else if (key == "key_path") cfg.Tls.KeyPath = value;
                else if (key == "certbot_email") cfg.Tls.CertbotEmail = value;
                break;

            case "keys":
                if (key == "master_key_path") cfg.Keys.MasterKeyPath = value;
                break;
        }
    }
}

public sealed class AppSection
{
    public string RootPath { get; set; } = string.Empty;
    public string AgentTypesPath { get; set; } = string.Empty;
    public string DataDir { get; set; } = string.Empty;
    public string TmpRenderDir { get; set; } = string.Empty;
}

public sealed class DbSection
{
    public string SqlitePath { get; set; } = string.Empty;
}

public sealed class AuthSection
{
    public string BootstrapUser { get; set; } = "admin";
    public string BootstrapPassword { get; set; } = string.Empty;
    public bool RequireApprovedDevice { get; set; } = true;
    public int SessionLifetime { get; set; } = 86400;
}

public sealed class RelaySection
{
    public int PortMin { get; set; } = 10000;
    public int PortMax { get; set; } = 10100;
    public int TokenLifetime { get; set; } = 120;
    public int CookieLifetime { get; set; } = 14400;
    public string CookieName { get; set; } = "relay_session";
}

public sealed class WebSection
{
    public string BaseUrl { get; set; } = string.Empty;
    public string PublicDomain { get; set; } = string.Empty;
    public string CorsOrigins { get; set; } = string.Empty;
    public bool SwaggerEnabled { get; set; } = true;
}

public sealed class TlsSection
{
    public string CertPath { get; set; } = string.Empty;
    public string KeyPath { get; set; } = string.Empty;
    public string CertbotEmail { get; set; } = string.Empty;
}

public sealed class KeysSection
{
    public string MasterKeyPath { get; set; } = string.Empty;
}
