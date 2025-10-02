using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using PawfeedsProvisioner.Models;

namespace PawfeedsProvisioner.Services
{
    /// <summary>
    /// Discovers Pawfeeds devices on the local /24 by probing /hello and /status.
    /// Tolerant: if either endpoint returns HTTP 200, we treat the host as a device.
    /// Pairs camera (pawfeeds-cam-*) with feeder (pawfeeds-std-*) and infers FeederId from "-2" suffix.
    /// </summary>
    public class LanDiscoveryService
    {
        private readonly IServiceProvider _sp;

        public LanDiscoveryService(IServiceProvider sp)
        {
            _sp = sp;
        }

        /// <summary>
        /// Main scan used by FindDevicePage. Returns paired entries per feeder slot (1/2).
        /// </summary>
        public async Task<List<OnlineDeviceViewModel>> ScanAsync(CancellationToken ct)
        {
            var localIp = GetLocalIPv4();
            if (localIp == null)
            {
                Debug.WriteLine("[LanDiscovery] No local IPv4 found.");
                return new List<OnlineDeviceViewModel>();
            }

            var prefix = localIp.GetAddressBytes();
            var cams = new ConcurrentDictionary<string, (string hostname, string ip)>();
            var stds = new ConcurrentDictionary<string, (string hostname, string ip, double weight)>();

            using var http = new HttpClient() { Timeout = TimeSpan.FromSeconds(3) };
            var sem = new SemaphoreSlim(64);
            var tasks = new List<Task>(254);

            for (int host = 1; host <= 254; host++)
            {
                var ip = new IPAddress(new byte[] { prefix[0], prefix[1], prefix[2], (byte)host });
                if (ip.Equals(localIp)) continue;

                await sem.WaitAsync(ct);
                tasks.Add(Task.Run(async () =>
                {
                    try
                    {
                        await ProbeHostAsync(http, ip.ToString(), cams, stds, ct);
                    }
                    catch
                    {
                        // per-host errors ignored
                    }
                    finally
                    {
                        sem.Release();
                    }
                }, ct));
            }

            await Task.WhenAll(tasks);

            // Pair by core name + feeder slot
            var keys = new HashSet<(string core, int feederId)>();
            foreach (var k in cams.Keys)
            {
                var (core, fid) = ParseCoreAndFeeder(k);
                keys.Add((core, fid));
            }
            foreach (var k in stds.Keys)
            {
                var (core, fid) = ParseCoreAndFeeder(k);
                keys.Add((core, fid));
            }

            var list = new List<OnlineDeviceViewModel>();
            foreach (var key in keys)
            {
                // Reconstruct canonical keys
                string camKey = $"pawfeeds-cam-{key.core}" + (key.feederId == 2 ? "-2" : "");
                string stdKey = $"pawfeeds-std-{key.core}";

                cams.TryGetValue(camKey, out var cam);
                stds.TryGetValue(stdKey, out var std);

                var displayName = $"{key.core} • Feeder {key.feederId}";
                var vm = new OnlineDeviceViewModel
                {
                    DeviceId = "", // injected later by FindDevicePage from Firestore/provision
                    DisplayName = displayName,
                    Hostname = !string.IsNullOrWhiteSpace(cam.hostname) ? cam.hostname :
                               (!string.IsNullOrWhiteSpace(std.hostname) ? std.hostname : $"pawfeeds-{key.core}"),
                    Ip = cam.ip,               // camera IP (may be null/empty if not found)
                    FeederIp = std.ip,         // feeder IP (may be null/empty if not found)
                    FeederId = key.feederId,
                    ContainerWeight = std.weight
                };
                list.Add(vm);
            }

            // Sort for stable UI
            return list.OrderBy(v => v.DisplayName).ToList();
        }

        // =======================
        // Helpers / probe logic
        // =======================

        private static IPAddress? GetLocalIPv4()
        {
            foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != OperationalStatus.Up) continue;
                var props = ni.GetIPProperties();
                foreach (var ua in props.UnicastAddresses)
                {
                    if (ua.Address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ua.Address))
                        return ua.Address;
                }
            }
            return null;
        }

        private static (string core, int feederId) ParseCoreAndFeeder(string hostname)
        {
            // pawfeeds-cam-rocket      -> core=rocket, fid=1
            // pawfeeds-cam-rocket-2    -> core=rocket, fid=2
            // pawfeeds-std-rocket      -> core=rocket, fid inferred by paired cam key (default 1)
            var s = hostname;
            if (s.StartsWith("pawfeeds-cam-")) s = s.Substring("pawfeeds-cam-".Length);
            if (s.StartsWith("pawfeeds-std-")) s = s.Substring("pawfeeds-std-".Length);

            int fid = 1;
            if (s.EndsWith("-2", StringComparison.Ordinal))
            {
                fid = 2;
                s = s.Substring(0, s.Length - 2);
            }
            return (s, fid);
        }

        private static async Task ProbeHostAsync(
    HttpClient http,
    string ip,
    ConcurrentDictionary<string, (string hostname, string ip)> cams,
    ConcurrentDictionary<string, (string hostname, string ip, double weight)> stds,
    CancellationToken ct)
{
    string? hostname = null;
    string? type = null;
    double weight = 0;
    bool anyOk = false;

    // /hello (tolerant)
    try
    {
        using var resp = await http.GetAsync($"http://{ip}/hello", ct);
        if (resp.IsSuccessStatusCode)
        {
            anyOk = true;
            var s = await resp.Content.ReadAsStringAsync(ct);
            TryParseHello(s, out var hostFromHello, out var typeFromHello);
            if (!string.IsNullOrWhiteSpace(hostFromHello)) hostname = hostFromHello;
            if (!string.IsNullOrWhiteSpace(typeFromHello)) type = typeFromHello;
        }
    }
    catch { /* ignore */ }

    // /status (tolerant)
    try
    {
        using var resp = await http.GetAsync($"http://{ip}/status", ct);
        if (resp.IsSuccessStatusCode)
        {
            anyOk = true;
            var s = await resp.Content.ReadAsStringAsync(ct);
            TryParseStatus(s, out var hostFromStatus, out var typeFromStatus, out var weightFromStatus);
            if (!string.IsNullOrWhiteSpace(hostFromStatus)) hostname ??= hostFromStatus;
            if (!string.IsNullOrWhiteSpace(typeFromStatus)) type ??= typeFromStatus;
            if (weightFromStatus.HasValue) weight = weightFromStatus.Value;
        }
    }
    catch { /* ignore */ }

    if (!anyOk) return;

    // Heuristics if "type" missing
    var finalHost = hostname ?? string.Empty;
    if (string.IsNullOrWhiteSpace(type))
    {
        if (finalHost.StartsWith("pawfeeds-cam-")) type = "camera";
        else if (finalHost.StartsWith("pawfeeds-std-")) type = "feeder";
    }

    if (type == "camera")
    {
        var key = !string.IsNullOrWhiteSpace(finalHost) ? finalHost : $"pawfeeds-cam-{ip.Replace('.', '-')}";
        cams.TryAdd(key, (finalHost == string.Empty ? key : finalHost, ip));
    }
    else if (type == "feeder")
    {
        var key = !string.IsNullOrWhiteSpace(finalHost) ? finalHost : $"pawfeeds-std-{ip.Replace('.', '-')}";
        stds.TryAdd(key, (finalHost == string.Empty ? key : finalHost, ip, weight));
    }
    else
    {
        // Unknown, default classification
        if (finalHost.StartsWith("pawfeeds-std-"))
        {
            stds.TryAdd(finalHost, (finalHost, ip, weight));
        }
        else
        {
            var key = string.IsNullOrWhiteSpace(finalHost) ? $"pawfeeds-cam-{ip.Replace('.', '-')}" : finalHost;
            cams.TryAdd(key, (key, ip));
        }
    }
}


        private static void TryParseHello(string text, out string? hostname, out string? type)
        {
            hostname = null; type = null;
            try
            {
                using var doc = JsonDocument.Parse(text);
                var root = doc.RootElement;
                hostname = TryGetString(root, "hostname") ?? TryGetString(root, "host") ?? TryGetString(root, "name");
                type = TryGetString(root, "type") ?? TryGetString(root, "device") ?? TryGetString(root, "role");
            }
            catch
            {
                // non-JSON or malformed; ignore
            }
        }

        private static void TryParseStatus(string text, out string? hostname, out string? type, out double? weight)
        {
            hostname = null; type = null; weight = null;
            try
            {
                using var doc = JsonDocument.Parse(text);
                var root = doc.RootElement;
                hostname = TryGetString(root, "hostname") ?? TryGetString(root, "host") ?? TryGetString(root, "name");
                type = TryGetString(root, "type") ?? TryGetString(root, "device") ?? TryGetString(root, "role");

                if (TryGetNumber(root, "container_weight_grams", out var w) ||
                    TryGetNumber(root, "containerWeightGrams", out w) ||
                    TryGetNumber(root, "weight", out w))
                {
                    weight = w;
                }
            }
            catch
            {
                // ignore parse errors
            }
        }

        private static string? TryGetString(JsonElement el, string key)
        {
            if (el.ValueKind == JsonValueKind.Object && el.TryGetProperty(key, out var v))
            {
                if (v.ValueKind == JsonValueKind.String) return v.GetString();
            }
            return null;
        }

        private static bool TryGetNumber(JsonElement el, string key, out double value)
        {
            value = 0;
            if (el.ValueKind == JsonValueKind.Object && el.TryGetProperty(key, out var v))
            {
                if (v.ValueKind == JsonValueKind.Number)
                {
                    return v.TryGetDouble(out value);
                }
                if (v.ValueKind == JsonValueKind.String && double.TryParse(v.GetString(), out value))
                {
                    return true;
                }
            }
            return false;
        }
    }
}
