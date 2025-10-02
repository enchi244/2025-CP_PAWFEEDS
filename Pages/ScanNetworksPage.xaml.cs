using PawfeedsProvisioner.Models;
using PawfeedsProvisioner.Services;

namespace PawfeedsProvisioner.Pages;

public partial class ScanNetworksPage : ContentPage
{
    private readonly ProvisioningClient _client;

    public ScanNetworksPage(ProvisioningClient client)
    {
        InitializeComponent();
        _client = client;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await LoadAsync();
    }

    private async Task LoadAsync()
    {
        try
        {
            var list = await _client.GetNetworksAsync();
            Networks.ItemsSource = list;
        }
        catch (Exception ex)
        {
            await DisplayAlert("Scan failed", ex.Message, "OK");
        }
    }

    private async void Refresh(object sender, EventArgs e) => await LoadAsync();

    private async void Pick(object sender, SelectionChangedEventArgs e)
    {
        if (e.CurrentSelection?.FirstOrDefault() is WifiNetwork chosen)
        {
            await Shell.Current.GoToAsync("//enterCredentials",
                new Dictionary<string, object> { ["ssid"] = chosen.SSID });
        }
    }
}
