using Microsoft.Extensions.Logging;
using PawfeedsProvisioner.Pages;
using PawfeedsProvisioner.Services; // FIX: This line makes all your services visible
using PawfeedsProvisioner.Platforms.Android;

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
        builder
            .UseMauiApp<App>()
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
        builder.Services.AddTransient<LoginPage>();
        builder.Services.AddTransient<WelcomePage>();
        builder.Services.AddTransient<ScanNetworksPage>();
        builder.Services.AddTransient<EnterCredentialsPage>();
        builder.Services.AddTransient<ConnectToDevicePage>();
        builder.Services.AddTransient<ProvisioningPage>();
        builder.Services.AddTransient<FindDevicePage>();
        builder.Services.AddTransient<DashboardPage>();
        builder.Services.AddTransient<ConfirmationPage>();

        return builder.Build();
    }

    private static string GetFirebaseApiKey()
        => "AIzaSyA0LtrNFTUHkgRmKyuT_Yo7UKRzEa4wX24";
}