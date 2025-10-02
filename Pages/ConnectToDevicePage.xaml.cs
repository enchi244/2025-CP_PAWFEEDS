using PawfeedsProvisioner.Services;

namespace PawfeedsProvisioner.Pages;

public partial class ConnectToDevicePage : ContentPage
{
    private readonly ISystemSettingsOpener _settings;

    public ConnectToDevicePage(ISystemSettingsOpener settings)
    {
        InitializeComponent();
        _settings = settings;
    }

    private async void OpenWifi(object sender, EventArgs e)
        => await _settings.OpenWifiSettingsAsync();

    private async void Next(object sender, EventArgs e)
        => await Shell.Current.GoToAsync("//scan");
}
