using PawfeedsProvisioner.Services;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using PawfeedsProvisioner.Models;
using System.Collections.Generic;
using System;
using System.Diagnostics;

namespace PawfeedsProvisioner.Pages;

[QueryProperty(nameof(PostProvisioningDeviceId), "DeviceId")]
[QueryProperty(nameof(PostProvisioningHostname), "Hostname")]
[QueryProperty(nameof(PostProvisioningFeederId), "FeederId")]
[QueryProperty(nameof(PostProvisioningCameraIp), "CameraIp")]
[QueryProperty(nameof(PostProvisioningFeederIp), "FeederIp")]
public partial class FindDevicePage : ContentPage
{
    private readonly LanDiscoveryService _scan;
    private readonly FirestoreService _firestoreService;
    private bool _isPostProvisioning = false;
    private CancellationTokenSource? _scanCts;

    public string PostProvisioningDeviceId { get; set; } = string.Empty;
    public string PostProvisioningHostname { get; set; } = string.Empty;
    public int PostProvisioningFeederId { get; set; } = 0;
    public string PostProvisioningCameraIp { get; set; } = string.Empty;
    public string PostProvisioningFeederIp { get; set; } = string.Empty;

    public FindDevicePage(LanDiscoveryService scan, FirestoreService firestoreService)
    {
        InitializeComponent();
        _scan = scan;
        _firestoreService = firestoreService;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();

        _isPostProvisioning =
            !string.IsNullOrWhiteSpace(PostProvisioningDeviceId) &&
            !string.IsNullOrWhiteSpace(PostProvisioningHostname);

        DoneButton.IsVisible = _isPostProvisioning;

        await CheckPermissionsAndScanAsync();
    }

    protected override void OnDisappearing()
    {
        base.OnDisappearing();
        _scanCts?.Cancel();
    }

    private async Task CheckPermissionsAndScanAsync()
    {
        await CancelAndRunScanAsync();
    }

    private async Task CancelAndRunScanAsync()
    {
        _scanCts?.Cancel();
        _scanCts = new CancellationTokenSource();
        await RunScanAsync(_scanCts.Token);
    }

    private async Task RunScanAsync(CancellationToken ct)
    {
        Spinner.IsRunning = true;
        List.ItemsSource = null;

        try
        {
            var myFirestoreDevices = await _firestoreService.GetMyDevicesAsync();
            if (ct.IsCancellationRequested) return;

            var allLanDevices = await _scan.ScanAsync(ct);
            if (ct.IsCancellationRequested) return;

            // Build quick lookup for known Firestore devices
            var firestoreDeviceMap = myFirestoreDevices.ToDictionary(d => d.Name, d => d.Id);

            var onlineDeviceList = allLanDevices.Select(lanDevice =>
            {
                var coreHostname = lanDevice.Hostname.Replace("pawfeeds-cam-", "").Replace("-2", "");
                firestoreDeviceMap.TryGetValue(coreHostname, out var deviceId);

                return new OnlineDeviceViewModel
                {
                    DeviceId = deviceId ?? string.Empty,
                    DisplayName = lanDevice.DisplayName,
                    Hostname = lanDevice.Hostname,
                    Ip = lanDevice.Ip,
                    FeederIp = lanDevice.FeederIp,
                    FeederId = lanDevice.FeederId
                };
            }).ToList();

            if (_isPostProvisioning)
            {
                var justProvisionedDevice = onlineDeviceList.FirstOrDefault(d =>
                    d.Hostname.Replace("pawfeeds-cam-", "").Replace("-2", "") == this.PostProvisioningHostname);

                if (justProvisionedDevice != null)
                {
                    justProvisionedDevice.DeviceId = this.PostProvisioningDeviceId;

                    // Inject feeder info if available from provisioning flow
                    if (PostProvisioningFeederId > 0)
                        justProvisionedDevice.FeederId = PostProvisioningFeederId;

                    if (!string.IsNullOrWhiteSpace(PostProvisioningCameraIp))
                        justProvisionedDevice.Ip = PostProvisioningCameraIp;

                    if (!string.IsNullOrWhiteSpace(PostProvisioningFeederIp))
                        justProvisionedDevice.FeederIp = PostProvisioningFeederIp;

                    Debug.WriteLine($"[FindDevicePage] Injected post-provision DeviceId '{this.PostProvisioningDeviceId}', FeederId '{justProvisionedDevice.FeederId}', CameraIp '{justProvisionedDevice.Ip}', FeederIp '{justProvisionedDevice.FeederIp}'.");
                }
                else
                {
                    Debug.WriteLine($"[FindDevicePage] Post-provisioning FAILED: could not find device with hostname '{this.PostProvisioningHostname}' in scan results.");
                }
            }

            List.ItemsSource = onlineDeviceList;

            if (!onlineDeviceList.Any())
            {
                await DisplayAlert("No Devices Found", "The scan did not find any Pawfeeds devices on your current Wi-Fi network.", "OK");
            }
        }
        catch (OperationCanceledException)
        {
            Debug.WriteLine("[FindDevicePage] Scan was cancelled.");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[ERROR] Scan Error: {ex.Message}");
            await DisplayAlert("Scan Error", $"An unexpected error occurred: {ex.Message}", "OK");
        }
        finally
        {
            if (!ct.IsCancellationRequested)
            {
                Spinner.IsRunning = false;
            }
        }
    }

    private async void OnRescan(object sender, EventArgs e)
    {
        await CheckPermissionsAndScanAsync();
    }

    private async void OnDone(object sender, EventArgs e) => await Shell.Current.GoToAsync("//done");

    private async void OnDeviceTapped(object sender, TappedEventArgs e)
    {
        if ((sender as Frame)?.BindingContext is not OnlineDeviceViewModel selectedDevice)
        {
            Debug.WriteLine("OnDeviceTapped failed because BindingContext was not an OnlineDeviceViewModel.");
            return;
        }

        if (string.IsNullOrWhiteSpace(selectedDevice.Ip) || selectedDevice.Ip == "N/A")
        {
            await DisplayAlert("Camera Offline", "The camera for this device appears to be offline.", "OK");
            return;
        }

        if (string.IsNullOrWhiteSpace(selectedDevice.FeederIp) || selectedDevice.FeederId <= 0)
        {
            await DisplayAlert("Incomplete Data", "This device is missing feeder IP or a valid feeder ID and cannot be opened.", "OK");
            return;
        }

        try
        {
            Debug.WriteLine(
                $"Navigating to DashboardPage with params: " +
                $"CameraIp={selectedDevice.Ip}, " +
                $"FeederIp={selectedDevice.FeederIp}, " +
                $"FeederId={selectedDevice.FeederId}, " +
                $"DeviceId={selectedDevice.DeviceId}"
            );

            var route = $"{nameof(DashboardPage)}" +
                        $"?CameraIp={Uri.EscapeDataString(selectedDevice.Ip)}" +
                        $"&FeederIp={Uri.EscapeDataString(selectedDevice.FeederIp ?? string.Empty)}" +
                        $"&FeederId={selectedDevice.FeederId}" +
                        $"&DeviceId={Uri.EscapeDataString(selectedDevice.DeviceId ?? string.Empty)}";

            await Shell.Current.GoToAsync(route);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[ERROR] Navigation to DashboardPage failed: {ex.Message}");
            await DisplayAlert("Navigation Error", "Could not navigate to the device dashboard.", "OK");
        }
    }
}
