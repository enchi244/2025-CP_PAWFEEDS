using PawfeedsProvisioner.Services;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using PawfeedsProvisioner.Models;
using System.Collections.Generic;
using System;
using System.Diagnostics; // Added for logging

namespace PawfeedsProvisioner.Pages;

public partial class FindDevicePage : ContentPage
{
    private readonly LanDiscoveryService _scan;
    private readonly FirestoreService _firestoreService;
    private readonly ProfileService _profileService;
    private bool _isPostProvisioning = false;
    private CancellationTokenSource? _scanCts;

    public FindDevicePage(LanDiscoveryService scan, FirestoreService firestoreService, ProfileService profileService)
    {
        InitializeComponent();
        _scan = scan;
        _firestoreService = firestoreService;
        _profileService = profileService;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        
        var navStack = Shell.Current.Navigation.NavigationStack;
        _isPostProvisioning = navStack.Count > 1 && navStack[navStack.Count - 2].GetType() == typeof(ProvisioningPage);

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
        // Permission logic remains the same...
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

            // Use a left outer join to show all LAN devices, enriched with Firestore data if a match is found.
            var onlineDevices = from lanDevice in allLanDevices
                                join firestoreDevice in myFirestoreDevices
                                on lanDevice.Hostname.Replace("pawfeeds-cam-", "").Replace("-2", "") equals firestoreDevice.Name into gj
                                from subFirestoreDevice in gj.DefaultIfEmpty()
                                select new OnlineDeviceViewModel
                                {
                                    // Use the matched Firestore device ID, or an empty string if no match.
                                    DeviceId = subFirestoreDevice?.Id ?? string.Empty,
                                    DisplayName = lanDevice.DisplayName,
                                    Hostname = lanDevice.Hostname,
                                    Ip = lanDevice.Ip,
                                    FeederIp = lanDevice.FeederIp,
                                    FeederId = lanDevice.FeederId
                                };
            
            var onlineDeviceList = onlineDevices.ToList();
            
            if (onlineDeviceList.Any())
            {
                var savedFeeders = _profileService.GetFeeders();

                foreach (var device in onlineDeviceList)
                {
                    if (device.FeederId <= 0)
                    {
                        continue;
                    }

                    var feeder = savedFeeders.FirstOrDefault(f => f.Id == device.FeederId);
                    if (feeder == null)
                    {
                        feeder = new FeederViewModel
                        {
                            Id = device.FeederId,
                            Name = string.IsNullOrWhiteSpace(device.DisplayName)
                                ? $"Feeder {device.FeederId}"
                                : device.DisplayName
                        };
                        savedFeeders.Add(feeder);
                    }

                    feeder.CameraIp = device.Ip;
                    feeder.FeederIp = device.FeederIp;
                    feeder.DeviceId = device.DeviceId;
                }

                _profileService.SaveFeeders(savedFeeders);
            }
            List.ItemsSource = onlineDeviceList;

            if (!onlineDeviceList.Any())
            {
                // This message is now more accurate: it means no devices were found on the LAN at all.
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

        // Defensive checks to ensure critical data for navigation is present.
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
