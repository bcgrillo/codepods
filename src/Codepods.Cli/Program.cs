using Codepods.Core;
using Codepods.Core.Configuration;
using Codepods.Core.Ports;
using Codepods.Core.Security;
using Codepods.Core.UseCases;
using Codepods.Infrastructure;
using Codepods.Infrastructure.Persistence;
using Codepods.Runtime;
using Microsoft.Extensions.DependencyInjection;
using System.Diagnostics;
using System.Text.Json;

var services = new ServiceCollection();
var argv = args.Select(x => x.Trim()).Where(x => !string.IsNullOrWhiteSpace(x)).ToArray();
var root = ResolveRootPath();
var config = CodepodsConfig.Load(root);
CliDisplayContext.BuildVersion = ResolveBuildVersion(root);
SystemSecrets.Initialize(config.App.RootPath, config.Keys.MasterKeyPath);
var sessionSecret = SystemSecrets.DeriveSecretString("session-signing");
var deviceSecret = SystemSecrets.DeriveSecretString("device-fingerprint");

var sqlitePath = config.Db.SqlitePath;
Directory.CreateDirectory(Path.GetDirectoryName(sqlitePath)!);
var agentTypesRoot = config.App.AgentTypesPath;

services
    .AddCodepodsCore()
    .AddCodepodsRuntime(config)
    .AddCodepodsInfrastructure(sqlitePath, config.Relay.PortMin, config.Relay.PortMax);
services.AddSingleton(config);

using var provider = services.BuildServiceProvider();
using var scope = provider.CreateScope();
CliDisplayContext.WebStatus = await ResolveWebStatusAsync(scope.ServiceProvider);
if (argv.Length == 0 || argv[0] is "--help" or "-h" or "help")
{
    PrintHelp();
    return;
}

var db = scope.ServiceProvider.GetRequiredService<CodepodsDbContext>();
await db.Database.EnsureCreatedAsync();

try
{
    switch (argv[0].ToLowerInvariant())
    {
        case "agents":
            await RunAgentsAsync(argv.Skip(1).ToArray(), scope.ServiceProvider);
            break;
        case "relays":
            await RunRelaysAsync(argv.Skip(1).ToArray(), scope.ServiceProvider, sessionSecret, config);
            break;
        case "auth":
            await RunAuthAsync(argv.Skip(1).ToArray(), scope.ServiceProvider, root, sessionSecret, deviceSecret, config);
            break;
        case "menu":
            await RunMenuAsync(scope.ServiceProvider, agentTypesRoot);
            break;
        case "web":
            await RunWebAsync(argv.Skip(1).ToArray(), scope.ServiceProvider, root, sessionSecret, deviceSecret, config);
            break;
        case "providers":
            await RunProvidersAsync(argv.Skip(1).ToArray(), scope.ServiceProvider);
            break;
        case "repositories":
            await RunRepositoriesAsync(argv.Skip(1).ToArray(), scope.ServiceProvider);
            break;
        case "codepods":
            await RunCodepodsAsync(argv.Skip(1).ToArray(), scope.ServiceProvider);
            break;
        case "variables":
            await RunVariablesAsync(argv.Skip(1).ToArray(), scope.ServiceProvider);
            break;
        case "agent-files":
            RunAgentFiles(argv.Skip(1).ToArray(), scope.ServiceProvider);
            break;
        default:
            WriteError($"Unknown command: {argv[0]}");
            PrintHelp();
            Environment.ExitCode = 2;
            break;
    }
}
catch (Exception ex)
{
    WriteError($"Failed: {BuildExceptionSummary(ex)}");
    Environment.ExitCode = 1;
}

static string Paint(string text, string ansiCode)
{
    if (!CliDisplayContext.UseColor)
    {
        return text;
    }

    return $"\u001b[{ansiCode}m{text}\u001b[0m";
}

static void WriteInfo(string message) => Console.WriteLine(Paint(message, "36"));
static void WriteWarn(string message) => Console.WriteLine(Paint(message, "33"));
static void WriteError(string message) => Console.Error.WriteLine(Paint(message, "31"));
static void WriteSuccess(string message) => Console.WriteLine(Paint(message, "32"));

static void PrintHeader(string title, bool webOnly = false)
{
    const int innerWidth = 60;
    const int contentWidth = innerWidth - 2;
    var version = CliDisplayContext.BuildVersion;
    var webStatus = CliDisplayContext.WebStatus;
    var webStatusText = string.Equals(webStatus, "running", StringComparison.OrdinalIgnoreCase)
        ? Paint("running", "32")
        : Paint("stopped", "31");

    Console.WriteLine(Paint("╭────────────────────────────────────────────────────────────╮", "90"));
    var availableTitleWidth = Math.Max(6, contentWidth - version.Length - 1);
    var titleText = title.Length > availableTitleWidth ? FitText(title, availableTitleWidth) : title;
    var titlePadding = new string(' ', Math.Max(1, contentWidth - titleText.Length - version.Length));
    WriteBoxLine($"{Paint(titleText, "1;37")}{titlePadding}{Paint(version, "90")}", $"{titleText}{titlePadding}{version}", innerWidth);

    var webPlain = $"Web: {webStatus}";
    var webColored = $"Web: {webStatusText}";
    WriteBoxLine(webColored, webPlain, innerWidth);
    Console.WriteLine(Paint("╰────────────────────────────────────────────────────────────╯", "90"));
    if (!webOnly)
    {
        Console.WriteLine();
    }
}

static void WriteBoxLine(string coloredContent, string plainContent, int innerWidth)
{
    var plain = plainContent;
    var colored = coloredContent;
    var maxContentWidth = innerWidth - 2;
    if (plain.Length > maxContentWidth)
    {
        plain = FitText(plain, maxContentWidth);
        colored = plain;
    }

    var padding = new string(' ', Math.Max(0, maxContentWidth - plain.Length));
    Console.WriteLine($"{Paint("│", "90")} {colored}{padding} {Paint("│", "90")}");
}

static string BuildExceptionSummary(Exception ex)
{
    var parts = new List<string>();
    for (var current = ex; current is not null; current = current.InnerException)
    {
        if (!string.IsNullOrWhiteSpace(current.Message))
        {
            parts.Add(current.Message.Trim());
        }
    }

    return parts.Count == 0 ? ex.GetType().Name : string.Join(" | ", parts.Distinct(StringComparer.Ordinal));
}

static async Task<string> ResolveWebStatusAsync(IServiceProvider sp)
{
    try
    {
        var controller = sp.GetRequiredService<IWebHostController>();
        var status = await controller.StatusAsync();
        return status.Running ? "running" : "stopped";
    }
    catch
    {
        return "unknown";
    }
}

static async Task RunAgentsAsync(string[] argv, IServiceProvider sp)
{
    var useCase = sp.GetRequiredService<AgentUseCase>();
    if (argv.Length == 0 || argv[0].Equals("list", StringComparison.OrdinalIgnoreCase))
    {
        var rows = await useCase.ListAsync();
        foreach (var row in rows)
        {
            Console.WriteLine($"{row.Id}\t{row.Name}\t{row.AgentType}\t{row.Status}\t{row.RuntimeStatus}");
        }
        return;
    }

    if (argv[0].Equals("create", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 2)
        {
            throw new InvalidOperationException("Usage: codepods agents create <type> [name] [restore:true|false]");
        }
        var agentType = argv[1];
        var name = argv.Length >= 3 ? argv[2] : null;
        var restore = argv.Length >= 4 && bool.TryParse(argv[3], out var parsed) && parsed;
        var created = await useCase.CreateAsync(name, agentType, null, restore);
        Console.WriteLine($"created\t{created.Id}\t{created.Name}\t{created.AgentType}");
        return;
    }

    if (argv[0].Equals("types", StringComparison.OrdinalIgnoreCase))
    {
        foreach (var row in useCase.ListTypes())
        {
            Console.WriteLine($"{row.Name}\t{row.Description}\t{row.Image}");
        }
        return;
    }

    if (argv[0].Equals("next-name", StringComparison.OrdinalIgnoreCase))
    {
        Console.WriteLine(await useCase.NextNameAsync());
        return;
    }

    if (argv[0].Equals("trash", StringComparison.OrdinalIgnoreCase))
    {
        foreach (var row in await useCase.ListTrashAsync())
        {
            Console.WriteLine(row);
        }
        return;
    }

    if (argv[0].Equals("wake", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 2 || !int.TryParse(argv[1], out var agentId))
        {
            throw new InvalidOperationException("Usage: codepods agents wake <agentId>");
        }

        var row = await useCase.WakeAsync(agentId);
        Console.WriteLine($"woke\t{row.Id}\t{row.Name}\t{row.Status}");
        return;
    }

    if (argv[0].Equals("sleep", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 2 || !int.TryParse(argv[1], out var agentId))
        {
            throw new InvalidOperationException("Usage: codepods agents sleep <agentId>");
        }

        var row = await useCase.SleepAsync(agentId);
        Console.WriteLine($"slept\t{row.Id}\t{row.Name}\t{row.Status}");
        return;
    }

    if (argv[0].Equals("remove", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 2 || !int.TryParse(argv[1], out var agentId))
        {
            throw new InvalidOperationException("Usage: codepods agents remove <agentId>");
        }

        await useCase.RemoveAsync(agentId);
        Console.WriteLine($"removed\t{agentId}");
        return;
    }

    throw new InvalidOperationException($"Unknown agents subcommand: {argv[0]}");
}

static async Task RunRelaysAsync(string[] argv, IServiceProvider sp, string sessionSecret, CodepodsConfig config)
{
    var useCase = sp.GetRequiredService<RelayUseCase>();
    if (argv.Length == 0 || argv[0].Equals("list", StringComparison.OrdinalIgnoreCase))
    {
        var showAll = argv.Length >= 2 && argv[1].Equals("--all", StringComparison.OrdinalIgnoreCase);
        var rows = await useCase.ListAsync();
        if (!showAll)
        {
            rows = rows.Where(x => x.Enabled).ToList();
        }
        foreach (var row in rows)
        {
            Console.WriteLine($"{row.Id}\t{row.AgentId}\t{row.ServiceKind}\t{row.TargetPort}\t{row.RelayPort}\t{row.Enabled}");
        }
        return;
    }

    if (argv[0].Equals("ensure", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 3 || !int.TryParse(argv[1], out var agentId))
        {
            throw new InvalidOperationException("Usage: codepods relays ensure <agentId> <serviceKind>");
        }
        var relay = await useCase.EnsureAsync(agentId, argv[2]);
        Console.WriteLine($"relay\t{relay.Id}\t{relay.AgentId}\t{relay.ServiceKind}\t{relay.TargetPort}\t{relay.RelayPort}");
        return;
    }

    if (argv[0].Equals("remove", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 2 || !int.TryParse(argv[1], out var relayId))
        {
            throw new InvalidOperationException("Usage: codepods relays remove <relayId>");
        }
        var relay = await useCase.DisableAsync(relayId);
        Console.WriteLine($"disabled\t{relay.Id}");
        return;
    }

    if (argv[0].Equals("token", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 2 || !int.TryParse(argv[1], out var relayId))
        {
            throw new InvalidOperationException("Usage: codepods relays token <relayId> [username]");
        }

        var username = argv.Length >= 3 ? argv[2] : config.Auth.BootstrapUser;
        var userRepo = sp.GetRequiredService<Codepods.Core.Ports.IUserRepository>();
        var user = await userRepo.GetByUsernameAsync(username) ?? throw new InvalidOperationException($"User not found: {username}");
        var relay = (await useCase.ListAsync()).FirstOrDefault(x => x.Id == relayId && x.Enabled)
            ?? throw new InvalidOperationException($"Relay not found: {relayId}");

        var ttl = config.Relay.TokenLifetime;
        var payload = new Dictionary<string, object?>
        {
            ["type"] = "relay",
            ["uid"] = user.Id,
            ["relay_id"] = relay.Id,
            ["agent_id"] = relay.AgentId,
            ["service_kind"] = relay.ServiceKind,
            ["relay_port"] = relay.RelayPort,
            ["exp"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds() + ttl
        };
        var token = TokenCodec.CreateToken(payload, sessionSecret);
        var publicDomain = !string.IsNullOrWhiteSpace(config.Web.PublicDomain) ? config.Web.PublicDomain : "localhost";
        var baseUrl = !string.IsNullOrWhiteSpace(config.Web.BaseUrl) ? config.Web.BaseUrl : $"https://{publicDomain}:8000";
        Console.WriteLine($"relay_id\t{relay.Id}");
        Console.WriteLine($"relay_port\t{relay.RelayPort}");
        Console.WriteLine($"expires_in\t{ttl}");
        Console.WriteLine($"token\t{token}");
        Console.WriteLine($"bootstrap\t{baseUrl.TrimEnd('/')}/relay/?relay_token={token}");
        Console.WriteLine($"relay\thttps://{publicDomain}:{relay.RelayPort}/");
        return;
    }

    throw new InvalidOperationException($"Unknown relays subcommand: {argv[0]}");
}

static async Task RunAuthAsync(string[] argv, IServiceProvider sp, string rootPath, string sessionSecret, string deviceSecret, CodepodsConfig config)
{
    var authUseCase = sp.GetRequiredService<AuthUseCase>();
    var userRepo = sp.GetRequiredService<Codepods.Core.Ports.IUserRepository>();
    var bootstrapUser = config.Auth.BootstrapUser;
    var bootstrapPassword = config.Auth.BootstrapPassword;
    await authUseCase.EnsureBootstrapAsync(bootstrapUser, bootstrapPassword);

    if (argv.Length == 0 || argv[0].Equals("login", StringComparison.OrdinalIgnoreCase))
    {
        var username = argv.Length >= 2 ? argv[1] : bootstrapUser;
        var password = argv.Length >= 3 ? argv[2] : bootstrapPassword;
        var deviceId = argv.Length >= 4 ? argv[3] : string.Empty;

        var requireApprovedDevice = config.Auth.RequireApprovedDevice;

        var user = await authUseCase.AuthenticateAsync(username, password, deviceId, requireApprovedDevice, deviceSecret);
        var ttl = config.Auth.SessionLifetime;
        var payload = new Dictionary<string, object?>
        {
            ["uid"] = user.Id,
            ["user"] = user.Username,
            ["superadmin"] = user.IsSuperadmin,
            ["device"] = deviceId,
            ["exp"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds() + ttl
        };
        var token = TokenCodec.CreateToken(payload, sessionSecret);
        var tokenPath = Path.Combine(rootPath, "var", "codepods-web.token");
        Directory.CreateDirectory(Path.GetDirectoryName(tokenPath)!);
        await File.WriteAllTextAsync(tokenPath, token);
        Console.WriteLine($"token_saved\t{tokenPath}");
        Console.WriteLine($"bearer\t{token}");
        return;
    }

    if (argv[0].Equals("me", StringComparison.OrdinalIgnoreCase))
    {
        var username = argv.Length >= 2 ? argv[1] : bootstrapUser;
        var user = await userRepo.GetByUsernameAsync(username) ?? throw new InvalidOperationException($"User not found: {username}");
        Console.WriteLine($"id\t{user.Id}");
        Console.WriteLine($"username\t{user.Username}");
        Console.WriteLine($"superadmin\t{user.IsSuperadmin}");
        Console.WriteLine($"active\t{user.IsActive}");
        return;
    }

    throw new InvalidOperationException($"Unknown auth subcommand: {argv[0]}");
}

static async Task RunProvidersAsync(string[] argv, IServiceProvider sp)
{
    var useCase = sp.GetRequiredService<ProviderUseCase>();
    if (argv.Length == 0 || argv[0].Equals("list", StringComparison.OrdinalIgnoreCase))
    {
        var rows = await useCase.ListAsync();
        foreach (var row in rows)
        {
            Console.WriteLine($"{row.Id}\t{row.Name}\t{row.ProviderType}\t{row.ConfigurationJson}");
        }
        return;
    }

    if (argv[0].Equals("create", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 4)
        {
            throw new InvalidOperationException("Usage: codepods providers create <name> <providerType> <configurationJson>");
        }
        var row = await useCase.CreateAsync(argv[1], argv[2], argv[3]);
        Console.WriteLine($"created\t{row.Id}\t{row.Name}\t{row.ProviderType}");
        return;
    }

    if (argv[0].Equals("delete", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 2 || !int.TryParse(argv[1], out var id))
        {
            throw new InvalidOperationException("Usage: codepods providers delete <id>");
        }
        await useCase.DeleteAsync(id);
        Console.WriteLine($"deleted\t{id}");
        return;
    }

    throw new InvalidOperationException($"Unknown providers subcommand: {argv[0]}");
}

static async Task RunRepositoriesAsync(string[] argv, IServiceProvider sp)
{
    var useCase = sp.GetRequiredService<RepositoryUseCase>();
    if (argv.Length == 0 || argv[0].Equals("list", StringComparison.OrdinalIgnoreCase))
    {
        var rows = await useCase.ListAsync();
        foreach (var row in rows)
        {
            Console.WriteLine($"{row.Id}\t{row.Name}\t{row.Url}\t{row.Description}");
        }
        return;
    }

    if (argv[0].Equals("create", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 3)
        {
            throw new InvalidOperationException("Usage: codepods repositories create <name> <url> [description]");
        }
        var row = await useCase.CreateAsync(argv[1], argv[2], argv.Length >= 4 ? argv[3] : null);
        Console.WriteLine($"created\t{row.Id}\t{row.Name}");
        return;
    }

    if (argv[0].Equals("delete", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 2 || !int.TryParse(argv[1], out var id))
        {
            throw new InvalidOperationException("Usage: codepods repositories delete <id>");
        }
        await useCase.DeleteAsync(id);
        Console.WriteLine($"deleted\t{id}");
        return;
    }

    throw new InvalidOperationException($"Unknown repositories subcommand: {argv[0]}");
}

static async Task RunCodepodsAsync(string[] argv, IServiceProvider sp)
{
    var useCase = sp.GetRequiredService<CodepodUseCase>();
    if (argv.Length == 0 || argv[0].Equals("list", StringComparison.OrdinalIgnoreCase))
    {
        var rows = await useCase.ListAsync();
        foreach (var row in rows)
        {
            Console.WriteLine($"{row.Id}\t{row.Name}\t{row.Description}");
        }
        return;
    }

    if (argv[0].Equals("create", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 2)
        {
            throw new InvalidOperationException("Usage: codepods codepods create <name> [description]");
        }
        var row = await useCase.CreateAsync(argv[1], argv.Length >= 3 ? argv[2] : null);
        Console.WriteLine($"created\t{row.Id}\t{row.Name}");
        return;
    }

    if (argv[0].Equals("delete", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 2 || !int.TryParse(argv[1], out var id))
        {
            throw new InvalidOperationException("Usage: codepods codepods delete <id>");
        }
        await useCase.DeleteAsync(id);
        Console.WriteLine($"deleted\t{id}");
        return;
    }

    throw new InvalidOperationException($"Unknown codepods subcommand: {argv[0]}");
}

static async Task RunVariablesAsync(string[] argv, IServiceProvider sp)
{
    var useCase = sp.GetRequiredService<VariableUseCase>();
    if (argv.Length == 0 || argv[0].Equals("list", StringComparison.OrdinalIgnoreCase))
    {
        int? codepodId = null;
        if (argv.Length >= 2 && int.TryParse(argv[1], out var parsed))
        {
            codepodId = parsed;
        }
        var rows = await useCase.ListAsync(codepodId);
        foreach (var row in rows)
        {
            Console.WriteLine($"{row.Id}\t{row.Name}\t{row.Value}\t{row.IsSecret}\t{row.CodepodId}");
        }
        return;
    }

    if (argv[0].Equals("create", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 4 || !bool.TryParse(argv[3], out var isSecret))
        {
            throw new InvalidOperationException("Usage: codepods variables create <name> <value> <isSecret:true|false> [codepodId]");
        }
        int? codepodId = null;
        if (argv.Length >= 5 && int.TryParse(argv[4], out var cp))
        {
            codepodId = cp;
        }
        var row = await useCase.CreateAsync(argv[1], argv[2], isSecret, codepodId);
        Console.WriteLine($"created\t{row.Id}\t{row.Name}");
        return;
    }

    if (argv[0].Equals("delete", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 2 || !int.TryParse(argv[1], out var id))
        {
            throw new InvalidOperationException("Usage: codepods variables delete <id>");
        }
        await useCase.DeleteAsync(id);
        Console.WriteLine($"deleted\t{id}");
        return;
    }

    throw new InvalidOperationException($"Unknown variables subcommand: {argv[0]}");
}

static void RunAgentFiles(string[] argv, IServiceProvider sp)
{
    var useCase = sp.GetRequiredService<AgentFileUseCase>();
    if (argv.Length < 3)
    {
        throw new InvalidOperationException("Usage: codepods agent-files <read|write> <agentType> <fileName> [content]");
    }

    if (argv[0].Equals("read", StringComparison.OrdinalIgnoreCase))
    {
        Console.WriteLine(useCase.ReadText(argv[1], argv[2]));
        return;
    }

    if (argv[0].Equals("write", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 4)
        {
            throw new InvalidOperationException("Usage: codepods agent-files write <agentType> <fileName> <content>");
        }
        useCase.Write(argv[1], argv[2], System.Text.Encoding.UTF8.GetBytes(argv[3]));
        Console.WriteLine("updated");
        return;
    }

    throw new InvalidOperationException($"Unknown agent-files subcommand: {argv[0]}");
}

static async Task RunWebAsync(string[] argv, IServiceProvider sp, string rootPath, string sessionSecret, string deviceSecret, CodepodsConfig config)
{
    if (argv.Length == 0)
    {
        PrintWebHelp();
        return;
    }

    switch (argv[0].ToLowerInvariant())
    {
        case "start":
            await RunWebStartAsync(argv.Skip(1).ToArray(), sp);
            return;
        case "stop":
            await RunWebStopAsync(sp);
            return;
        case "status":
            await RunWebStatusAsync(sp);
            return;
        case "restart":
            await RunWebRestartAsync(argv.Skip(1).ToArray(), sp);
            return;
        case "reload":
        case "reload-config":
            await RunWebReloadAsync(sp);
            return;
        case "login":
            await RunAuthAsync(new[] { "login" }.Concat(argv.Skip(1)).ToArray(), sp, rootPath, sessionSecret, deviceSecret, config);
            return;
        case "relays":
            await RunRelaysAsync(argv.Skip(1).ToArray(), sp, sessionSecret, config);
            return;
        case "users":
            await RunWebUsersAsync(argv.Skip(1).ToArray(), sp);
            return;
        case "devices":
            await RunWebDevicesAsync(argv.Skip(1).ToArray(), sp, deviceSecret);
            return;
        default:
            WriteError($"Unknown web subcommand: {argv[0]}");
            PrintWebHelp();
            Environment.ExitCode = 2;
            return;
    }
}

static async Task RunWebStartAsync(string[] argv, IServiceProvider sp)
{
    var host = argv.Length >= 1 ? argv[0].Trim() : "0.0.0.0";
    var port = (argv.Length >= 2 && int.TryParse(argv[1], out var parsed)) ? parsed : 8000;
    var controller = sp.GetRequiredService<IWebHostController>();
    var status = await controller.StartAsync(host, port);
    if (status.Running)
    {
        CliDisplayContext.WebStatus = "running";
        WriteSuccess($"web_started\tpid={status.Pid}\t{status.Url}");
    }
    else
    {
        CliDisplayContext.WebStatus = "stopped";
        WriteError($"web_failed\tlog={status.LogPath}");
    }
}

static async Task RunWebStopAsync(IServiceProvider sp)
{
    var controller = sp.GetRequiredService<IWebHostController>();
    var status = await controller.StopAsync();
    CliDisplayContext.WebStatus = "stopped";
    WriteWarn($"web_{status.Message}");
}

static async Task RunWebStatusAsync(IServiceProvider sp)
{
    var controller = sp.GetRequiredService<IWebHostController>();
    var status = await controller.StatusAsync();
    if (!status.Running)
    {
        CliDisplayContext.WebStatus = "stopped";
        WriteWarn("web_status\tstopped");
        return;
    }

    CliDisplayContext.WebStatus = "running";
    WriteSuccess($"web_status\trunning\tpid={status.Pid}");
}

static async Task RunWebRestartAsync(string[] argv, IServiceProvider sp)
{
    var host = argv.Length >= 1 ? argv[0].Trim() : "0.0.0.0";
    var port = (argv.Length >= 2 && int.TryParse(argv[1], out var parsed)) ? parsed : 8000;
    var controller = sp.GetRequiredService<IWebHostController>();
    var status = await controller.RestartAsync(host, port);
    if (status.Running)
    {
        CliDisplayContext.WebStatus = "running";
        WriteSuccess($"web_restarted\tpid={status.Pid}\t{status.Url}");
    }
    else
    {
        CliDisplayContext.WebStatus = "stopped";
        WriteError($"web_failed\tlog={status.LogPath}");
    }
}

static async Task RunWebReloadAsync(IServiceProvider sp)
{
    var useCase = sp.GetRequiredService<SystemConfigUseCase>();
    var status = await useCase.ReloadAsync();
    if (status.Running)
    {
        CliDisplayContext.WebStatus = "running";
        WriteSuccess($"web_reloaded\tpid={status.Pid}\t{status.Url}");
        return;
    }

    CliDisplayContext.WebStatus = "stopped";
    WriteError($"web_reload_failed\tlog={status.LogPath}");
}

static async Task RunWebUsersAsync(string[] argv, IServiceProvider sp)
{
    var useCase = sp.GetRequiredService<UserDeviceUseCase>();
    if (argv.Length == 0 || argv[0].Equals("list", StringComparison.OrdinalIgnoreCase))
    {
        var rows = await useCase.ListUsersAsync();
        foreach (var row in rows)
        {
            Console.WriteLine($"{row.Username}\t{row.IsSuperadmin}\t{row.IsActive}");
        }
        return;
    }

    if (argv[0].Equals("add", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 3)
        {
            throw new InvalidOperationException("Usage: codepods web users add <username> <password> [superadmin:true|false]");
        }
        var superadmin = argv.Length >= 4 && bool.TryParse(argv[3], out var parsed) && parsed;
        var row = await useCase.AddUserAsync(argv[1], argv[2], superadmin);
        Console.WriteLine($"created\t{row.Username}\tsuperadmin={row.IsSuperadmin}");
        return;
    }

    if (argv[0].Equals("remove", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 2)
        {
            throw new InvalidOperationException("Usage: codepods web users remove <username>");
        }
        await useCase.RemoveUserAsync(argv[1]);
        Console.WriteLine($"removed\t{argv[1]}");
        return;
    }

    throw new InvalidOperationException($"Unknown web users subcommand: {argv[0]}");
}

static async Task RunWebDevicesAsync(string[] argv, IServiceProvider sp, string deviceSecret)
{
    var useCase = sp.GetRequiredService<UserDeviceUseCase>();

    if (argv.Length == 0 || argv[0].Equals("list", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 2)
        {
            throw new InvalidOperationException("Usage: codepods web devices list <username>");
        }
        var rows = await useCase.ListDevicesAsync(argv[1]);
        foreach (var row in rows)
        {
            Console.WriteLine($"{row.Name}\t{row.DeviceFingerprint}\t{row.LastSeenAtUtc:O}");
        }
        return;
    }

    if (argv[0].Equals("add", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 3)
        {
            throw new InvalidOperationException("Usage: codepods web devices add <username> <deviceName> [deviceId]");
        }
        var enrollment = await useCase.AddDeviceAsync(argv[1], argv[2], argv.Length >= 4 ? argv[3] : null, deviceSecret);
        Console.WriteLine($"username\t{enrollment.Username}");
        Console.WriteLine($"name\t{enrollment.Name}");
        Console.WriteLine($"fingerprint\t{enrollment.Fingerprint}");
        Console.WriteLine($"device_id\t{enrollment.DeviceId}");
        return;
    }

    if (argv[0].Equals("remove", StringComparison.OrdinalIgnoreCase))
    {
        if (argv.Length < 3)
        {
            throw new InvalidOperationException("Usage: codepods web devices remove <username> <deviceId|fingerprint> [mode:fingerprint|device_id]");
        }

        var mode = argv.Length >= 4 ? argv[3].Trim().ToLowerInvariant() : "device_id";
        if (mode == "fingerprint")
        {
            await useCase.RemoveDeviceAsync(argv[1], null, argv[2], deviceSecret);
        }
        else
        {
            await useCase.RemoveDeviceAsync(argv[1], argv[2], null, deviceSecret);
        }
        Console.WriteLine($"removed\t{argv[1]}\t{argv[2]}");
        return;
    }

    throw new InvalidOperationException($"Unknown web devices subcommand: {argv[0]}");
}

static async Task RunMenuAsync(IServiceProvider sp, string agentTypesRoot)
{
    while (true)
    {
        Console.Clear();
        RenderMenuHeader();
        var agentUseCase = sp.GetRequiredService<AgentUseCase>();
        var agents = (await agentUseCase.ListAsync()).ToList();

        var items = new List<MenuItem>();
        foreach (var row in agents)
        {
            var status = row.RuntimeStatus ?? row.Status.ToString().ToLowerInvariant();
            items.Add(new MenuItem($"{row.Id,2}  {FitText(row.Name, 20),-20}  {FitText(row.AgentType, 10),-10}  {status}", $"agent:{row.Id}"));
        }
        items.Add(new MenuItem("Create new agent", "new"));
        items.Add(new MenuItem("Refresh", "refresh"));
        items.Add(new MenuItem("Exit", "quit"));

        Console.WriteLine();
        WriteInfo("Action:");
        Console.WriteLine();
        Console.WriteLine(Paint("  ID  Agent                 Type        Status", "90"));
        var selected = SelectWithArrows(items);
        if (selected == "quit")
        {
            return;
        }

        if (selected == "refresh")
        {
            continue;
        }

        if (selected == "new")
        {
            await CreateAgentInteractiveAsync(sp, agentTypesRoot);
            continue;
        }

        if (selected.StartsWith("agent:", StringComparison.Ordinal))
        {
            var raw = selected["agent:".Length..];
            if (int.TryParse(raw, out var agentId))
            {
                await RunAgentMenuAsync(sp, agentId);
            }
        }
    }
}

static async Task CreateAgentInteractiveAsync(IServiceProvider sp, string agentTypesRoot)
{
    var useCase = sp.GetRequiredService<AgentUseCase>();
    var defaultName = await useCase.NextNameAsync();
    Console.Clear();
    RenderMenuHeader();
    Console.WriteLine();
    Console.Write("Agent name");
    Console.Write($" [{defaultName}]: ");
    var name = (Console.ReadLine() ?? string.Empty).Trim();
    if (string.IsNullOrWhiteSpace(name))
    {
        name = defaultName;
    }

    var types = ListAgentTypes(agentTypesRoot);
    if (types.Count == 0)
    {
        throw new InvalidOperationException("No templates found in templates/");
    }

    var typeItems = types.Select(x => new MenuItem(x, x)).ToList();
    Console.WriteLine();
    Console.WriteLine("Select agent type:");
    var selectedType = SelectWithArrows(typeItems);

    var restore = await useCase.HasTrashAsync(name);
    if (restore)
    {
        Console.Write($"Trash data exists for {name}. Restore it? (Y/n): ");
        var answer = (Console.ReadLine() ?? string.Empty).Trim();
        restore = !string.Equals(answer, "n", StringComparison.OrdinalIgnoreCase);
    }

    await useCase.CreateAsync(name, selectedType, null, restore);
    Console.WriteLine();
    Console.WriteLine($"Created: {name} ({selectedType})");
    Console.WriteLine("Press any key to continue...");
    Console.ReadKey(intercept: true);
}

static async Task RunAgentMenuAsync(IServiceProvider sp, int agentId)
{
    var agentUseCase = sp.GetRequiredService<AgentUseCase>();
    while (true)
    {
        var agent = (await agentUseCase.ListAsync()).FirstOrDefault(x => x.Id == agentId);
        if (agent is null)
        {
            Console.WriteLine("Agent not found.");
            Console.WriteLine("Press any key to continue...");
            Console.ReadKey(intercept: true);
            return;
        }

        Console.Clear();
        RenderMenuHeader();
        var status = agent.RuntimeStatus ?? agent.Status.ToString().ToLowerInvariant();
        Console.WriteLine();
        Console.WriteLine($"Agent {agent.Id}:{agent.Name} / {agent.AgentType} / {status}");
        Console.WriteLine();
        Console.WriteLine("Action:");

        var awake = IsAwake(status);
        var items = new List<MenuItem>
        {
            new("Agent access", "agent-access"),
            new("Shell access", "shell"),
            new(awake ? "Sleep" : "Wake", awake ? "sleep" : "wake"),
            new("Delete agent", "remove"),
            new("Back", "back")
        };

        var selected = SelectWithArrows(items);
        if (selected == "back")
        {
            return;
        }

        if (selected == "wake")
        {
            await agentUseCase.WakeAsync(agentId);
            continue;
        }

        if (selected == "sleep")
        {
            await agentUseCase.SleepAsync(agentId);
            continue;
        }

        if (selected == "remove")
        {
            Console.Write("Confirm delete (y/N): ");
            var answer = (Console.ReadLine() ?? string.Empty).Trim();
            if (string.Equals(answer, "y", StringComparison.OrdinalIgnoreCase))
            {
                await agentUseCase.RemoveAsync(agentId);
                return;
            }
            continue;
        }

        if (selected == "shell")
        {
            await EnsureContainerRunningAsync(agent.Name);
            FlushConsoleInputBuffer();
            RunInteractiveProcess("docker", new[] { "exec", "-it", agent.Name, "bash", "-lc", "cd /workspace; exec bash" });
            continue;
        }

        if (selected == "agent-access")
        {
            await EnsureContainerRunningAsync(agent.Name);
            var command = await ResolveStartCommandAsync(sp, agentId);
            if (string.IsNullOrWhiteSpace(command))
            {
                Console.WriteLine("Missing start_command in agent metadata.");
                Console.WriteLine("Press any key to continue...");
                Console.ReadKey(intercept: true);
                continue;
            }
            FlushConsoleInputBuffer();
            RunInteractiveProcess("docker", new[] { "exec", "-it", agent.Name, "bash", "-lc", $"cd /workspace; {command}" });
            continue;
        }
    }
}

static void RenderMenuHeader()
{
    PrintHeader("Codepods CLI · Interactive Agent Manager");
}

static string SelectWithArrows(IReadOnlyList<MenuItem> items)
{
    var selectedIndex = 0;
    var startTop = Console.CursorTop;
    RenderSelection(items, selectedIndex, startTop);

    while (true)
    {
        var key = Console.ReadKey(intercept: true);
        if (key.Key == ConsoleKey.UpArrow)
        {
            selectedIndex = (selectedIndex - 1 + items.Count) % items.Count;
            RenderSelection(items, selectedIndex, startTop);
            continue;
        }

        if (key.Key == ConsoleKey.DownArrow)
        {
            selectedIndex = (selectedIndex + 1) % items.Count;
            RenderSelection(items, selectedIndex, startTop);
            continue;
        }

        if (key.Key == ConsoleKey.Enter)
        {
            Console.SetCursorPosition(0, startTop + items.Count + 1);
            return items[selectedIndex].Value;
        }
    }
}

static void RenderSelection(IReadOnlyList<MenuItem> items, int selectedIndex, int startTop)
{
    for (var i = 0; i < items.Count; i++)
    {
        Console.SetCursorPosition(0, startTop + i);
        Console.Write(new string(' ', Math.Max(Console.WindowWidth - 1, 1)));
        Console.SetCursorPosition(0, startTop + i);
        var pointer = i == selectedIndex ? "» " : "  ";
        Console.WriteLine($"{pointer}{items[i].Label}");
    }
}

static bool IsAwake(string status)
{
    var normalized = status.ToLowerInvariant();
    if (normalized.Contains("exit", StringComparison.Ordinal) ||
        normalized.Contains("stopped", StringComparison.Ordinal) ||
        normalized.Contains("sleep", StringComparison.Ordinal))
    {
        return false;
    }

    return normalized.Contains("up", StringComparison.Ordinal) || normalized.Contains("running", StringComparison.Ordinal);
}

static List<string> ListAgentTypes(string agentTypesRoot)
{
    if (!Directory.Exists(agentTypesRoot))
    {
        return new List<string>();
    }

    return Directory.GetDirectories(agentTypesRoot)
        .Select(Path.GetFileName)
        .Where(x => !string.IsNullOrWhiteSpace(x))
        .Where(x => !string.Equals(x, "shared", StringComparison.OrdinalIgnoreCase))
        .Where(x => File.Exists(Path.Combine(agentTypesRoot, x!, "manifest.yml")))
        .Select(x => x!)
        .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
        .ToList();
}

static async Task<string> ResolveStartCommandAsync(IServiceProvider sp, int agentId)
{
    var repo = sp.GetRequiredService<IAgentRepository>();
    var catalog = sp.GetRequiredService<IAgentTypeCatalog>();
    var row = await repo.GetByIdAsync(agentId) ?? throw new InvalidOperationException($"Agent not found: {agentId}");

    var fromAgentMetadata = ExtractStartCommandFromMetadata(row.MetadataJson);
    if (!string.IsNullOrWhiteSpace(fromAgentMetadata))
    {
        return fromAgentMetadata;
    }

    // Fallback for legacy agents with stale/incomplete metadata:
    // resolve start_command from current template manifest.
    var templateMetadata = catalog.LoadMetadataJson(row.AgentType);
    var fromTemplateMetadata = ExtractStartCommandFromMetadata(templateMetadata);
    if (!string.IsNullOrWhiteSpace(fromTemplateMetadata))
    {
        return fromTemplateMetadata;
    }

    return string.Empty;
}

static string ExtractStartCommandFromMetadata(string? metadataJson)
{
    if (string.IsNullOrWhiteSpace(metadataJson))
    {
        return string.Empty;
    }

    try
    {
        using var doc = JsonDocument.Parse(metadataJson);
        if (doc.RootElement.TryGetProperty("start_command", out var node))
        {
            return node.GetString() ?? string.Empty;
        }
    }
    catch
    {
        // Ignore malformed metadata and let caller decide fallback.
    }

    return string.Empty;
}

static async Task EnsureContainerRunningAsync(string name)
{
    var state = await RunProcessCaptureAsync("docker", new[] { "inspect", "--format", "{{.State.Status}}", name });
    var status = state.StdOut.Trim().ToLowerInvariant();
    if (status is "created" or "exited" or "stopped")
    {
        var started = await RunProcessCaptureAsync("docker", new[] { "start", name });
        if (started.ExitCode != 0)
        {
            throw new InvalidOperationException($"Failed to start container {name}: {started.StdErr}");
        }
    }
}

static void RunInteractiveProcess(string fileName, IReadOnlyList<string> args)
{
    using var process = new Process
    {
        StartInfo = new ProcessStartInfo
        {
            FileName = fileName,
            UseShellExecute = false,
            RedirectStandardInput = false,
            RedirectStandardOutput = false,
            RedirectStandardError = false
        }
    };

    foreach (var arg in args)
    {
        process.StartInfo.ArgumentList.Add(arg);
    }

    process.Start();
    process.WaitForExit();
}

static void FlushConsoleInputBuffer()
{
    try
    {
        while (Console.KeyAvailable)
        {
            Console.ReadKey(intercept: true);
        }
    }
    catch
    {
        // Some terminals may not support KeyAvailable reliably.
    }
}

static async Task<ProcessResult> RunProcessCaptureAsync(string fileName, IReadOnlyList<string> args)
{
    using var process = new Process
    {
        StartInfo = new ProcessStartInfo
        {
            FileName = fileName,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        }
    };

    foreach (var arg in args)
    {
        process.StartInfo.ArgumentList.Add(arg);
    }

    process.Start();
    var stdout = await process.StandardOutput.ReadToEndAsync();
    var stderr = await process.StandardError.ReadToEndAsync();
    await process.WaitForExitAsync();
    return new ProcessResult(process.ExitCode, stdout, stderr);
}

static void PrintHelp()
{
    PrintHeader("Codepods CLI · Help");
    WriteInfo("Usage:");
    Console.WriteLine(Paint("  codepods agents list", "90"));
    Console.WriteLine(Paint("  codepods agents create <type> [name] [restore:true|false]", "90"));
    Console.WriteLine(Paint("  codepods agents types", "90"));
    Console.WriteLine(Paint("  codepods agents next-name", "90"));
    Console.WriteLine(Paint("  codepods agents trash", "90"));
    Console.WriteLine(Paint("  codepods agents wake <agentId>", "90"));
    Console.WriteLine(Paint("  codepods agents sleep <agentId>", "90"));
    Console.WriteLine(Paint("  codepods agents remove <agentId>", "90"));
    Console.WriteLine(Paint("  codepods relays list", "90"));
    Console.WriteLine(Paint("  codepods relays list --all", "90"));
    Console.WriteLine(Paint("  codepods relays ensure <agentId> <serviceKind>", "90"));
    Console.WriteLine(Paint("  codepods relays remove <relayId>", "90"));
    Console.WriteLine(Paint("  codepods relays token <relayId> [username]", "90"));
    Console.WriteLine(Paint("  codepods auth login [username] [password] [deviceId]", "90"));
    Console.WriteLine(Paint("  codepods auth me [username]", "90"));
    Console.WriteLine(Paint("  codepods web <login|users|devices>", "90"));
    Console.WriteLine(Paint("  codepods menu", "90"));
    Console.WriteLine(Paint("  codepods providers list|create|delete", "90"));
    Console.WriteLine(Paint("  codepods repositories list|create|delete", "90"));
    Console.WriteLine(Paint("  codepods codepods list|create|delete", "90"));
    Console.WriteLine(Paint("  codepods variables list|create|delete", "90"));
    Console.WriteLine(Paint("  codepods agent-files read|write", "90"));
}

static void PrintWebHelp()
{
    PrintHeader("Codepods CLI · web · Help", webOnly: true);
    WriteInfo("Usage:");
    Console.WriteLine(Paint("  codepods web start [host] [port]", "90"));
    Console.WriteLine(Paint("  codepods web stop", "90"));
    Console.WriteLine(Paint("  codepods web status", "90"));
    Console.WriteLine(Paint("  codepods web restart [host] [port]", "90"));
    Console.WriteLine(Paint("  codepods web reload", "90"));
    Console.WriteLine(Paint("  codepods web login [username] [password] [deviceId]", "90"));
    Console.WriteLine(Paint("  codepods web relays list|ensure|remove|token", "90"));
    Console.WriteLine(Paint("    (use 'list --all' to include disabled relays)", "90"));
    Console.WriteLine(Paint("  codepods web users list", "90"));
    Console.WriteLine(Paint("  codepods web users add <username> <password> [superadmin:true|false]", "90"));
    Console.WriteLine(Paint("  codepods web users remove <username>", "90"));
    Console.WriteLine(Paint("  codepods web devices list <username>", "90"));
    Console.WriteLine(Paint("  codepods web devices add <username> <deviceName> [deviceId]", "90"));
    Console.WriteLine(Paint("  codepods web devices remove <username> <deviceId|fingerprint> [mode:fingerprint|device_id]", "90"));
}

static string ResolveRootPath()
{
    var candidates = new List<string>
    {
        AppContext.BaseDirectory,
        Directory.GetCurrentDirectory()
    };

    foreach (var start in candidates)
    {
        var current = Path.GetFullPath(start);
        for (var i = 0; i < 8; i++)
        {
            if (File.Exists(Path.Combine(current, "Codepods.sln")) &&
                Directory.Exists(Path.Combine(current, "src")) &&
                Directory.Exists(Path.Combine(current, "templates")))
            {
                return current;
            }

            var parent = Directory.GetParent(current);
            if (parent is null)
            {
                break;
            }

            current = parent.FullName;
        }
    }

    return Directory.GetCurrentDirectory();
}

static string ResolveBuildVersion(string rootPath)
{
    static string? RunGit(string root, string args)
    {
        try
        {
            var psi = new ProcessStartInfo("git", $"-C \"{root}\" {args}")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var process = Process.Start(psi);
            if (process is null)
            {
                return null;
            }

            var output = process.StandardOutput.ReadToEnd().Trim();
            process.WaitForExit(1500);
            return process.ExitCode == 0 ? output : null;
        }
        catch
        {
            return null;
        }
    }

    var exactTag = RunGit(rootPath, "describe --tags --exact-match HEAD");
    if (!string.IsNullOrWhiteSpace(exactTag))
    {
        return exactTag;
    }

    var shortHash = RunGit(rootPath, "rev-parse --short HEAD");
    if (!string.IsNullOrWhiteSpace(shortHash))
    {
        return $"#{shortHash}";
    }

    return "dev";
}

static string FitText(string value, int maxLength)
{
    var text = (value ?? string.Empty).Trim();
    if (text.Length <= maxLength)
    {
        return text;
    }

    if (maxLength <= 1)
    {
        return text[..maxLength];
    }

    return $"{text[..(maxLength - 1)]}…";
}

sealed class CliDisplayContext
{
    public static string BuildVersion { get; set; } = "dev";
    public static string WebStatus { get; set; } = "unknown";
    public static bool UseColor => !Console.IsOutputRedirected;
}

sealed record MenuItem(string Label, string Value);
sealed record ProcessResult(int ExitCode, string StdOut, string StdErr);
