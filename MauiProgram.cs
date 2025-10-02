using Microsoft.Extensions.Logging;
using PawfeedsProvisioner.Pages;
using PawfeedsProvisioner.Services;
using PawfeedsProvisioner.Platforms.Android;
using Plugin.Firebase.Core;
using Plugin.Firebase.CloudMessaging;
using System.Diagnostics;

namespace PawfeedsProvisioner;

public static class MauiProgram
{
#if ANDROID
    public static MauiApp CreateMauiApp(Android.Content.Context context)
#else
    public static MauiApp CreateMauiApp()
#endif
    {
        var builder = MauiApp.CreateBuilder(useDefaults: true);

#if ANDROID
        builder.UseFirebase(context);
#elif IOS
        builder.UseFirebase(); // No context needed for iOS
#endif

        builder
            .UseMauiApp<App>()
            .UseFirebaseCloudMessaging(new FirebaseCloudMessagingOptions
            {
                // This is called when a new token is generated, or an old one is refreshed.
                OnTokenRefresh = fcmToken =>
                {
                    Debug.WriteLine($"[FCM] Token Refreshed: {fcmToken}");
                    // Note: Service provider isn't available here.
                    // We will fetch and update the token after login.
                },

                // This is called when a notification is received while the app is in the foreground.
                OnNotificationReceived = notification =>
                {
                    var title = notification.Title;
                    var body = notification.Body;
                    Debug.WriteLine($"[FCM] Foreground Notification Received: '{title}' - '{body}'");

                    // You might want to display a local notification here.
                },

                // This is called when a user taps on a notification.
                OnNotificationOpened = notification =>
                {
                    var title = notification.Title;
                    var body = notification.Body;
                    Debug.WriteLine($"[FCM] Notification Tapped: '{title}' - '{body}'");

                    // You can navigate to a specific page based on the notification data.
                }
            })
            .ConfigureFonts(fonts =>
            {
                fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
                fonts.AddFont("OpenSans-Semibold.ttf", "OpenSansSemibold");
            });

        #if DEBUG
            builder.Logging.AddDebug();
        #endif

        string apiKey = GetFirebaseApiKey();
        builder.Services.AddSingleton(new AuthService(apiKey));

        // Platform-specific services
#if ANDROID
        builder.Services.AddSingleton<INetworkInfo>(new NetworkInfoAndroid(context));
#endif
        // Add other platforms like: #elif IOS ...
        builder.Services.AddSingleton<ISystemSettingsOpener, SystemSettingsOpener>();

        // App services
        builder.Services.AddSingleton<ProfileService>();
        builder.Services.AddSingleton<LanDiscoveryService>();
        builder.Services.AddSingleton<ProvisioningClient>();
        builder.Services.AddSingleton(provider => new FirestoreService(provider.GetRequiredService<AuthService>()));
        builder.Services.AddSingleton<CloudFunctionService>();
        builder.Services.AddSingleton<SchedulingService>();

        // Pages
        builder.Services.AddTransient(provider => new LoginPage(provider.GetRequiredService<AuthService>(), provider.GetRequiredService<FirestoreService>()));
        builder.Services.AddTransient<WelcomePage>();
        builder.Services.AddTransient<ScanNetworksPage>();
        builder.Services.AddTransient<EnterCredentialsPage>();
        builder.Services.AddTransient<ConnectToDevicePage>();
        builder.Services.AddTransient<ProvisioningPage>();
        builder.Services.AddTransient<FindDevicePage>();
        builder.Services.AddTransient<DashboardPage>();
        builder.Services.AddTransient<ConfirmationPage>();

        var app = builder.Build();

        var scheduler = app.Services.GetRequiredService<SchedulingService>();
        scheduler.Start();

        return app;
    }

    private static string GetFirebaseApiKey()
        => "AIzaSyA0LtrNFTUHkgRmKyuT_Yo7UKRzEa4wX24";
}