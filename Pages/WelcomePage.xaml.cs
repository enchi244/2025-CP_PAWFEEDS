using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Maui.Controls;
using PawfeedsProvisioner.Services;

namespace PawfeedsProvisioner.Pages
{
    public partial class WelcomePage : ContentPage
    {
        private readonly ProvisioningClient _provisioningClient;
        private readonly LanDiscoveryService _lanDiscovery; // kept for other flows, not required for quick scan
        private readonly ISystemSettingsOpener _settings;
        private readonly AuthService _auth;

        public WelcomePage(ProvisioningClient provisioningClient,
                           LanDiscoveryService lanDiscovery,
                           ISystemSettingsOpener settings,
                           AuthService auth)
        {
            InitializeComponent();
            _provisioningClient = provisioningClient;
            _lanDiscovery = lanDiscovery;
            _settings = settings;
            _auth = auth;
        }

        // Wired in XAML: Clicked="OnStartClicked"
        private async void OnStartClicked(object sender, EventArgs e)
        {
            // FIX: start provisioning flow at ConnectToDevicePage instead of ScanNetworksPage
            await Shell.Current.GoToAsync(nameof(ConnectToDevicePage));
        }

        // Wired in XAML: Clicked="OnFindClicked"
        private async void OnFindClicked(object sender, EventArgs e)
        {
            await Shell.Current.GoToAsync("//find");
        }

        // Wired in XAML: Clicked="OnSignOutClicked"
        private async void OnSignOutClicked(object sender, EventArgs e)
        {
            try { await _auth.SignOutAsync(); }
            catch (Exception ex) { System.Diagnostics.Debug.WriteLine($"[WelcomePage] SignOut failed: {ex.Message}"); }
            await Shell.Current.GoToAsync("//login");
        }

        // Wired in XAML: Clicked="OnResetClicked"
        private async void OnResetClicked(object sender, EventArgs e)
        {
            try
            {
                // 1) Try the ultra-simple quick scan first
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(8));
                var ips = await QuickFindEspIpsAsync(cts.Token);

                string? targetIp = null;

                if (ips.Count == 1)
                {
                    // Single hit → reset immediately
                    targetIp = ips[0];
                }
                else if (ips.Count > 1)
                {
                    // Multiple hits → let the user pick which IP to reset
                    var selected = await DisplayActionSheet("Select a device to reset", "Cancel", null, ips.ToArray());
                    if (string.IsNullOrEmpty(selected) || selected == "Cancel") return;
                    targetIp = selected;
                }
                else
                {
                    // 2) No hits: offer AP mode or manual IP as fallback
                    var choice = await DisplayActionSheet(
                        "No devices found by quick scan",
                        "Cancel", null,
                        "Use AP (192.168.4.1)",
                        "Enter IP Manually");

                    if (string.IsNullOrEmpty(choice) || choice == "Cancel")
                        return;

                    if (choice == "Use AP (192.168.4.1)")
                    {
                        await _settings.OpenWifiSettingsAsync();
                        targetIp = "192.168.4.1";
                    }
                    else // "Enter IP Manually"
                    {
                        var ipInput = await DisplayPromptAsync("Manual IP", "Enter device IP address (e.g., 192.168.1.123):", keyboard: Keyboard.Plain);
                        if (string.IsNullOrWhiteSpace(ipInput)) return;

                        if (!IPAddress.TryParse(ipInput.Trim(), out _))
                        {
                            await DisplayAlert("Invalid IP", "Please enter a valid IPv4 address.", "OK");
                            return;
                        }
                        targetIp = ipInput.Trim();
                    }
                }

                if (string.IsNullOrWhiteSpace(targetIp)) return;

                var ok = await _provisioningClient.FactoryResetAsync(targetIp);
                if (ok)
                {
                    await DisplayAlert("Reset Sent", $"Factory reset command sent to {targetIp}. The device will reboot shortly.", "OK");
                }
                else
                {
                    await DisplayAlert("Reset Failed", $"Could not reset the device at {targetIp}. Ensure you are connected to the correct Wi-Fi (device AP for 192.168.4.1) and try again.", "OK");
                }
            }
            catch (OperationCanceledException)
            {
                await DisplayAlert("Timed Out", "The quick scan timed out. Try again, or use AP / Manual IP.", "OK");
            }
            catch (Exception ex)
            {
                await DisplayAlert("Error", $"Unexpected error during reset: {ex.Message}", "OK");
            }
        }

        // =========================
        // Quick local /24 ESP scan
        // =========================
        private async Task<List<string>> QuickFindEspIpsAsync(CancellationToken ct)
        {
            var local = GetLocalIPv4();
            if (local == null) return new List<string>();

            var prefix = local.GetAddressBytes();
            var hits = new List<string>();
            var hitsLock = new object();

            using var http = new HttpClient { Timeout = TimeSpan.FromMilliseconds(900) };
            using var sem = new SemaphoreSlim(64);

            var tasks = new List<Task>();
            for (int host = 1; host <= 254; host++)
            {
                var ip = new IPAddress(new byte[] { prefix[0], prefix[1], prefix[2], (byte)host });
                if (ip.Equals(local)) continue;

                await sem.WaitAsync(ct);
                tasks.Add(Task.Run(async () =>
                {
                    try
                    {
                        var ipStr = ip.ToString();

                        // We only need a 200 from /hello OR /status to accept the host.
                        if (await IsEspAtAsync(http, ipStr, ct))
                        {
                            lock (hitsLock) hits.Add(ipStr);
                        }
                    }
                    catch { /* ignore per host */ }
                    finally { sem.Release(); }
                }, ct));
            }

            await Task.WhenAll(tasks);
            // Sort for stable UI
            hits.Sort((a, b) =>
            {
                // numerical sort on last octet
                var aLast = int.TryParse(a.Split('.').Last(), out var ai) ? ai : 0;
                var bLast = int.TryParse(b.Split('.').Last(), out var bi) ? bi : 0;
                return aLast.CompareTo(bLast);
            });
            return hits;
        }

        private static async Task<bool> IsEspAtAsync(HttpClient http, string ip, CancellationToken ct)
        {
            // Try /hello first, then /status; any 200 is considered a hit.
            try
            {
                using var r1 = await http.GetAsync($"http://{ip}/hello", ct);
                if ((int)r1.StatusCode >= 200 && (int)r1.StatusCode < 300) return true;
            }
            catch { /* ignore */ }

            try
            {
                using var r2 = await http.GetAsync($"http://{ip}/status", ct);
                if ((int)r2.StatusCode >= 200 && (int)r2.StatusCode < 300) return true;
            }
            catch { /* ignore */ }

            return false;
        }

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
    }
}
