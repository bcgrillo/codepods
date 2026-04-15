namespace Codepods.Api.Relay;

public sealed record RelayRuntimeSettings(
    string SessionSecret,
    string RelayCookieName,
    string PublicDomain,
    string WebBaseUrl,
    string TlsCertPath,
    string TlsKeyPath);