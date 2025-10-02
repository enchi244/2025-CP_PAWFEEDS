using PawfeedsProvisioner.Models;
using PawfeedsProvisioner.Services;

namespace PawfeedsProvisioner.Pages;

[QueryProperty(nameof(SSID), "ssid")]
public partial class EnterCredentialsPage : ContentPage
{
    private readonly AuthService _authService;

    public string SSID
    {
        get => SsidEntry?.Text ?? string.Empty;
        set { if (SsidEntry != null) SsidEntry.Text = value; }
    }

    public EnterCredentialsPage(AuthService authService)
    {
        InitializeComponent();
        _authService = authService;
    }

    private static string Esc(string s)
        => s.Replace("\\", "\\\\").Replace("\"", "\\\"");

    private string? GetPasswordOrNull()
    {
        // Try both typical names; if neither exists, return null
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
            string fullHostname = $"pawfeeds-cam-{host!}";
            var req = new ProvisionRequest
            {
                ssid = ssid!,
                password = pass ?? string.Empty,
                hostname = fullHostname,
                uid = userId
            };

            var json = $"{{\"ssid\":\"{Esc(req.ssid)}\",\"password\":\"{Esc(req.password)}\",\"hostname\":\"{Esc(req.hostname)}\",\"uid\":\"{Esc(req.uid)}\"}}";
            var url = $"//provision?reqJson={Uri.EscapeDataString(json)}";
            await Shell.Current.GoToAsync(url, new Dictionary<string, object> { ["req"] = req });
        }
        finally
        {
            SetBusy(false);
        }
    }
}
