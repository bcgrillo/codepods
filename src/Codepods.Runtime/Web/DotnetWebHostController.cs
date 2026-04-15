using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using Codepods.Core.Configuration;
using Codepods.Core.Ports;

namespace Codepods.Runtime.Web;

public sealed class DotnetWebHostController : IWebHostController
{
    private readonly string _rootPath;
    private readonly string _pidFile;
    private readonly string _logFile;
    private readonly CodepodsConfig _config;

    public DotnetWebHostController(CodepodsConfig config)
    {
        _config = config;
        _rootPath = config.App.RootPath;
        var varDir = Path.Combine(_rootPath, "var");
        Directory.CreateDirectory(varDir);
        _pidFile = Path.Combine(varDir, "codepods-web.pid");
        _logFile = Path.Combine(varDir, "codepods-web.log");
    }

    public async Task<WebHostStatus> StartAsync(string host, int port, CancellationToken ct = default)
    {
        var existing = ReadPid(_pidFile);
        if (existing.HasValue && IsProcessRunning(existing.Value))
        {
            return new WebHostStatus(true, existing.Value, BuildUrl(host, port), _logFile, "already running");
        }

        var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "dotnet",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                WorkingDirectory = _rootPath
            }
        };
        process.StartInfo.ArgumentList.Add("run");
        process.StartInfo.ArgumentList.Add("--project");
        process.StartInfo.ArgumentList.Add("src/Codepods.Api");
        process.StartInfo.ArgumentList.Add("--no-launch-profile");
        process.StartInfo.Environment["ASPNETCORE_URLS"] = BuildUrl(host, port);

        var publicDomain = ResolvePublicDomain(host);
        if (!string.IsNullOrWhiteSpace(publicDomain))
        {
            process.StartInfo.Environment["PUBLIC_DOMAIN"] = publicDomain;
        }

        if (TryResolveCertificate(publicDomain, out var certPath, out var keyPath))
        {
            process.StartInfo.Environment["ASPNETCORE_Kestrel__Certificates__Default__Path"] = certPath;
            process.StartInfo.Environment["ASPNETCORE_Kestrel__Certificates__Default__KeyPath"] = keyPath;
        }

        var logStream = new FileStream(_logFile, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
        var logWriter = new StreamWriter(logStream) { AutoFlush = true };
        process.OutputDataReceived += (_, e) => { if (e.Data is not null) logWriter.WriteLine(e.Data); };
        process.ErrorDataReceived += (_, e) => { if (e.Data is not null) logWriter.WriteLine(e.Data); };
        process.EnableRaisingEvents = true;
        process.Exited += (_, _) =>
        {
            try { logWriter.Dispose(); } catch { }
            try { logStream.Dispose(); } catch { }
        };

        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        var ready = await WaitUntilReadyAsync(process.Id, host, port, ct);
        if (!ready)
        {
            try
            {
                if (!process.HasExited)
                {
                    process.Kill(entireProcessTree: true);
                }
            }
            catch
            {
                // best effort
            }
            return new WebHostStatus(false, null, null, _logFile, "failed to start");
        }

        await File.WriteAllTextAsync(_pidFile, process.Id.ToString(), ct);
        return new WebHostStatus(true, process.Id, BuildUrl(host, port), _logFile, "started");
    }

    public Task<WebHostStatus> StopAsync(CancellationToken ct = default)
    {
        var candidates = new HashSet<int>();
        var pidFromFile = ReadPid(_pidFile);
        if (pidFromFile.HasValue)
        {
            candidates.Add(pidFromFile.Value);
        }

        foreach (var pid in FindCodepodsApiProcessIds())
        {
            candidates.Add(pid);
        }

        var killed = false;
        foreach (var pid in candidates)
        {
            if (!IsProcessRunning(pid))
            {
                continue;
            }

            try
            {
                var proc = Process.GetProcessById(pid);
                proc.Kill(entireProcessTree: true);
                proc.WaitForExit(5000);
                killed = true;
            }
            catch
            {
                // best effort
            }
        }

        if (!killed && candidates.Count == 0)
        {
            TryDelete(_pidFile);
            return Task.FromResult(new WebHostStatus(false, null, null, _logFile, "already stopped"));
        }

        try
        {
            // short grace period to ensure sockets are released
            Thread.Sleep(300);
        }
        catch
        {
        }

        TryDelete(_pidFile);
        return Task.FromResult(new WebHostStatus(false, null, null, _logFile, killed ? "stopped" : "already stopped"));
    }

    public async Task<WebHostStatus> RestartAsync(string host, int port, CancellationToken ct = default)
    {
        await StopAsync(ct);
        return await StartAsync(host, port, ct);
    }

    public Task<WebHostStatus> StatusAsync(CancellationToken ct = default)
    {
        var pid = ReadPid(_pidFile);
        if (!pid.HasValue || !IsProcessRunning(pid.Value))
        {
            return Task.FromResult(new WebHostStatus(false, null, null, _logFile, "stopped"));
        }

        return Task.FromResult(new WebHostStatus(true, pid.Value, null, _logFile, "running"));
    }

    private static int? ReadPid(string path)
    {
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            var raw = File.ReadAllText(path).Trim();
            if (int.TryParse(raw, out var pid))
            {
                return pid;
            }
        }
        catch
        {
        }

        return null;
    }

    private static bool IsProcessRunning(int pid)
    {
        try
        {
            var process = Process.GetProcessById(pid);
            return !process.HasExited;
        }
        catch
        {
            return false;
        }
    }

    private static IEnumerable<int> FindCodepodsApiProcessIds()
    {
        foreach (var process in Process.GetProcessesByName("dotnet"))
        {
            string cmdline;
            try
            {
                cmdline = ReadProcessCommandLine(process.Id);
            }
            catch
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(cmdline))
            {
                continue;
            }

            if (cmdline.Contains("Codepods.Api", StringComparison.OrdinalIgnoreCase) ||
                cmdline.Contains("src/Codepods.Api", StringComparison.OrdinalIgnoreCase) ||
                cmdline.Contains("src\\Codepods.Api", StringComparison.OrdinalIgnoreCase))
            {
                yield return process.Id;
            }
        }
    }

    private static string ReadProcessCommandLine(int pid)
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        {
            var path = $"/proc/{pid}/cmdline";
            if (!File.Exists(path))
            {
                return string.Empty;
            }

            var raw = File.ReadAllBytes(path);
            return System.Text.Encoding.UTF8.GetString(raw).Replace('\0', ' ').Trim();
        }

        // Non-Linux fallback: best effort via process name only.
        using var process = Process.GetProcessById(pid);
        return process.ProcessName;
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
        }
    }

    private static string BuildUrl(string host, int port) => $"https://{host}:{port}";

    private static async Task<bool> WaitUntilReadyAsync(int pid, string host, int port, CancellationToken ct)
    {
        var deadline = DateTime.UtcNow.AddSeconds(45);
        var probeHost = ResolveProbeHost(host);

        while (DateTime.UtcNow < deadline && !ct.IsCancellationRequested)
        {
            if (!IsProcessRunning(pid))
            {
                return false;
            }

            if (await CanConnectAsync(probeHost, port, ct))
            {
                return true;
            }

            await Task.Delay(300, ct);
        }

        return false;
    }

    private static string ResolveProbeHost(string host)
    {
        var normalized = host.Trim();
        if (normalized == "0.0.0.0" || normalized == "::")
        {
            return "127.0.0.1";
        }

        return string.IsNullOrWhiteSpace(normalized) ? "127.0.0.1" : normalized;
    }

    private static async Task<bool> CanConnectAsync(string host, int port, CancellationToken ct)
    {
        try
        {
            using var client = new TcpClient();
            var connectTask = client.ConnectAsync(host, port);
            var timeoutTask = Task.Delay(TimeSpan.FromSeconds(1), ct);
            var winner = await Task.WhenAny(connectTask, timeoutTask);
            if (winner != connectTask)
            {
                return false;
            }

            await connectTask;
            return client.Connected;
        }
        catch
        {
            return false;
        }
    }

    private string ResolvePublicDomain(string host)
    {
        if (!string.IsNullOrWhiteSpace(_config.Web.PublicDomain))
        {
            return _config.Web.PublicDomain.Trim();
        }

        var normalizedHost = host.Trim();
        if (string.IsNullOrWhiteSpace(normalizedHost))
        {
            return string.Empty;
        }

        if (normalizedHost == "0.0.0.0" || normalizedHost == "::" || normalizedHost.Equals("localhost", StringComparison.OrdinalIgnoreCase))
        {
            return TryDiscoverSingleCertDomain();
        }

        if (IPAddress.TryParse(normalizedHost, out _))
        {
            return string.Empty;
        }

        return normalizedHost;
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

    private bool TryResolveCertificate(string publicDomain, out string certPath, out string keyPath)
    {
        certPath = string.Empty;
        keyPath = string.Empty;

        if (!string.IsNullOrWhiteSpace(_config.Tls.CertPath) &&
            !string.IsNullOrWhiteSpace(_config.Tls.KeyPath) &&
            File.Exists(_config.Tls.CertPath) &&
            File.Exists(_config.Tls.KeyPath))
        {
            certPath = _config.Tls.CertPath;
            keyPath = _config.Tls.KeyPath;
            return true;
        }

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
}
