using PawfeedsProvisioner.Models;
using PawfeedsProvisioner.Services;
using System;
using System.Collections.Generic;
using Microsoft.Maui.Controls;

namespace PawfeedsProvisioner.Pages;

[QueryProperty(nameof(SSID), "ssid")]
public partial class EnterCredentialsPage : ContentPage
{
    private readonly AuthService _authService;
    private readonly FirestoreService _firestore;

    public string SSID
    {
        get => SsidEntry?.Text ?? string.Empty;
        set { if (SsidEntry != null) SsidEntry.Text = value; }
    }

    public EnterCredentialsPage(AuthService authService, FirestoreService firestore)
    {
        InitializeComponent();
        _authService = authService;
        _firestore = firestore;
    }

    private static string Esc(string s)
        => s.Replace("\\", "\\\\").Replace("\"", "\\\"");

    private string? GetPasswordOrNull()
    {
        var pass1 = this.FindByName<Entry>("PassEntry");
        if (pass1 != null) return pass1.Text;

        var pass2 = this.FindByName<Entry>("PasswordEntry");
        if (pass2 != null) return pass2.Text;

        return null;
    }

    private void SetBusy(bool busy)
    {
        var spinner = this.FindByName<ActivityIndicator>("IsBusyIndicator");
        if (spinner != null) { spinner.IsVisible = busy; spinner.IsRunning = busy; }

        var btn = this.FindByName<Button>("ProvisionButton");
        if (btn != null) btn.IsEnabled = !busy;
    }

    private async void Provision(object sender, EventArgs e)
    {
        var ssid = SsidEntry?.Text;
        var pass = GetPasswordOrNull();
        var host = HostEntry?.Text;

        if (string.IsNullOrWhiteSpace(ssid) || string.IsNullOrWhiteSpace(host))
        {
            await DisplayAlert("Missing info", "Please fill all fields.", "OK");
            return;
        }

        // Resolve user (UID required for provisioning)
        var userId = _authService.GetCurrentUserUid();
        if (string.IsNullOrEmpty(userId))
        {
            await DisplayAlert("Not Signed In", "You must be signed in to provision a new device.", "OK");
            await Shell.Current.GoToAsync("//login");
            return;
        }

        SetBusy(true);

        try
        {
            // Check Firestore for Feeder 1 existence
            string feeder1Hostname = $"pawfeeds-cam-{host}";
            bool feeder1Exists = await _firestore.DeviceWithHostnameExistsAsync(feeder1Hostname);

            int feederId = feeder1Exists ? 2 : 1;
            string fullHostname = feederId == 2 ? $"{feeder1Hostname}-2" : feeder1Hostname;

            var req = new ProvisionRequest
            {
                ssid = ssid!,
                password = pass ?? string.Empty,
                hostname = fullHostname,
                uid = userId,
                feederId = feederId
            };

            var json = $"{{\"ssid\":\"{Esc(req.ssid)}\",\"password\":\"{Esc(req.password)}\",\"hostname\":\"{Esc(req.hostname)}\",\"uid\":\"{Esc(req.uid)}\",\"feederId\":{req.feederId}}}";
            var url = $"//provision?reqJson={Uri.EscapeDataString(json)}";

            await Shell.Current.GoToAsync(url, new Dictionary<string, object> { ["req"] = req });
        }
        finally
        {
            SetBusy(false);
        }
    }
}
