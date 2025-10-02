namespace PawfeedsProvisioner.Pages;

public partial class ConfirmationPage : ContentPage
{
    public ConfirmationPage() => InitializeComponent();

    private async void Restart(object sender, EventArgs e)
        => await Shell.Current.GoToAsync("//welcome");
}
