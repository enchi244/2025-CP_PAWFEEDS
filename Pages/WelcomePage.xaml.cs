using PawfeedsProvisioner.Services;
using Microsoft.Extensions.DependencyInjection; // Required for GetService
using System;
using System.Linq; // Required for LINQ methods like Count()
using System.Threading.Tasks; // Required for Task
using Microsoft.Maui.Controls; // Required for ContentPage and UI elements

namespace PawfeedsProvisioner.Pages;

public partial class WelcomePage : ContentPage
{
    private readonly AuthService _authService;

    public WelcomePage(AuthService authService)
    {
        InitializeComponent();
        _authService = authService;
    }

    private async void OnStartClicked(object sender, EventArgs e)
        => await Shell.Current.GoToAsync("//ConnectToDevicePage");

    private async void OnFindClicked(object sender, EventArgs e)
        => await Shell.Current.GoToAsync("//find");
        
    private async void OnSignOutClicked(object sender, EventArgs e)
    {
        // CORRECTED: The SignOut method is synchronous.
        _authService.SignOut();
        await Shell.Current.GoToAsync("//LoginPage");
    }

    private async void OnResetClicked(object sender, EventArgs e)
    {
        var lanDiscovery = Shell.Current.Handler?.MauiContext?.Services.GetService<LanDiscoveryService>();
        var provisioningClient = Shell.Current.Handler?.MauiContext?.Services.GetService<ProvisioningClient>();

        if (lanDiscovery is null || provisioningClient is null)
        {
            await DisplayAlert("Error", "Could not resolve necessary services. Please restart the app.", "OK");
            return;
        }

        SetBusyState(true);
        string? targetIp = null;

        try
        {
            var deviceIps = await lanDiscovery.ScanForAnyDeviceAsync();

            if (!deviceIps.Any())
            {
                bool manualEntry = await DisplayAlert(
                    "Device Not Found",
                    "The automatic scan could not find any devices. This can be caused by router settings like 'AP Isolation'.\n\nWould you like to enter the device's IP address manually?",
                    "Yes, Enter IP",
                    "Cancel");

                if (manualEntry)
                {
                    targetIp = await DisplayPromptAsync("Manual Reset", "Enter the IP address of the device you want to reset:", "Reset", "Cancel", keyboard: Keyboard.Numeric, initialValue: "192.168.1.");
                }
            }
            else if (deviceIps.Count == 1)
            {
                targetIp = deviceIps[0];
            }
            else
            {
                var ipAddresses = deviceIps.ToArray();
                targetIp = await DisplayActionSheet("Multiple Devices Found", "Cancel", null, ipAddresses);
            }

            if (!string.IsNullOrWhiteSpace(targetIp) && targetIp != "Cancel")
            {
                bool confirm = await DisplayAlert(
                    "Confirm Reset",
                    $"Are you sure you want to factory reset the device at {targetIp}? This will erase its saved Wi-Fi credentials.",
                    "Yes, Reset",
                    "Cancel");

                if (confirm)
                {
                    bool success = await provisioningClient.FactoryResetAsync(targetIp);
                    if (success)
                    {
                        await DisplayAlert("Command Sent", $"The device at {targetIp} has been told to reset. It will now reboot into hotspot mode (PAWFEEDS-XXXX).", "OK");
                    }
                    else
                    {
                        await DisplayAlert("Error", $"The reset command failed. The device at {targetIp} may be offline or the IP address might be incorrect.", "OK");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            await DisplayAlert("Scan Error", $"An error occurred while scanning the network: {ex.Message}", "OK");
        }
        finally
        {
            SetBusyState(false);
        }
    }

    private void SetBusyState(bool isBusy)
    {
        ResetSpinner.IsVisible = isBusy;
        ResetSpinner.IsRunning = isBusy;
        StartBtn.IsEnabled = !isBusy;
        FindBtn.IsEnabled = !isBusy;
        ResetBtn.IsEnabled = !isBusy;
    }
}