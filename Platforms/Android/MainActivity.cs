using Android.App;
using Android.Content.PM;
using Android.OS;
using Firebase;   // from Xamarin/MAUI Firebase bindings
using Android.Util;

namespace PawfeedsProvisioner;

[Activity(
    Theme = "@style/Maui.SplashTheme",
    MainLauncher = true,
    ConfigurationChanges = ConfigChanges.ScreenSize 
                           | ConfigChanges.Orientation 
                           | ConfigChanges.UiMode 
                           | ConfigChanges.ScreenLayout 
                           | ConfigChanges.SmallestScreenSize 
                           | ConfigChanges.Density)]
public class MainActivity : MauiAppCompatActivity
{
    protected override void OnCreate(Bundle? savedInstanceState)
    {
        base.OnCreate(savedInstanceState);

        try
        {
            // ✅ Initialize Firebase before using Auth/Firestore
            if (FirebaseApp.InitializeApp(this) == null)
            {
                Log.Info("Pawfeeds", "FirebaseApp already initialized.");
            }
            else
            {
                Log.Info("Pawfeeds", "FirebaseApp initialized successfully.");
            }
        }
        catch (System.Exception ex)
        {
            Log.Error("Pawfeeds", $"FirebaseApp init failed: {ex}");
        }
    }
}
