<<<<<<< HEAD
﻿using Microsoft.Extensions.Logging;
using PawfeedsProvisioner.Pages;
using PawfeedsProvisioner.Services;
using PawfeedsProvisioner.Platforms.Android; // for NetworkInfoAndroid on Android

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

        // Auth (API key from your project)
        string apiKey = GetFirebaseApiKey();
        builder.Services.AddSingleton(new AuthService(apiKey));

        // Platform-specific services
#if ANDROID
        builder.Services.AddSingleton<INetworkInfo>(new NetworkInfoAndroid(context));
        builder.Services.AddSingleton<ISystemSettingsOpener, SystemSettingsOpener>();
#else
        // Fallbacks for other platforms
        builder.Services.AddSingleton<ISystemSettingsOpener, StubSettingsOpener>();
#endif

        // Core app services
        builder.Services.AddSingleton<ProfileService>();
        builder.Services.AddSingleton<ProvisioningClient>();
        builder.Services.AddSingleton(provider => new FirestoreService(provider.GetRequiredService<AuthService>()));
        builder.Services.AddSingleton<CloudFunctionService>();
        builder.Services.AddSingleton<SchedulingService>();

        // LanDiscoveryService needs IServiceProvider; DI will pass the container automatically
        builder.Services.AddSingleton<LanDiscoveryService>();

        // Pages (Transient is fine)
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
=======
﻿using Microsoft.Extensions.Logging;
using PawfeedsProvisioner.Pages;
using PawfeedsProvisioner.Services;
using PawfeedsProvisioner.Platforms.Android; // for NetworkInfoAndroid on Android

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

        // Auth (API key from your project)
        string apiKey = GetFirebaseApiKey();
        builder.Services.AddSingleton(new AuthService(apiKey));

        // Platform-specific services
#if ANDROID
        builder.Services.AddSingleton<INetworkInfo>(new NetworkInfoAndroid(context));
        builder.Services.AddSingleton<ISystemSettingsOpener, SystemSettingsOpener>();
#else
        // Fallbacks for other platforms
        builder.Services.AddSingleton<ISystemSettingsOpener, StubSettingsOpener>();
#endif

        // Core app services
        builder.Services.AddSingleton<ProfileService>();
        builder.Services.AddSingleton<ProvisioningClient>();
        builder.Services.AddSingleton(provider => new FirestoreService(provider.GetRequiredService<AuthService>()));
        builder.Services.AddSingleton<CloudFunctionService>();
        builder.Services.AddSingleton<SchedulingService>();

        // LanDiscoveryService needs IServiceProvider; DI will pass the container automatically
        builder.Services.AddSingleton<LanDiscoveryService>();

        // Pages (Transient is fine)
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
>>>>>>> c44f57a (Initial commit without bin and obj)
