using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using System.Diagnostics;

namespace PawfeedsProvisioner.Services;

// --- START MODIFICATION ---
// Added ContainerWeight to the device status information
public record DeviceStatus(string DisplayName, string Hostname, string Ip, string FeederIp, int FeederId, double ContainerWeight);
// --- END MODIFICATION ---

public class LanDiscoveryService
{
    private readonly IServiceProvider _serviceProvider;

    public LanDiscoveryService(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public async Task<List<DeviceStatus>> ScanAsync(CancellationToken ct = default)
    {
        var netInfo = _serviceProvider.GetService<INetworkInfo>();
        if (netInfo == null) return new();

        var (localIp, _) = netInfo.GetLocalIpAndPrefix();
        if (localIp == null || localIp.AddressFamily != AddressFamily.InterNetwork)
            return new();

        var bytes = localIp.GetAddressBytes();
        var netPrefix = new byte[] { bytes[0], bytes[1], bytes[2], 0 };
        
        // --- START MODIFICATION ---
        // The tuple now includes a spot to store the weight from the feeder's status
        var discoveredDevices = new ConcurrentBag<(string Ip, string Mode, string Hostname, double Weight)>();
        // --- END MODIFICATION ---
        
        var tasks = new List<Task>();
        using var sem = new SemaphoreSlim(32);
        using var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };

        for (int host = 1; host <= 254; host++)
        {
            var ip = new IPAddress(new byte[] { netPrefix[0], netPrefix[1], netPrefix[2], (byte)host }).ToString();
            if (ip == localIp.ToString()) continue;

            await sem.WaitAsync(ct);
            tasks.Add(Task.Run(async () =>
            {
                try
                {
                    var url = $"http://{ip}/status";
                    Debug.WriteLine($"[LanDiscoveryService] Scanning IP: {ip}...");
                    using var resp = await httpClient.GetAsync(url, ct);

                    if (!resp.IsSuccessStatusCode)
                    {
                        Debug.WriteLine($"[LanDiscoveryService] Failed to get status from {ip}. Status: {resp.StatusCode}");
                        return;
                    }

                    using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
                    var root = doc.RootElement;
                    var mode = root.TryGetProperty("mode", out var m) ? m.GetString() ?? "" : "";
                    var connected = root.TryGetProperty("connected", out var c) && c.GetBoolean();
                    var hostname = root.TryGetProperty("hostname", out var h) ? h.GetString() ?? "" : "";

                    // --- START MODIFICATION ---
                    // We parse the container_weight_grams field from the JSON response.
                    var weight = root.TryGetProperty("container_weight_grams", out var w) ? w.GetDouble() : 0.0;
                    // --- END MODIFICATION ---

                    if (connected && !string.IsNullOrEmpty(mode) && !string.IsNullOrEmpty(hostname))
                    {
                        Debug.WriteLine($"[LanDiscoveryService] SUCCESS! Discovered {hostname} at {ip}");
                        // --- START MODIFICATION ---
                        // The discovered weight is now added to our collection
                        discoveredDevices.Add((ip, mode, hostname, weight));
                        // --- END MODIFICATION ---
                    }
                    else
                    {
                        Debug.WriteLine($"[LanDiscoveryService] Device at {ip} did not match expected criteria.");
                    }
                }
                catch (OperationCanceledException)
                {
                    Debug.WriteLine($"[LanDiscoveryService] Scan to {ip} was cancelled.");
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[LanDiscoveryService] Error scanning {ip}: {ex.Message}");
                }
                finally
                {
                    sem.Release();
                }
            }, ct));
        }

        await Task.WhenAll(tasks);
        if (ct.IsCancellationRequested) return new();

        var cameras = discoveredDevices.Where(d => d.Mode == "camera-sta" && d.Hostname.StartsWith("pawfeeds-cam-")).ToList();
        var feeders = discoveredDevices.Where(d => d.Mode == "sta" && d.Hostname.StartsWith("pawfeeds-std-")).ToList();
        var results = new List<DeviceStatus>();

        foreach (var feederBrain in feeders)
        {
            string customName = feederBrain.Hostname.Substring("pawfeeds-std-".Length);

            var cam1 = cameras.FirstOrDefault(c => c.Hostname == $"pawfeeds-cam-{customName}");
            if (cam1.Hostname != null)
            {
                // --- START MODIFICATION ---
                // We now include the feeder's container weight when creating the final device object
                results.Add(new DeviceStatus(
                    DisplayName: $"Feeder 1 ({customName})",
                    Hostname: cam1.Hostname,
                    Ip: cam1.Ip,
                    FeederIp: feederBrain.Ip,
                    FeederId: 1,
                    ContainerWeight: feederBrain.Weight 
                ));
                // --- END MODIFICATION ---
            }

            var cam2 = cameras.FirstOrDefault(c => c.Hostname == $"pawfeeds-cam-{customName}-2");
            if (cam2.Hostname != null)
            {
                // --- START MODIFICATION ---
                // The same weight is used for Feeder 2, as they share the same container
                results.Add(new DeviceStatus(
                    DisplayName: $"Feeder 2 ({customName})",
                    Hostname: cam2.Hostname,
                    Ip: cam2.Ip,
                    FeederIp: feederBrain.Ip,
                    FeederId: 2,
                    ContainerWeight: feederBrain.Weight
                ));
                // --- END MODIFICATION ---
            }
        }
        
        Debug.WriteLine($"[LanDiscoveryService] Scan complete. Found {results.Count} devices.");
        return results.OrderBy(d => d.DisplayName).ToList();
    }
    
    public async Task<List<string>> ScanForAnyDeviceAsync(CancellationToken ct = default)
    {
        // This method remains unchanged
        var netInfo = _serviceProvider.GetService<INetworkInfo>();
        if (netInfo == null) return new List<string>();

        var (localIp, prefix) = netInfo.GetLocalIpAndPrefix();
        if (localIp == null || localIp.AddressFamily != AddressFamily.InterNetwork)
            return new List<string>();

        var bytes = localIp.GetAddressBytes();
        var netPrefix = new byte[] { bytes[0], bytes[1], bytes[2], 0 };
        
        var discoveredIps = new ConcurrentBag<string>();
        var tasks = new List<Task>();
        using var sem = new SemaphoreSlim(32);
        using var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };

        for (int host = 1; host <= 254; host++)
        {
            var ip = new IPAddress(new byte[] { netPrefix[0], netPrefix[1], netPrefix[2], (byte)host }).ToString();
            if (ip == localIp.ToString()) continue;

            await sem.WaitAsync(ct);
            tasks.Add(Task.Run(async () =>
            {
                try
                {
                    var url = $"http://{ip}/status";
                    using var resp = await httpClient.GetAsync(url, ct);
                    if (resp.IsSuccessStatusCode)
                    {
                        discoveredIps.Add(ip);
                    }
                }
                catch { /* ignore timeouts and other errors */ }
                finally { sem.Release(); }
            }, ct));
        }

        await Task.WhenAll(tasks);
        return discoveredIps.OrderBy(ip => ip).ToList();
    }
}