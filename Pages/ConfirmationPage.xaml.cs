using System;
using Microsoft.Maui.Controls;

namespace PawfeedsProvisioner.Pages
{
    // Accept details from the provisioning flow so we can show exactly what was set up.
    [QueryProperty(nameof(FeederId), "FeederId")]
    [QueryProperty(nameof(Hostname), "Hostname")]
    [QueryProperty(nameof(DeviceId), "DeviceId")]
    [QueryProperty(nameof(CameraIp), "CameraIp")]
    [QueryProperty(nameof(FeederIp), "FeederIp")]
    public partial class ConfirmationPage : ContentPage
    {
        // Routed-in properties
        public int    FeederId  { get; set; }
        public string Hostname  { get; set; } = string.Empty;
        public string DeviceId  { get; set; } = string.Empty;
        public string CameraIp  { get; set; } = string.Empty;
        public string FeederIp  { get; set; } = string.Empty;

        public ConfirmationPage()
        {
            InitializeComponent();
            BindingContext = this; // in case the XAML binds to any of these properties
        }

        protected override async void OnAppearing()
        {
            base.OnAppearing();

            try
            {
                var summary =
                    $"Provisioning successful!\n\n" +
                    $"• Feeder slot: {SafeFeederId(FeederId)}\n" +
                    $"• Hostname: {OrNA(Hostname)}\n" +
                    $"• Device ID: {OrNA(DeviceId)}\n" +
                    $"• Camera IP: {OrNA(CameraIp)}\n" +
                    $"• Feeder IP: {OrNA(FeederIp)}";

                var summaryLabel = this.FindByName<Label>("SummaryLabel");
                if (summaryLabel != null)
                {
                    summaryLabel.Text = summary;
                }
                else
                {
                    // Fallback if the label isn't present
                    await DisplayAlert("Pawfeeds", summary, "OK");
                }
            }
            catch
            {
                // Non-fatal: ignore UI fill failures
            }
        }

        private static string OrNA(string s) => string.IsNullOrWhiteSpace(s) ? "N/A" : s;
        private static string SafeFeederId(int id) => (id == 1 || id == 2) ? id.ToString() : "N/A";

        // Wired from XAML Button: Clicked="Restart"
        private async void Restart(object sender, EventArgs e)
            => await Shell.Current.GoToAsync("//welcome");
    }
}
