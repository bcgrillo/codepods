using Codepods.Core.Domain;
using Codepods.Core.Ports;
using Codepods.Core.Security;

namespace Codepods.Core.UseCases;

public sealed class VariableUseCase
{
    private readonly IVariableRepository _variables;

    public VariableUseCase(IVariableRepository variables)
    {
        _variables = variables;
    }

    public async Task<IReadOnlyList<VariableView>> ListAsync(int? codepodId = null, CancellationToken ct = default)
    {
        var rows = await _variables.ListAsync(codepodId, ct);
        return rows.Select(ToView).ToList();
    }

    public async Task<VariableView> GetAsync(int id, CancellationToken ct = default)
    {
        var row = await _variables.GetAsync(id, ct) ?? throw new InvalidOperationException("Variable not found");
        return ToView(row);
    }

    public async Task<VariableView> CreateAsync(string name, string value, bool isSecret, int? codepodId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException("name is required");
        }

        var storedValue = isSecret ? SecretCipher.Encrypt(value) : value;
        var row = await _variables.AddAsync(new Variable
        {
            Name = name.Trim(),
            Value = storedValue,
            IsSecret = isSecret,
            CodepodId = codepodId
        }, ct);
        return ToView(row);
    }

    public async Task<VariableView> UpdateAsync(int id, string? name, string? value, bool? isSecret, int? codepodId, bool updateCodepodId, CancellationToken ct = default)
    {
        var row = await _variables.GetAsync(id, ct) ?? throw new InvalidOperationException("Variable not found");

        if (!string.IsNullOrWhiteSpace(name))
        {
            row.Name = name.Trim();
        }

        var effectiveSecret = isSecret ?? row.IsSecret;
        if (value is not null)
        {
            row.Value = effectiveSecret ? SecretCipher.Encrypt(value) : value;
        }
        else if (isSecret.HasValue && isSecret.Value != row.IsSecret)
        {
            // On secret -> plain transition without a replacement value, clear the value
            // to avoid exposing the previous secret in future non-secret reads.
            if (row.IsSecret && !effectiveSecret)
            {
                row.Value = string.Empty;
            }
            else
            {
                // Re-encrypt current plain value when plain -> secret.
                var currentPlain = row.IsSecret ? SecretCipher.Decrypt(row.Value) : row.Value;
                row.Value = effectiveSecret ? SecretCipher.Encrypt(currentPlain) : currentPlain;
            }
        }

        row.IsSecret = effectiveSecret;
        if (updateCodepodId)
        {
            row.CodepodId = codepodId;
        }
        row.UpdatedAtUtc = DateTime.UtcNow;
        row = await _variables.UpdateAsync(row, ct);
        return ToView(row);
    }

    public Task DeleteAsync(int id, CancellationToken ct = default) => _variables.DeleteAsync(id, ct);

    private static VariableView ToView(Variable row)
    {
        var publicValue = row.IsSecret ? null : row.Value;
        return new VariableView(
            row.Id,
            row.Name,
            publicValue,
            row.IsSecret,
            row.IsSecret,
            row.CodepodId,
            row.CreatedAtUtc,
            row.UpdatedAtUtc);
    }
}

public sealed record VariableView(
    int Id,
    string Name,
    string? Value,
    bool IsSecret,
    bool IsValueRedacted,
    int? CodepodId,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc
);
