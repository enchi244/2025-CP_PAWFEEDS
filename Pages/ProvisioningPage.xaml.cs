using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Maui.Controls;
using Microsoft.Maui.Dispatching;
using PawfeedsProvisioner.Models;
using PawfeedsProvisioner.Services;
using System;

namespace PawfeedsProvisioner.Pages;

public partial class ProvisioningPage : ContentPage, IQueryAttributable
{
    private readonly ProvisioningClient _client;
    private readonly ISystemSettingsOpener _settings;
    private readonly FirestoreService _firestore;

    public ProvisionRequest? Request { get; private set; }
    private ProvisionResult? _provisionResult;

    public ProvisioningPage(ProvisioningClient client, ISystemSettingsOpener settings, FirestoreService firestore)
    {
        InitializeComponent();
        _client = client;
        _settings = settings;
        _firestore = firestore;

        Spinner.IsVisible = true;
        Spinner.IsRunning = true;
        NextStepsCard.IsVisible = false;
        ContinueBtn.IsVisible = false;
        TitleLabel.Text = "Preparing…";
        Status.Text = "Waiting for credentials…";
    }

    public void ApplyQueryAttributes(IDictionary<string, object> query)
    {
        // Prefer strongly-typed 'req' if present
        if (query.TryGetValue("req", out var obj) && obj is ProvisionRequest pr && !string.IsNullOrWhiteSpace(pr.ssid))
        {
            Request = pr;
            MainThread.BeginInvokeOnMainThread(async () => await StartProvisioningAsync());
            return;
        }

        // Fallback: parse 'reqJson' (kept for backward compatibility with older navigation)
        if (query.TryGetValue("reqJson", out var jsonObj) && jsonObj is string json && !string.IsNullOrWhiteSpace(json))
        {
            try
            {
                string ssid = Extract(json, "ssid");
                string pass = Extract(json, "password");
                string host = Extract(json, "hostname");
                string uid  = Extract(json, "uid");
                int feederId = ExtractInt(json, "feederId");

                if (!string.IsNullOrWhiteSpace(ssid))
                {
                    Request = new ProvisionRequest
                    {
                        ssid = ssid,
                        password = pass,
                        hostname = host,
                        uid = uid,
                        feederId = feederId > 0 ? feederId : 1
                    };
                    MainThread.BeginInvokeOnMainThread(async () => await StartProvisioningAsync());
                    return;
                }
            }
            catch
            {
                // fall through to show "Missing data"
            }
        }

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

        TitleLabel.Text = "Sending credentials to device…";
        Status.Text = "Please wait while we configure your device.";

        try
        {
            _provisionResult = await _client.ProvisionAsync(Request);

            Spinner.IsRunning = false;
            Spinner.IsVisible = false;

            if (_provisionResult is { success: true })
            {
                TitleLabel.Text = "Device is switching networks";
                Status.Text =
                    "Credentials sent successfully. The device is rebooting and joining your home Wi-Fi.\n\n" +
                    "Reconnect your phone to your HOME Wi-Fi, then press Continue.";

                // Try to upsert Firestore immediately if we have enough info
                await TryUpsertFirestoreAsync();
            }
            else
            {
                TitleLabel.Text = "Provision attempt finished";
                Status.Text =
                    $"The device may have already rebooted.\n\n" +
                    $"Server message: {_provisionResult?.message ?? "No details"}\n\n" +
                    "Reconnect your phone to your HOME Wi-Fi, then press Continue.";

                // Even if success flag is false, sometimes deviceId is still present — attempt upsert.
                await TryUpsertFirestoreAsync();
            }
        }
        catch (Exception ex)
        {
            Spinner.IsRunning = false;
            Spinner.IsVisible = false;
            TitleLabel.Text = "Communication Error";
            Status.Text =
                "The app could not get a confirmation from the device. This is often normal as the device reboots quickly.\n\n" +
                $"Details: {ex.Message}\n\n" +
                "Reconnect your phone to your HOME Wi-Fi, then press Continue.";

            // Still attempt Firestore upsert if we already have deviceId from a previous step (defensive).
            await TryUpsertFirestoreAsync();
        }

        NextStepsCard.IsVisible = true;
        ContinueBtn.IsVisible = true;
    }

    private async Task TryUpsertFirestoreAsync()
    {
        try
        {
            if (_provisionResult == null || string.IsNullOrWhiteSpace(_provisionResult.deviceId) || Request == null)
                return;

            // Determine feeder slot
            int feederId = Request.feederId > 0 ? Request.feederId : Math.Max(_provisionResult.feederId, 1);

            // Build a minimal FeederViewModel so FirestoreService can upsert both parent and subdoc.
            var feederVm = new FeederViewModel
            {
                Id = feederId,
                Name = $"Feeder {feederId}",
                DeviceId = _provisionResult.deviceId,
                CameraIp = _provisionResult.cameraIp ?? string.Empty,
                FeederIp = _provisionResult.feederIp ?? string.Empty,
                IsSelected = true
            };

            await _firestore.SaveDeviceAsync(feederVm);
            await _firestore.SaveFeederAsync(feederVm);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[ProvisioningPage] Firestore upsert failed: {ex.Message}");
            // Swallow to avoid blocking the user flow; Find/Dashboard will still work and can upsert later.
        }
    }

    private async void OpenWifi(object sender, EventArgs e)
        => await _settings.OpenWifiSettingsAsync();

    // Continue → go to ConfirmationPage with all the context we have
    private async void Continue(object sender, EventArgs e)
    {
        string deviceId = _provisionResult?.deviceId ?? string.Empty;
        string hostname = Request?.hostname ?? string.Empty;
        int feederId = (Request?.feederId > 0 ? Request!.feederId : (_provisionResult?.feederId ?? 0));
        string cameraIp = _provisionResult?.cameraIp ?? string.Empty;
        string feederIp = _provisionResult?.feederIp ?? string.Empty;

        var route = "//done";

        // Always include what we have; ConfirmationPage will show N/A for missing values
        var query = $"{route}" +
                    $"?FeederId={feederId}" +
                    $"&Hostname={Uri.EscapeDataString(hostname)}" +
                    $"&DeviceId={Uri.EscapeDataString(deviceId)}" +
                    $"&CameraIp={Uri.EscapeDataString(cameraIp)}" +
                    $"&FeederIp={Uri.EscapeDataString(feederIp)}";

        await Shell.Current.GoToAsync(query);
    }

    private static string Extract(string json, string key)
    {
        // Very simple JSON value extractor for string values
        var k = $"\"{key}\"";
        int i = json.IndexOf(k, StringComparison.OrdinalIgnoreCase);
        if (i < 0) return "";
        int c = json.IndexOf(':', i); if (c < 0) return "";
        int q1 = json.IndexOf('"', c + 1); if (q1 < 0) return "";
        int q2 = json.IndexOf('"', q1 + 1); if (q2 < 0) return "";
        return json.Substring(q1 + 1, q2 - q1 - 1);
    }

    private static int ExtractInt(string json, string key)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty(key, out var el))
            {
                if (el.ValueKind == JsonValueKind.Number && el.TryGetInt32(out var n)) return n;
                if (el.ValueKind == JsonValueKind.String && int.TryParse(el.GetString(), out var m)) return m;
            }
        }
        catch { /* ignore parse errors */ }
        return 0;
    }
}
