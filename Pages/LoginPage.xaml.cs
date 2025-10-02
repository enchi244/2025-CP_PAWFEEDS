using PawfeedsProvisioner.Services;
using Plugin.Firebase.CloudMessaging;
using System.Diagnostics;

namespace PawfeedsProvisioner.Pages;

public partial class LoginPage : ContentPage
{
    private readonly AuthService _authService;
    private readonly FirestoreService _firestoreService;

    public LoginPage(AuthService authService, FirestoreService firestoreService)
    {
        InitializeComponent();
        _authService = authService;
        _firestoreService = firestoreService;
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
        {
            await UpdateFcmTokenAsync();
            await Shell.Current.GoToAsync("//welcome");
        }
        else
        {
            await DisplayAlert("Sign In Failed", result, "OK");
        }

        SetBusyState(false);
    }

    private async Task UpdateFcmTokenAsync()
    {
        try
        {
            // It's good practice to ask for permission on iOS. On Android, it's granted by default.
            await CrossFirebaseCloudMessaging.Current.CheckIfValidAsync();

            var token = await CrossFirebaseCloudMessaging.Current.GetTokenAsync();
            if (!string.IsNullOrEmpty(token))
            {
                await _firestoreService.UpdateUserFcmToken(token);
                Debug.WriteLine($"[LoginPage] FCM Token updated: {token}");
            }
            else
            {
                Debug.WriteLine("[LoginPage] Could not retrieve FCM token.");
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[LoginPage] Error updating FCM token: {ex.Message}");
            // Optionally, inform the user that push notifications might not work.
        }
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
