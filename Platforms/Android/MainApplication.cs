using Android.App;
using Android.Runtime;
using Microsoft.Maui;
using Firebase;
using System;

namespace PawfeedsProvisioner;

[Application]
public class MainApplication : MauiApplication
{
    public MainApplication(nint handle, JniHandleOwnership ownership) : base(handle, ownership) { }

    public override void OnCreate()
    {
        base.OnCreate();

        // Initialize the default FirebaseApp without using CrossFirebase
        try
        {
            var app = FirebaseApp.InitializeApp(this);
            if (app == null)
            {
                // If, for some reason, google-services.json isn't picked up,
                // you can manually supply options here (fill with your values):
                // var options = new FirebaseOptions.Builder()
                //     .SetProjectId("YOUR_PROJECT_ID")
                //     .SetApplicationId("YOUR_APP_ID")
                //     .SetApiKey("YOUR_API_KEY")
                //     .Build();
                // FirebaseApp.InitializeApp(this, options);
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine("Firebase init failed: " + ex.Message);
        }

        // Crashlytics is disabled in AndroidManifest via meta-data,
        // and we are not calling any Crashlytics APIs here.
    }

    protected override MauiApp CreateMauiApp() => MauiProgram.CreateMauiApp(this);
}
