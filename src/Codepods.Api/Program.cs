using Codepods.Core;
using Codepods.Core.Configuration;
using Codepods.Core.Security;
using Codepods.Core.UseCases;
using Codepods.Api.Relay;
using Codepods.Core.Ports;
using Codepods.Infrastructure;
using Codepods.Infrastructure.Persistence;
using Codepods.Runtime;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Codepods API",
        Version = "v1",
        Description = "Codepods management API for authentication, agents, relays and workspace resources."
    });

    options.DocumentFilter<SwaggerTagDescriptionsDocumentFilter>();
    options.OperationFilter<SwaggerBearerAuthOperationFilter>();

    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Paste the access token from /api/auth/login. Example: Bearer <token>"
    });
});

var root = ResolveRootPath();
var config = CodepodsConfig.Load(root);
var buildVersion = ResolveBuildVersion(root);
SystemSecrets.Initialize(config.App.RootPath, config.Keys.MasterKeyPath);

var sqlitePath = config.Db.SqlitePath;
Directory.CreateDirectory(Path.GetDirectoryName(sqlitePath)!);
var sessionSecret = SystemSecrets.DeriveSecretString("session-signing");
var deviceSecret = SystemSecrets.DeriveSecretString("device-fingerprint");
var sessionTtl = config.Auth.SessionLifetime;
var relayTokenTtl = config.Relay.TokenLifetime;
var relayCookieTtl = config.Relay.CookieLifetime;
var relayCookieName = config.Relay.CookieName;
var requireApprovedDevice = config.Auth.RequireApprovedDevice;
var swaggerEnabled = config.Web.SwaggerEnabled;

builder.Services
    .AddCodepodsCore()
    .AddCodepodsRuntime(config)
    .AddCodepodsInfrastructure(sqlitePath, config.Relay.PortMin, config.Relay.PortMax);
builder.Services.AddSingleton(config);
builder.Services.AddSingleton(new RelayRuntimeSettings(
    sessionSecret,
    relayCookieName,
    config.Web.PublicDomain,
    config.Web.BaseUrl,
    config.Tls.CertPath,
    config.Tls.KeyPath));
builder.Services.AddHostedService<RelayRuntimeHostedService>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<CodepodsDbContext>();
    await db.Database.EnsureCreatedAsync();

    var authUseCase = scope.ServiceProvider.GetRequiredService<AuthUseCase>();
    var bootstrapUser = config.Auth.BootstrapUser;
    var bootstrapPassword = config.Auth.BootstrapPassword;
    await authUseCase.EnsureBootstrapAsync(bootstrapUser, bootstrapPassword);
}

if (swaggerEnabled)
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/health", () => new { status = "ok", service = "Codepods.Api", stack = ".NET" })
    .WithName("Health")
    .WithOpenApi();

app.MapGet("/api/system/version", (HttpRequest request) =>
{
    RequireAuth(request, sessionSecret);
    return Results.Ok(new { version = buildVersion });
});

app.MapGet("/api/help/about", (HttpRequest request) =>
{
    RequireAuth(request, sessionSecret);
    var aboutPath = Path.Combine(root, "ABOUT.md");
    var content = File.Exists(aboutPath)
        ? File.ReadAllText(aboutPath)
        : "# About Codepods\n\nABOUT.md file not found.";

    var licenseFile = Directory.EnumerateFiles(root, "LICEN*", SearchOption.TopDirectoryOnly)
        .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
        .FirstOrDefault();
    var license = licenseFile is null ? string.Empty : File.ReadAllText(licenseFile);

    return Results.Ok(new
    {
        markdown = content,
        license,
        license_file = licenseFile is null ? string.Empty : Path.GetFileName(licenseFile),
        repository = "https://github.com/lualab-xyz/CodexAgentsManager",
        issues = "https://github.com/lualab-xyz/CodexAgentsManager/issues",
        version = buildVersion
    });
});

app.MapPost("/api/auth/login", async (
    LoginRequest req,
    AuthUseCase authUseCase) =>
{
    try
    {
        var user = await authUseCase.AuthenticateAsync(
            req.Username,
            req.Password,
            req.DeviceId,
            requireApprovedDevice,
            deviceSecret);
        var payload = new Dictionary<string, object?>
        {
            ["uid"] = user.Id,
            ["user"] = user.Username,
            ["superadmin"] = user.IsSuperadmin,
            ["device"] = req.DeviceId ?? string.Empty,
            ["exp"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds() + sessionTtl
        };
        var token = TokenCodec.CreateToken(payload, sessionSecret);
        return Results.Ok(new { access_token = token, token_type = "bearer", expires_in = sessionTtl });
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { detail = ex.Message });
    }
});

app.MapGet("/api/auth/me", (HttpRequest request) =>
{
    var payload = RequireAuth(request, sessionSecret);
    return Results.Ok(new
    {
        uid = payload["uid"].GetInt32(),
        user = payload["user"].GetString(),
        superadmin = payload["superadmin"].GetBoolean(),
        device = payload.TryGetValue("device", out var deviceNode) ? deviceNode.GetString() : string.Empty,
        exp = payload.TryGetValue("exp", out var expNode) ? expNode.GetInt64() : 0
    });
});

app.MapGet("/api/settings/config", (HttpRequest request, SystemConfigUseCase useCase) =>
{
    RequireAuth(request, sessionSecret);
    return Results.Ok(useCase.Get());
});

app.MapPut("/api/settings/config", async (HttpRequest request, SystemConfigUpdateRequest req, SystemConfigUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    var update = new SystemConfigUpdate(
        req.Auth is null ? null : new SystemAuthUpdate(req.Auth.RequireApprovedDevice, req.Auth.SessionLifetime),
        req.Relay is null ? null : new SystemRelayUpdate(req.Relay.PortMin, req.Relay.PortMax, req.Relay.TokenLifetime, req.Relay.CookieLifetime, req.Relay.CookieName),
        req.Web is null ? null : new SystemWebUpdate(req.Web.PublicDomain, req.Web.BaseUrl, req.Web.CorsOrigins, req.Web.SwaggerEnabled),
        req.Tls is null ? null : new SystemTlsUpdate(req.Tls.CertPath, req.Tls.KeyPath, req.Tls.CertbotEmail));
    var result = await useCase.UpdateAsync(update, req.Reload ?? true, ct);
    return Results.Ok(result);
});

app.MapPost("/api/settings/reload", async (HttpRequest request, SystemConfigUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    var status = await useCase.ReloadAsync(ct);
    return Results.Ok(status);
});

app.MapGet("/api/users", async (HttpRequest request, UserDeviceUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    var rows = await useCase.ListUsersAsync(ct);
    return Results.Ok(rows.Select(x => new
    {
        id = x.Id,
        username = x.Username,
        is_superadmin = x.IsSuperadmin,
        is_active = x.IsActive,
        created_at = x.CreatedAtUtc,
        updated_at = x.UpdatedAtUtc
    }));
});

app.MapPost("/api/users", async (HttpRequest request, UserCreateRequest req, UserDeviceUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        var row = await useCase.AddUserAsync(req.Username, req.Password, req.Superadmin, ct);
        return Results.Ok(new
        {
            id = row.Id,
            username = row.Username,
            is_superadmin = row.IsSuperadmin,
            is_active = row.IsActive
        });
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { detail = ex.Message });
    }
});

app.MapDelete("/api/users/{username}", async (HttpRequest request, string username, UserDeviceUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    await useCase.RemoveUserAsync(username, ct);
    return Results.Ok(new { deleted = true, username });
});

app.MapGet("/api/devices/{username}", async (HttpRequest request, string username, UserDeviceUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        var rows = await useCase.ListDevicesAsync(username, ct);
        return Results.Ok(rows.Select(x => new
        {
            id = x.Id,
            name = x.Name,
            fingerprint = x.DeviceFingerprint,
            last_seen_at = x.LastSeenAtUtc,
            created_at = x.CreatedAtUtc
        }));
    }
    catch (InvalidOperationException ex)
    {
        return Results.NotFound(new { detail = ex.Message });
    }
});

app.MapPost("/api/devices/{username}", async (HttpRequest request, string username, DeviceCreateRequest req, UserDeviceUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        var enrollment = await useCase.AddDeviceAsync(username, req.Name, req.DeviceId, deviceSecret, ct);
        return Results.Ok(new
        {
            username = enrollment.Username,
            name = enrollment.Name,
            fingerprint = enrollment.Fingerprint,
            device_id = enrollment.DeviceId
        });
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { detail = ex.Message });
    }
});

app.MapDelete("/api/devices/{username}", async (HttpRequest request, string username, [FromBody] DeviceDeleteRequest req, UserDeviceUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        await useCase.RemoveDeviceAsync(username, req.DeviceId, req.Fingerprint, deviceSecret, ct);
        return Results.Ok(new { deleted = true, username });
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { detail = ex.Message });
    }
});

app.MapGet("/api/agents", async (HttpRequest request, AgentUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    var rows = await useCase.ListAsync(ct);
    return Results.Ok(rows.Select(AgentToResponse));
});

app.MapGet("/api/agents/types", (HttpRequest request, AgentUseCase useCase) =>
{
    RequireAuth(request, sessionSecret);
    return Results.Ok(useCase.ListTypes().Select(x => new
    {
        name = x.Name,
        description = x.Description,
        image = x.Image,
        icon_light_base64 = x.IconLightBase64,
        icon_dark_base64 = x.IconDarkBase64,
        icon_mime_type = x.IconMimeType
    }));
});

app.MapGet("/api/agents/next-name", async (HttpRequest request, AgentUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    var name = await useCase.NextNameAsync(ct);
    return Results.Ok(new { name });
});

app.MapGet("/api/agents/trash", async (HttpRequest request, AgentUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    var items = await useCase.ListTrashAsync(ct);
    return Results.Ok(new { items });
});

app.MapPost("/api/agents", async (HttpRequest request, CreateAgentRequest req, AgentUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        var metadataText = req.Metadata.HasValue ? req.Metadata.Value.GetRawText() : null;
        var row = await useCase.CreateAsync(req.Name, req.AgentType, metadataText, req.Restore, ct);
        return Results.Ok(AgentToResponse(row));
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { detail = ex.Message });
    }
});

app.MapGet("/api/agents/{agentId:int}", async (HttpRequest request, int agentId, AgentUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    var rows = await useCase.ListAsync(ct);
    var row = rows.FirstOrDefault(x => x.Id == agentId);
    return row is null ? Results.NotFound(new { detail = "Agent not found" }) : Results.Ok(AgentToResponse(row));
});

app.MapPost("/api/agents/{agentId:int}/wake", async (HttpRequest request, int agentId, AgentUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        var row = await useCase.WakeAsync(agentId, ct);
        return Results.Ok(AgentToResponse(row));
    }
    catch (InvalidOperationException ex)
    {
        return Results.NotFound(new { detail = ex.Message });
    }
});

app.MapPost("/api/agents/{agentId:int}/resume", async (HttpRequest request, int agentId, AgentUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        var row = await useCase.WakeAsync(agentId, ct);
        return Results.Ok(AgentToResponse(row));
    }
    catch (InvalidOperationException ex)
    {
        return Results.NotFound(new { detail = ex.Message });
    }
});

app.MapPost("/api/agents/{agentId:int}/sleep", async (HttpRequest request, int agentId, AgentUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        var row = await useCase.SleepAsync(agentId, ct);
        return Results.Ok(AgentToResponse(row));
    }
    catch (InvalidOperationException ex)
    {
        return Results.NotFound(new { detail = ex.Message });
    }
});

app.MapDelete("/api/agents/{agentId:int}", async (HttpRequest request, int agentId, AgentUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        await useCase.RemoveAsync(agentId, ct);
        return Results.Ok(new { deleted = true, agent_id = agentId });
    }
    catch (InvalidOperationException ex)
    {
        return Results.NotFound(new { detail = ex.Message });
    }
});

app.MapGet("/api/providers", async (HttpRequest request, ProviderUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    var rows = await useCase.ListAsync(ct);
    return Results.Ok(rows.Select(ProviderToResponse));
});

app.MapGet("/api/providers/{providerId:int}", async (HttpRequest request, int providerId, ProviderUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        var row = await useCase.GetAsync(providerId, ct);
        return Results.Ok(ProviderToResponse(row));
    }
    catch (InvalidOperationException ex)
    {
        return Results.NotFound(new { detail = ex.Message });
    }
});

app.MapPost("/api/providers", async (HttpRequest request, ProviderCreateRequest req, ProviderUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        var row = await useCase.CreateAsync(req.Name, req.ProviderType, req.Configuration.GetRawText(), ct);
        return Results.Ok(ProviderToResponse(row));
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { detail = ex.Message });
    }
});

app.MapPut("/api/providers/{providerId:int}", async (HttpRequest request, int providerId, ProviderUpdateRequest req, ProviderUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        var configText = req.Configuration.HasValue ? req.Configuration.Value.GetRawText() : null;
        var row = await useCase.UpdateAsync(providerId, req.Name, req.ProviderType, configText, ct);
        return Results.Ok(ProviderToResponse(row));
    }
    catch (InvalidOperationException ex)
    {
        var status = ex.Message.Contains("not found", StringComparison.OrdinalIgnoreCase) ? 404 : 400;
        return Results.Json(new { detail = ex.Message }, statusCode: status);
    }
});

app.MapDelete("/api/providers/{providerId:int}", async (HttpRequest request, int providerId, ProviderUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    await useCase.DeleteAsync(providerId, ct);
    return Results.Ok(new { deleted = true, provider_id = providerId });
});

app.MapGet("/api/repositories", async (HttpRequest request, RepositoryUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    return Results.Ok(await useCase.ListAsync(ct));
});

app.MapGet("/api/repositories/{repoId:int}", async (HttpRequest request, int repoId, RepositoryUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        return Results.Ok(await useCase.GetAsync(repoId, ct));
    }
    catch (InvalidOperationException ex)
    {
        return Results.NotFound(new { detail = ex.Message });
    }
});

app.MapPost("/api/repositories", async (HttpRequest request, RepositoryCreateRequest req, RepositoryUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        return Results.Ok(await useCase.CreateAsync(req.Name, req.Url, req.Description, ct));
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { detail = ex.Message });
    }
});

app.MapPut("/api/repositories/{repoId:int}", async (HttpRequest request, int repoId, RepositoryUpdateRequest req, RepositoryUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        return Results.Ok(await useCase.UpdateAsync(repoId, req.Name, req.Url, req.Description, ct));
    }
    catch (InvalidOperationException ex)
    {
        var status = ex.Message.Contains("not found", StringComparison.OrdinalIgnoreCase) ? 404 : 400;
        return Results.Json(new { detail = ex.Message }, statusCode: status);
    }
});

app.MapDelete("/api/repositories/{repoId:int}", async (HttpRequest request, int repoId, RepositoryUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    await useCase.DeleteAsync(repoId, ct);
    return Results.Ok(new { deleted = true, repository_id = repoId });
});

app.MapGet("/api/codepods", async (HttpRequest request, CodepodUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    return Results.Ok(await useCase.ListAsync(ct));
});

app.MapGet("/api/codepods/{codepodId:int}", async (HttpRequest request, int codepodId, CodepodUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        return Results.Ok(await useCase.GetAsync(codepodId, ct));
    }
    catch (InvalidOperationException ex)
    {
        return Results.NotFound(new { detail = ex.Message });
    }
});

app.MapPost("/api/codepods", async (HttpRequest request, CodepodCreateRequest req, CodepodUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        return Results.Ok(await useCase.CreateAsync(req.Name, req.Description, ct));
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { detail = ex.Message });
    }
});

app.MapPut("/api/codepods/{codepodId:int}", async (HttpRequest request, int codepodId, CodepodUpdateRequest req, CodepodUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        return Results.Ok(await useCase.UpdateAsync(codepodId, req.Name, req.Description, ct));
    }
    catch (InvalidOperationException ex)
    {
        var status = ex.Message.Contains("not found", StringComparison.OrdinalIgnoreCase) ? 404 : 400;
        return Results.Json(new { detail = ex.Message }, statusCode: status);
    }
});

app.MapDelete("/api/codepods/{codepodId:int}", async (HttpRequest request, int codepodId, CodepodUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    await useCase.DeleteAsync(codepodId, ct);
    return Results.Ok(new { deleted = true, codepod_id = codepodId });
});

app.MapGet("/api/variables", async (HttpRequest request, int? codepod_id, VariableUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    return Results.Ok(await useCase.ListAsync(codepod_id, ct));
});

app.MapGet("/api/variables/{variableId:int}", async (HttpRequest request, int variableId, VariableUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        return Results.Ok(await useCase.GetAsync(variableId, ct));
    }
    catch (InvalidOperationException ex)
    {
        return Results.NotFound(new { detail = ex.Message });
    }
});

app.MapPost("/api/variables", async (HttpRequest request, VariableCreateRequest req, VariableUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        return Results.Ok(await useCase.CreateAsync(req.Name, req.Value, req.IsSecret, req.CodepodId, ct));
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { detail = ex.Message });
    }
});

app.MapPut("/api/variables/{variableId:int}", async (HttpRequest request, int variableId, VariableUpdateRequest req, VariableUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        return Results.Ok(await useCase.UpdateAsync(variableId, req.Name, req.Value, req.IsSecret, req.CodepodId, req.CodepodId.HasValue, ct));
    }
    catch (InvalidOperationException ex)
    {
        var status = ex.Message.Contains("not found", StringComparison.OrdinalIgnoreCase) ? 404 : 400;
        return Results.Json(new { detail = ex.Message }, statusCode: status);
    }
});

app.MapDelete("/api/variables/{variableId:int}", async (HttpRequest request, int variableId, VariableUseCase useCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    await useCase.DeleteAsync(variableId, ct);
    return Results.Ok(new { deleted = true, variable_id = variableId });
});

app.MapGet("/api/templates", (HttpRequest request, IAgentTypeCatalog catalog) =>
{
    RequireAuth(request, sessionSecret);
    var items = catalog.ListTemplates().Select(x => new
    {
        name = x.Name,
        description = x.Description,
        is_shared = x.IsShared,
        icon_light_base64 = x.IconLightBase64,
        icon_dark_base64 = x.IconDarkBase64,
        icon_mime_type = x.IconMimeType
    });
    return Results.Ok(new { items });
});

app.MapGet("/api/templates/{templateName}/files", (HttpRequest request, string templateName, AgentFileUseCase useCase) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        var items = useCase.List(templateName).Select(x => new
        {
            path = x.Path,
            size = x.Size,
            updated_at = x.UpdatedAtUtc,
            is_text_editable = x.IsTextEditable
        });
        return Results.Ok(new { items });
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { detail = ex.Message });
    }
});

app.MapGet("/api/templates/{templateName}/files/{*filePath}", (HttpRequest request, string templateName, string filePath, AgentFileUseCase useCase) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        var content = useCase.ReadText(templateName, filePath);
        return Results.Ok(new { content });
    }
    catch (Exception ex) when (ex is FileNotFoundException or InvalidOperationException)
    {
        var status = ex is FileNotFoundException ? 404 : 400;
        return Results.Json(new { detail = ex.Message }, statusCode: status);
    }
});

app.MapGet("/api/templates/{templateName}/download/{*filePath}", (HttpRequest request, string templateName, string filePath, AgentFileUseCase useCase) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        var content = useCase.ReadBytes(templateName, filePath);
        return Results.Ok(new
        {
            file_name = Path.GetFileName(filePath),
            content_base64 = Convert.ToBase64String(content)
        });
    }
    catch (Exception ex) when (ex is FileNotFoundException or InvalidOperationException)
    {
        var status = ex is FileNotFoundException ? 404 : 400;
        return Results.Json(new { detail = ex.Message }, statusCode: status);
    }
});

app.MapPost("/api/templates/{templateName}/files", (HttpRequest request, string templateName, TemplateFileCreateRequest req, AgentFileUseCase useCase) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        useCase.Create(templateName, req.Path, DecodeTemplateContent(req.Content, req.ContentBase64));
        return Results.Ok(new { template = templateName, file_name = req.Path, created = true });
    }
    catch (Exception ex) when (ex is InvalidOperationException or FileNotFoundException)
    {
        var status = ex is FileNotFoundException ? 404 : 400;
        return Results.Json(new { detail = ex.Message }, statusCode: status);
    }
});

app.MapPost("/api/templates/{templateName}/files/rename", (HttpRequest request, string templateName, TemplateFileRenameRequest req, AgentFileUseCase useCase) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        useCase.Rename(templateName, req.FromPath, req.ToPath);
        return Results.Ok(new { template = templateName, from_path = req.FromPath, to_path = req.ToPath, renamed = true });
    }
    catch (Exception ex) when (ex is InvalidOperationException or FileNotFoundException)
    {
        var status = ex is FileNotFoundException ? 404 : 400;
        return Results.Json(new { detail = ex.Message }, statusCode: status);
    }
});

app.MapPut("/api/templates/{templateName}/files/{*filePath}", (HttpRequest request, string templateName, string filePath, TemplateFileWriteRequest req, AgentFileUseCase useCase) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        useCase.Write(templateName, filePath, DecodeTemplateContent(req.Content, req.ContentBase64));
        return Results.Ok(new { template = templateName, file_name = filePath, updated = true });
    }
    catch (Exception ex) when (ex is InvalidOperationException or FileNotFoundException)
    {
        var status = ex is FileNotFoundException ? 404 : 400;
        return Results.Json(new { detail = ex.Message }, statusCode: status);
    }
});

app.MapDelete("/api/templates/{templateName}/files/{*filePath}", (HttpRequest request, string templateName, string filePath, AgentFileUseCase useCase) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        useCase.Delete(templateName, filePath);
        return Results.Ok(new { template = templateName, file_name = filePath, deleted = true });
    }
    catch (Exception ex) when (ex is InvalidOperationException or FileNotFoundException)
    {
        var status = ex is FileNotFoundException ? 404 : 400;
        return Results.Json(new { detail = ex.Message }, statusCode: status);
    }
});

app.MapGet("/api/relays", async (HttpRequest request, RelayUseCase useCase, AgentUseCase agentUseCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    var rows = await useCase.ListAsync(ct);
    var agents = await agentUseCase.ListAsync(ct);
    var namesById = agents.ToDictionary(x => x.Id, x => x.Name);
    return Results.Ok(rows.Select(x => RelayToResponse(x, namesById)));
});

app.MapGet("/api/relays/agents/{agentId:int}", async (HttpRequest request, int agentId, RelayUseCase useCase, AgentUseCase agentUseCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    var rows = await useCase.ListAsync(ct);
    var agents = await agentUseCase.ListAsync(ct);
    var namesById = agents.ToDictionary(x => x.Id, x => x.Name);
    return Results.Ok(rows.Where(x => x.AgentId == agentId).Select(x => RelayToResponse(x, namesById)));
});

app.MapPost("/api/relays/ensure", async (HttpRequest request, EnsureRelayRequest req, RelayUseCase useCase, AgentUseCase agentUseCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        var agentId = req.AgentId;
        if (!agentId.HasValue)
        {
            var agentName = (req.AgentName ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(agentName))
            {
                return Results.BadRequest(new { detail = "agent_id or agent_name is required" });
            }

            var agents = await agentUseCase.ListAsync(ct);
            var found = agents.FirstOrDefault(x => string.Equals(x.Name, agentName, StringComparison.Ordinal));
            if (found is null)
            {
                return Results.NotFound(new { detail = $"Agent not found: {agentName}" });
            }
            agentId = found.Id;
        }

        var relay = await useCase.EnsureAsync(agentId.Value, req.ServiceKind, ct);
        var agentsById = (await agentUseCase.ListAsync(ct)).ToDictionary(x => x.Id, x => x.Name);
        var relayRead = RelayToResponse(relay, agentsById);
        var relayHost = ResolveRelayHost(config, request.Host.Host);
        return Results.Ok(new { relay = relayRead, relay_url = $"https://{relayHost}:{relay.RelayPort}/" });
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { detail = ex.Message });
    }
    catch (Exception ex)
    {
        var detail = ex.InnerException is null ? ex.Message : $"{ex.Message} | {ex.InnerException.Message}";
        return Results.Json(new { detail }, statusCode: 500);
    }
});

app.MapDelete("/api/relays/{relayId:int}", async (HttpRequest request, int relayId, RelayUseCase useCase, AgentUseCase agentUseCase, CancellationToken ct) =>
{
    RequireAuth(request, sessionSecret);
    try
    {
        var relay = await useCase.DisableAsync(relayId, ct);
        var agentsById = (await agentUseCase.ListAsync(ct)).ToDictionary(x => x.Id, x => x.Name);
        return Results.Ok(RelayToResponse(relay, agentsById));
    }
    catch (InvalidOperationException ex)
    {
        return Results.NotFound(new { detail = ex.Message });
    }
});

app.MapPost("/api/relays/{relayId:int}/token", async (HttpRequest request, int relayId, RelayUseCase useCase, CancellationToken ct) =>
{
    var auth = RequireAuth(request, sessionSecret);
    var relay = (await useCase.ListAsync(ct)).FirstOrDefault(x => x.Id == relayId);
    if (relay is null || !relay.Enabled)
    {
        return Results.NotFound(new { detail = "Relay not found" });
    }

    var relayPayload = new Dictionary<string, object?>
    {
        ["type"] = "relay",
        ["uid"] = auth["uid"].GetInt32(),
        ["relay_id"] = relay.Id,
        ["agent_id"] = relay.AgentId,
        ["service_kind"] = relay.ServiceKind,
        ["relay_port"] = relay.RelayPort,
        ["exp"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds() + relayTokenTtl
    };
    var relayToken = TokenCodec.CreateToken(relayPayload, sessionSecret);

    var relayHost = ResolveRelayHost(config, request.Host.Host);
    var baseUrl = ResolveRelayBaseUrl(config, relayHost);
    return Results.Ok(new
    {
        relay_id = relay.Id,
        relay_port = relay.RelayPort,
        service_kind = relay.ServiceKind,
        expires_in = relayTokenTtl,
        relay_token = relayToken,
        relay_url = $"https://{relayHost}:{relay.RelayPort}/",
        bootstrap = $"{baseUrl}/relay/?relay_token={relayToken}"
    });
});

app.MapGet("/relay", async (HttpRequest request, HttpResponse response, RelayUseCase useCase, string relay_token, CancellationToken ct) =>
{
    Dictionary<string, System.Text.Json.JsonElement> payload;
    try
    {
        payload = TokenCodec.DecodeToken(relay_token, sessionSecret);
    }
    catch
    {
        return Results.Unauthorized();
    }

    if (!payload.TryGetValue("type", out var typeNode) || !string.Equals(typeNode.GetString(), "relay", StringComparison.Ordinal))
    {
        return Results.Unauthorized();
    }

    var relayId = payload["relay_id"].GetInt32();
    var relayRows = await useCase.ListAsync(ct);
    var relay = relayRows.FirstOrDefault(x => x.Id == relayId);
    if (relay is null || !relay.Enabled)
    {
        return Results.NotFound(new { detail = "Relay not found" });
    }

    if (payload["agent_id"].GetInt32() != relay.AgentId ||
        payload["relay_port"].GetInt32() != relay.RelayPort ||
        !string.Equals(payload["service_kind"].GetString(), relay.ServiceKind, StringComparison.OrdinalIgnoreCase))
    {
        return Results.Unauthorized();
    }

    response.Cookies.Append(relayCookieName, relay_token, new CookieOptions
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Strict,
        MaxAge = TimeSpan.FromSeconds(relayCookieTtl),
        Path = "/"
    });

    var relayHost = ResolveRelayHost(config, request.Host.Host);
    var destination = $"https://{relayHost}:{relay.RelayPort}/";
    return Results.Redirect(destination);
});

app.MapFallback(async context =>
{
    if (IsReservedServerPath(context.Request.Path))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    var webRoot = app.Environment.WebRootPath ?? Path.Combine(app.Environment.ContentRootPath, "wwwroot");
    var indexPath = Path.Combine(webRoot, "index.html");
    if (!File.Exists(indexPath))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    await context.Response.SendFileAsync(indexPath);
});

app.Run();

static Dictionary<string, System.Text.Json.JsonElement> RequireAuth(HttpRequest request, string secret)
{
    var header = request.Headers.Authorization.ToString();
    if (string.IsNullOrWhiteSpace(header) || !header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
    {
        throw new BadHttpRequestException("authentication required", StatusCodes.Status401Unauthorized);
    }

    var token = header["Bearer ".Length..].Trim();
    try
    {
        return TokenCodec.DecodeToken(token, secret);
    }
    catch
    {
        throw new BadHttpRequestException("invalid token", StatusCodes.Status401Unauthorized);
    }
}

static object ProviderToResponse(Codepods.Core.Domain.Provider row)
{
    JsonElement configuration;
    try
    {
        configuration = JsonDocument.Parse(string.IsNullOrWhiteSpace(row.ConfigurationJson) ? "{}" : row.ConfigurationJson).RootElement.Clone();
    }
    catch
    {
        configuration = JsonDocument.Parse("{}").RootElement.Clone();
    }

    return new
    {
        id = row.Id,
        name = row.Name,
        provider_type = row.ProviderType switch
        {
            Codepods.Core.Domain.ProviderType.OpenAi => "openai",
            Codepods.Core.Domain.ProviderType.AzureOpenAi => "azure_openai",
            Codepods.Core.Domain.ProviderType.GithubCopilot => "github_copilot",
            _ => "openai"
        },
        configuration,
        created_at = row.CreatedAtUtc,
        updated_at = row.UpdatedAtUtc
    };
}

static string ResolveRelayHost(CodepodsConfig config, string fallbackHost)
{
    var host = (config.Web.PublicDomain ?? string.Empty).Trim();
    return string.IsNullOrWhiteSpace(host) ? fallbackHost : host;
}

static string ResolveRelayBaseUrl(CodepodsConfig config, string relayHost)
{
    var configured = (config.Web.BaseUrl ?? string.Empty).Trim();
    if (!string.IsNullOrWhiteSpace(configured))
    {
        return configured.TrimEnd('/');
    }

    return $"https://{relayHost}:8000";
}

static object AgentToResponse(AgentRuntimeView row)
{
    JsonElement metadata;
    try
    {
        metadata = JsonDocument.Parse(string.IsNullOrWhiteSpace(row.MetadataJson) ? "{}" : row.MetadataJson).RootElement.Clone();
    }
    catch
    {
        metadata = JsonDocument.Parse("{}").RootElement.Clone();
    }

    return new
    {
        id = row.Id,
        name = row.Name,
        agent_type = row.AgentType,
        status = row.Status.ToString().ToLowerInvariant(),
        metadata,
        runtime_status = row.RuntimeStatus
    };
}

static object RelayToResponse(Codepods.Core.Domain.RelayBinding row, IReadOnlyDictionary<int, string> namesById)
{
    return new
    {
        id = row.Id,
        agent_id = row.AgentId,
        agent_name = namesById.TryGetValue(row.AgentId, out var name) ? name : row.AgentId.ToString(),
        service_kind = row.ServiceKind,
        target_port = row.TargetPort,
        relay_port = row.RelayPort,
        enabled = row.Enabled
    };
}

static bool IsReservedServerPath(PathString path)
{
    var value = path.Value ?? string.Empty;
    return value.StartsWith("/api", StringComparison.OrdinalIgnoreCase)
        || value.StartsWith("/swagger", StringComparison.OrdinalIgnoreCase)
        || value.StartsWith("/relay", StringComparison.OrdinalIgnoreCase)
        || string.Equals(value, "/health", StringComparison.OrdinalIgnoreCase);
}

static byte[] DecodeTemplateContent(string? content, string? contentBase64)
{
    var hasText = !string.IsNullOrEmpty(content);
    var hasBase64 = !string.IsNullOrEmpty(contentBase64);
    if (hasText && hasBase64)
    {
        throw new InvalidOperationException("Provide only one of content or content_base64.");
    }

    if (hasBase64)
    {
        try
        {
            return Convert.FromBase64String(contentBase64!);
        }
        catch (FormatException)
        {
            throw new InvalidOperationException("Invalid content_base64 payload.");
        }
    }

    return System.Text.Encoding.UTF8.GetBytes(content ?? string.Empty);
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
        return shortHash;
    }

    return "dev";
}

public sealed class SwaggerBearerAuthOperationFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        var tag = SwaggerTagResolver.Resolve(context.ApiDescription.RelativePath);
        operation.Tags = new List<OpenApiTag> { new() { Name = tag } };

        var path = (context.ApiDescription.RelativePath ?? string.Empty)
            .Split('?', 2)[0]
            .Trim('/')
            .ToLowerInvariant();

        if (path == "health" || path == "api/auth/login" || path.StartsWith("relay"))
        {
            return;
        }

        if (!path.StartsWith("api/"))
        {
            return;
        }

        operation.Security ??= new List<OpenApiSecurityRequirement>();
        operation.Security.Add(new OpenApiSecurityRequirement
        {
            [new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            }] = Array.Empty<string>()
        });
    }
}

public static class SwaggerTagResolver
{
    public static string Resolve(string? relativePath)
    {
        var path = (relativePath ?? string.Empty).Split('?', 2)[0].Trim('/').ToLowerInvariant();
        if (path == "health")
        {
            return "System";
        }
        if (path.StartsWith("api/auth"))
        {
            return "Auth";
        }
        if (path.StartsWith("api/users"))
        {
            return "Users";
        }
        if (path.StartsWith("api/devices"))
        {
            return "Devices";
        }
        if (path.StartsWith("api/agents"))
        {
            return "Agents";
        }
        if (path.StartsWith("api/relays") || path.StartsWith("relay"))
        {
            return "Relays";
        }
        if (path.StartsWith("api/providers"))
        {
            return "Providers";
        }
        if (path.StartsWith("api/repositories"))
        {
            return "Repositories";
        }
        if (path.StartsWith("api/codepods"))
        {
            return "Codepods";
        }
        if (path.StartsWith("api/variables"))
        {
            return "Variables";
        }
        if (path.StartsWith("api/templates"))
        {
            return "Templates";
        }
        if (path.StartsWith("api/settings"))
        {
            return "Settings";
        }

        return "General";
    }
}

public sealed class SwaggerTagDescriptionsDocumentFilter : IDocumentFilter
{
    public void Apply(OpenApiDocument swaggerDoc, DocumentFilterContext context)
    {
        swaggerDoc.Tags = new List<OpenApiTag>
        {
            new() { Name = "System", Description = "Service status and health endpoints." },
            new() { Name = "Auth", Description = "Login and session introspection." },
            new() { Name = "Users", Description = "User administration operations." },
            new() { Name = "Devices", Description = "Authorized device management per user." },
            new() { Name = "Agents", Description = "Agent lifecycle and metadata operations." },
            new() { Name = "Relays", Description = "Relay allocation, token bootstrap and secure access." },
            new() { Name = "Providers", Description = "Provider configuration CRUD." },
            new() { Name = "Repositories", Description = "Repository registry CRUD." },
            new() { Name = "Codepods", Description = "Codepod resource CRUD." },
            new() { Name = "Variables", Description = "Variable and secret management." },
            new() { Name = "Templates", Description = "Template catalog and file management operations." },
            new() { Name = "Settings", Description = "Host runtime configuration and reload operations." }
        };
    }
}

public sealed record LoginRequest(
    [property: JsonPropertyName("username")] string Username,
    [property: JsonPropertyName("password")] string Password,
    [property: JsonPropertyName("device_id")] string? DeviceId);
public sealed record UserCreateRequest(
    [property: JsonPropertyName("username")] string Username,
    [property: JsonPropertyName("password")] string Password,
    [property: JsonPropertyName("superadmin")] bool Superadmin);
public sealed record DeviceCreateRequest(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("device_id")] string? DeviceId);
public sealed record DeviceDeleteRequest(
    [property: JsonPropertyName("device_id")] string? DeviceId,
    [property: JsonPropertyName("fingerprint")] string? Fingerprint);
public sealed record CreateAgentRequest(
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("agent_type")] string AgentType,
    [property: JsonPropertyName("metadata")] JsonElement? Metadata,
    [property: JsonPropertyName("restore")] bool Restore = false);
public sealed record EnsureRelayRequest(
    [property: JsonPropertyName("agent_id")] int? AgentId,
    [property: JsonPropertyName("agent_name")] string? AgentName,
    [property: JsonPropertyName("service_kind")] string ServiceKind);
public sealed record ProviderCreateRequest(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("provider_type")] string ProviderType,
    [property: JsonPropertyName("configuration")] JsonElement Configuration);
public sealed record ProviderUpdateRequest(
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("provider_type")] string? ProviderType,
    [property: JsonPropertyName("configuration")] JsonElement? Configuration);
public sealed record RepositoryCreateRequest(string Name, string Url, string? Description);
public sealed record RepositoryUpdateRequest(string? Name, string? Url, string? Description);
public sealed record CodepodCreateRequest(string Name, string? Description);
public sealed record CodepodUpdateRequest(string? Name, string? Description);
public sealed record VariableCreateRequest(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("value")] string Value,
    [property: JsonPropertyName("is_secret")] bool IsSecret,
    [property: JsonPropertyName("codepod_id")] int? CodepodId);
public sealed record VariableUpdateRequest(
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("value")] string? Value,
    [property: JsonPropertyName("is_secret")] bool? IsSecret,
    [property: JsonPropertyName("codepod_id")] int? CodepodId);
public sealed record TemplateFileCreateRequest(
    [property: JsonPropertyName("path")] string Path,
    [property: JsonPropertyName("content")] string? Content,
    [property: JsonPropertyName("content_base64")] string? ContentBase64);
public sealed record TemplateFileRenameRequest(
    [property: JsonPropertyName("from_path")] string FromPath,
    [property: JsonPropertyName("to_path")] string ToPath);
public sealed record TemplateFileWriteRequest(
    [property: JsonPropertyName("content")] string? Content,
    [property: JsonPropertyName("content_base64")] string? ContentBase64);
public sealed record SystemConfigUpdateRequest(
    [property: JsonPropertyName("auth")] SystemAuthUpdateRequest? Auth,
    [property: JsonPropertyName("relay")] SystemRelayUpdateRequest? Relay,
    [property: JsonPropertyName("web")] SystemWebUpdateRequest? Web,
    [property: JsonPropertyName("tls")] SystemTlsUpdateRequest? Tls,
    [property: JsonPropertyName("reload")] bool? Reload);
public sealed record SystemAuthUpdateRequest(
    [property: JsonPropertyName("require_approved_device")] bool? RequireApprovedDevice,
    [property: JsonPropertyName("session_lifetime")] int? SessionLifetime);
public sealed record SystemRelayUpdateRequest(
    [property: JsonPropertyName("port_min")] int? PortMin,
    [property: JsonPropertyName("port_max")] int? PortMax,
    [property: JsonPropertyName("token_lifetime")] int? TokenLifetime,
    [property: JsonPropertyName("cookie_lifetime")] int? CookieLifetime,
    [property: JsonPropertyName("cookie_name")] string? CookieName);
public sealed record SystemWebUpdateRequest(
    [property: JsonPropertyName("public_domain")] string? PublicDomain,
    [property: JsonPropertyName("base_url")] string? BaseUrl,
    [property: JsonPropertyName("cors_origins")] string? CorsOrigins,
    [property: JsonPropertyName("swagger_enabled")] bool? SwaggerEnabled);
public sealed record SystemTlsUpdateRequest(
    [property: JsonPropertyName("cert_path")] string? CertPath,
    [property: JsonPropertyName("key_path")] string? KeyPath,
    [property: JsonPropertyName("certbot_email")] string? CertbotEmail);
