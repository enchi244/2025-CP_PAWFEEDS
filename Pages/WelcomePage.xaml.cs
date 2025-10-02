using PawfeedsProvisioner.Services;
using System.Linq; // Required for LINQ methods like .Select()
using System.Threading.Tasks; // Required for Task.Delay()

namespace PawfeedsProvisioner.Pages
{
    public partial class WelcomePage : ContentPage
    {
        private readonly ProvisioningClient _provisioningClient;
        private readonly LanDiscoveryService _lanDiscovery;
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

        // --- REWRITTEN METHOD ---
        // Wired in XAML: Clicked="OnResetClicked"
        private async void OnResetClicked(object sender, EventArgs e)
        {
            // Use a CancellationToken for the delay
            var cts = new CancellationTokenSource();

            try
            {
                // Let the user know we are scanning
                var scanningPrompt = DisplayAlert("Scanning...", "Searching for devices on your network for 5 seconds.", "Cancel");

                // Clear previous results and start discovery
                _lanDiscovery.DiscoveredDevices.Clear();
                _lanDiscovery.StartDiscovery();

                // Wait for 5 seconds or until the user cancels
                await Task.WhenAny(scanningPrompt, Task.Delay(TimeSpan.FromSeconds(5), cts.Token));

                // If the scanning alert is still showing, it means the user didn't cancel.
                // We close it programmatically by cancelling its source.
                if (!scanningPrompt.IsCompleted)
                {
                    cts.Cancel(); 
                }
            }
            finally
            {
                _lanDiscovery.StopDiscovery();
            }

            // Check for results
            if (_lanDiscovery.DiscoveredDevices.Count == 0)
            {
                await DisplayAlert("No Devices Found", "Could not find any Pawfeeds devices on the local network.", "OK");
                return;
            }

            // Prepare device names for the action sheet
            var deviceNames = _lanDiscovery.DiscoveredDevices.Select(d => d.Name).ToArray();
            var selectedDeviceName = await DisplayActionSheet("Select a device to reset", "Cancel", null, deviceNames);

            if (string.IsNullOrEmpty(selectedDeviceName) || selectedDeviceName == "Cancel")
            {
                return;
            }

            // Find the selected device object to get its IP
            var deviceToReset = _lanDiscovery.DiscoveredDevices.FirstOrDefault(d => d.Name == selectedDeviceName);
            if (deviceToReset == null)
            {
                await DisplayAlert("Error", "Could not find the selected device.", "OK");
                return;
            }

            // Perform the factory reset
            bool success = await _provisioningClient.FactoryResetAsync(deviceToReset.IpAddress);
            if (success)
            {
                await DisplayAlert("Reset Sent", $"Factory reset command sent to {deviceToReset.Name} ({deviceToReset.IpAddress}). The device will reboot shortly.", "OK");
            }
            else
            {
                await DisplayAlert("Reset Failed", $"Could not reset the device at {deviceToReset.IpAddress}. Please try again.", "OK");
            }
        }
    }
}