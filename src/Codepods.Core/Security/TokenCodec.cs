using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Codepods.Core.Security;

public static class TokenCodec
{
    public static string CreateToken(IDictionary<string, object?> payload, string secret)
    {
        var json = JsonSerializer.Serialize(payload);
        var signature = Sign(json, secret);
        var raw = $"{json}|{signature}";
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(raw));
    }

    public static Dictionary<string, JsonElement> DecodeToken(string token, string secret)
    {
        var raw = Encoding.UTF8.GetString(Convert.FromBase64String(token));
        var idx = raw.LastIndexOf('|');
        if (idx <= 0)
        {
            throw new InvalidOperationException("invalid token");
        }

        var json = raw[..idx];
        var signature = raw[(idx + 1)..];
        var expected = Sign(json, secret);
        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(signature), Encoding.UTF8.GetBytes(expected)))
        {
            throw new InvalidOperationException("invalid token");
        }

        var payload = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json);
        if (payload is null)
        {
            throw new InvalidOperationException("invalid token payload");
        }

        if (!payload.TryGetValue("exp", out var expNode) || expNode.ValueKind != JsonValueKind.Number)
        {
            throw new InvalidOperationException("token missing exp");
        }

        var exp = expNode.GetInt64();
        if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > exp)
        {
            throw new InvalidOperationException("token expired");
        }

        return payload;
    }

    private static string Sign(string payload, string secret)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
