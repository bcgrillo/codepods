using Codepods.Core.Domain;
using Codepods.Core.Ports;

namespace Codepods.Core.UseCases;

public sealed class ProviderUseCase
{
    private readonly IProviderRepository _providers;

    public ProviderUseCase(IProviderRepository providers)
    {
        _providers = providers;
    }

    public Task<IReadOnlyList<Provider>> ListAsync(CancellationToken ct = default) => _providers.ListAsync(ct);

    public async Task<Provider> GetAsync(int id, CancellationToken ct = default)
        => await _providers.GetAsync(id, ct) ?? throw new InvalidOperationException("Provider not found");

    public async Task<Provider> CreateAsync(string name, string providerType, string configurationJson, CancellationToken ct = default)
    {
        var parsedType = ParseProviderType(providerType);
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException("name is required");
        }

        return await _providers.AddAsync(new Provider
        {
            Name = name.Trim(),
            ProviderType = parsedType,
            ConfigurationJson = string.IsNullOrWhiteSpace(configurationJson) ? "{}" : configurationJson
        }, ct);
    }

    public async Task<Provider> UpdateAsync(int id, string? name, string? providerType, string? configurationJson, CancellationToken ct = default)
    {
        var row = await GetAsync(id, ct);
        if (!string.IsNullOrWhiteSpace(name))
        {
            row.Name = name.Trim();
        }
        if (!string.IsNullOrWhiteSpace(providerType))
        {
            row.ProviderType = ParseProviderType(providerType);
        }
        if (configurationJson is not null)
        {
            row.ConfigurationJson = string.IsNullOrWhiteSpace(configurationJson) ? "{}" : configurationJson;
        }
        row.UpdatedAtUtc = DateTime.UtcNow;
        return await _providers.UpdateAsync(row, ct);
    }

    public Task DeleteAsync(int id, CancellationToken ct = default) => _providers.DeleteAsync(id, ct);

    private static ProviderType ParseProviderType(string raw)
    {
        var value = raw.Trim().ToLowerInvariant();
        return value switch
        {
            "openai" => ProviderType.OpenAi,
            "azure_openai" => ProviderType.AzureOpenAi,
            "github_copilot" => ProviderType.GithubCopilot,
            _ => throw new InvalidOperationException($"Invalid provider_type: {raw}")
        };
    }
}
