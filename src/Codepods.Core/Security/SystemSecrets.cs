using System.Security.Cryptography;
using System.Text;

namespace Codepods.Core.Security;

public static class SystemSecrets
{
    private static readonly object Sync = new();
    private static byte[]? _master;

    public static void Initialize(string rootPath, string? masterKeyPath = null)
    {
        lock (Sync)
        {
            if (_master is not null)
            {
                return;
            }

            var resolved = ResolveMasterPath(rootPath, masterKeyPath);
            var dir = Path.GetDirectoryName(resolved);
            if (!string.IsNullOrWhiteSpace(dir))
            {
                Directory.CreateDirectory(dir);
            }

            if (File.Exists(resolved))
            {
                var raw = File.ReadAllText(resolved).Trim();
                _master = Convert.FromBase64String(raw);
                return;
            }

            _master = RandomNumberGenerator.GetBytes(32);
            File.WriteAllText(resolved, Convert.ToBase64String(_master));
        }
    }

    public static byte[] DeriveKey(string purpose, int length = 32)
    {
        if (length <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(length));
        }

        EnsureInitialized();
        using var hmac = new HMACSHA256(_master!);
        var key = hmac.ComputeHash(Encoding.UTF8.GetBytes($"codepods:{purpose}"));
        if (length == key.Length)
        {
            return key;
        }

        if (length < key.Length)
        {
            return key[..length];
        }

        var output = new byte[length];
        var offset = 0;
        var round = 1;
        var seed = key;
        while (offset < output.Length)
        {
            using var roundHmac = new HMACSHA256(_master!);
            var suffix = Encoding.UTF8.GetBytes($":{round}");
            var input = new byte[seed.Length + suffix.Length];
            Buffer.BlockCopy(seed, 0, input, 0, seed.Length);
            Buffer.BlockCopy(suffix, 0, input, seed.Length, suffix.Length);
            seed = roundHmac.ComputeHash(input);
            var take = Math.Min(seed.Length, output.Length - offset);
            Buffer.BlockCopy(seed, 0, output, offset, take);
            offset += take;
            round++;
        }

        return output;
    }

    public static string DeriveSecretString(string purpose)
    {
        return Convert.ToBase64String(DeriveKey(purpose));
    }

    private static string ResolveMasterPath(string rootPath, string? configuredPath)
    {
        if (!string.IsNullOrWhiteSpace(configuredPath))
        {
            return Path.IsPathRooted(configuredPath)
                ? configuredPath
                : Path.GetFullPath(Path.Combine(rootPath, configuredPath));
        }

        return Path.Combine(rootPath, "var", "keys", "master.key");
    }

    private static void EnsureInitialized()
    {
        if (_master is not null)
        {
            return;
        }

        Initialize(Directory.GetCurrentDirectory());
    }
}
