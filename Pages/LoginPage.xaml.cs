using PawfeedsProvisioner.Services;

namespace PawfeedsProvisioner.Pages;

public partial class LoginPage : ContentPage
{
    private readonly AuthService _authService;

    public LoginPage(AuthService authService)
    {
        InitializeComponent();
        _authService = authService;
    }

    private string GetPasswordOrEmpty()
    {
        // Try common names without creating compile-time field references
        var p1 = this.FindByName<Entry>("PasswordEntry");
        if (p1 != null) return p1.Text ?? string.Empty;

        var p2 = this.FindByName<Entry>("Password");
        if (p2 != null) return p2.Text ?? string.Empty;

        return string.Empty;
    }

    private async void OnSignInClicked(object sender, EventArgs e)
    {
        SetBusyState(true);

        var email = EmailEntry?.Text?.Trim();
        var password = GetPasswordOrEmpty();

        if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password))
        {
            await DisplayAlert("Error", "Please enter both email and password.", "OK");
            SetBusyState(false);
            return;
        }

        string result = await _authService.SignInAsync(email, password);
        if (result == "Success")
            await Shell.Current.GoToAsync("//welcome");
        else
            await DisplayAlert("Sign In Failed", result, "OK");

        SetBusyState(false);
    }

    private async void OnSignUpClicked(object sender, EventArgs e)
    {
        SetBusyState(true);

        var email = EmailEntry?.Text?.Trim();
        var password = GetPasswordOrEmpty();

        if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password))
        {
            await DisplayAlert("Error", "Please enter both email and password.", "OK");
            SetBusyState(false);
            return;
        }

        string result = await _authService.SignUpAsync(email, password);
        if (result == "Success")
            await DisplayAlert("Success", "Account created successfully! Please sign in.", "OK");
        else
            await DisplayAlert("Sign Up Failed", result, "OK");

        SetBusyState(false);
    }

    private void SetBusyState(bool isBusy)
    {
        ActivitySpinner.IsVisible = isBusy;
        ActivitySpinner.IsRunning = isBusy;
    }
}
