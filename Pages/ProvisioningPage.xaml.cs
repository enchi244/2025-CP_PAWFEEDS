using System.Collections.Generic;
using PawfeedsProvisioner.Models;
using PawfeedsProvisioner.Services;

namespace PawfeedsProvisioner.Pages;

// We drive provisioning from ApplyQueryAttributes to avoid timing issues
// where OnAppearing runs before the query is applied.
public partial class ProvisioningPage : ContentPage, IQueryAttributable
{
    private readonly ProvisioningClient _client;
    private readonly ISystemSettingsOpener _settings;

    public ProvisionRequest? Request { get; private set; }

    public ProvisioningPage(ProvisioningClient client, ISystemSettingsOpener settings)
    {
        InitializeComponent();
        _client = client;
        _settings = settings;

        // Default UI state
        Spinner.IsVisible = true;
        Spinner.IsRunning = true;
        NextStepsCard.IsVisible = false;
        ContinueBtn.IsVisible = false;
        TitleLabel.Text = "Preparing…";
        Status.Text = "Waiting for credentials…";
    }

    // Receive parameters from Shell navigation.
    public void ApplyQueryAttributes(IDictionary<string, object> query)
    {
        // 1) Strongly-typed object (when Shell can pass it)
        if (query.TryGetValue("req", out var obj) && obj is ProvisionRequest pr && !string.IsNullOrWhiteSpace(pr.ssid))
        {
            Request = pr;
            MainThread.BeginInvokeOnMainThread(async () => await StartProvisioningAsync());
            return;
        }

        // 2) Fallback via querystring JSON (always supported)
        if (query.TryGetValue("reqJson", out var jsonObj) && jsonObj is string json && !string.IsNullOrWhiteSpace(json))
        {
            try
            {
                string ssid = Extract(json, "ssid");
                string pass = Extract(json, "password");
                string host = Extract(json, "hostname");
                if (!string.IsNullOrWhiteSpace(ssid))
                {
                    Request = new ProvisionRequest { ssid = ssid, password = pass, hostname = host };
                    MainThread.BeginInvokeOnMainThread(async () => await StartProvisioningAsync());
                    return;
                }
            }
            catch
            {
                // ignore and fall through to "Missing data"
            }
        }

        // If we got here, we truly have no data.
        Spinner.IsRunning = false;
        Spinner.IsVisible = false;
        TitleLabel.Text = "Missing data";
        Status.Text = "No Wi-Fi credentials were provided.";
        NextStepsCard.IsVisible = true;
        ContinueBtn.IsVisible = true;
    }

    private async Task StartProvisioningAsync()
    {
        if (Request is null)
        {
            TitleLabel.Text = "Missing data";
            Status.Text = "No Wi-Fi credentials were provided.";
            Spinner.IsRunning = false;
            Spinner.IsVisible = false;
            NextStepsCard.IsVisible = true;
            ContinueBtn.IsVisible = true;
            return;
        }

        // Update UI
        TitleLabel.Text = "Sending credentials to device…";
        Status.Text = "Please wait while we configure your device.";

        try
        {
            var result = await _client.ProvisionAsync(Request);

            Spinner.IsRunning = false;
            Spinner.IsVisible = false;

            if (result is { success: true })
            {
                TitleLabel.Text = "Device is switching networks";
                Status.Text =
                    "Credentials sent successfully. The device is rebooting and joining your home Wi-Fi.\n\n" +
                    "Reconnect your phone to your HOME Wi-Fi, then press Continue.";
            }
            else
            {
                TitleLabel.Text = "Provision attempt finished";
                Status.Text =
                    $"The device may have already rebooted.\n\n" +
                    $"Server message: {result?.message ?? "No details"}\n\n" +
                    "Reconnect your phone to your HOME Wi-Fi, then press Continue.";
            }
        }
        catch (Exception ex)
        {
            // Very likely the device rebooted mid-request and the AP went down — that's OK.
            Spinner.IsRunning = false;
            Spinner.IsVisible = false;
            TitleLabel.Text = "Couldn’t confirm over device hotspot";
            Status.Text =
                "The device likely rebooted to your HOME Wi-Fi, so the hotspot went offline.\n\n" +
                $"Details: {ex.Message}\n\n" +
                "Reconnect your phone to your HOME Wi-Fi, then press Continue.";
        }

        NextStepsCard.IsVisible = true;
        ContinueBtn.IsVisible = true;
    }

    private async void OpenWifi(object sender, EventArgs e)
        => await _settings.OpenWifiSettingsAsync();

    private async void Continue(object sender, EventArgs e)
        => await Shell.Current.GoToAsync("//find");

    // Minimal JSON extractor used for the reqJson fallback.
    private static string Extract(string json, string key)
    {
        var k = $"\"{key}\"";
        int i = json.IndexOf(k, StringComparison.OrdinalIgnoreCase);
        if (i < 0) return "";
        int c = json.IndexOf(':', i); if (c < 0) return "";
        int q1 = json.IndexOf('"', c + 1); if (q1 < 0) return "";
        int q2 = json.IndexOf('"', q1 + 1); if (q2 < 0) return "";
        return json.Substring(q1 + 1, q2 - q1 - 1);
    }
}
