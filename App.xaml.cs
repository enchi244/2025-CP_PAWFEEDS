using PawfeedsProvisioner.Services;

namespace PawfeedsProvisioner;

public partial class App : Application
{
    private readonly SchedulingService _schedulingService;

    public App(SchedulingService schedulingService)
    {
        _schedulingService = schedulingService;

        // Set up universal crash handlers BEFORE initializing the UI
        AppDomain.CurrentDomain.UnhandledException += (sender, args) =>
        {
            LogCrash((Exception)args.ExceptionObject, "AppDomain.CurrentDomain.UnhandledException");
        };

        TaskScheduler.UnobservedTaskException += (sender, args) =>
        {
            LogCrash(args.Exception, "TaskScheduler.UnobservedTaskException");
            args.SetObserved();
        };

        
        InitializeComponent();
        MainPage = new AppShell();
    }

    protected override void OnSleep()
    {
        base.OnSleep();
        _schedulingService.Stop();
    }

    protected override void OnResume()
    {
        base.OnResume();
        _schedulingService.Start();
    }

    private void LogCrash(Exception ex, string source)
    {
        System.Diagnostics.Debug.WriteLine($"--- CRASH LOG: {source} ---");
        System.Diagnostics.Debug.WriteLine($"--- CRASH LOG: {source} ---");
        System.Diagnostics.Debug.WriteLine($"Timestamp: {DateTime.UtcNow:O}");
        if (ex != null)
        {
            System.Diagnostics.Debug.WriteLine($"Exception Type: {ex.GetType().FullName}");
            System.Diagnostics.Debug.WriteLine($"Message: {ex.Message}");
            System.Diagnostics.Debug.WriteLine("--- Stack Trace ---");
            System.Diagnostics.Debug.WriteLine(ex.StackTrace);

            if (ex.InnerException != null)
            {
                System.Diagnostics.Debug.WriteLine("--- Inner Exception ---");
                System.Diagnostics.Debug.WriteLine($"Exception Type: {ex.InnerException.GetType().FullName}");
                System.Diagnostics.Debug.WriteLine($"Message: {ex.InnerException.Message}");
                System.Diagnostics.Debug.WriteLine("--- Inner Stack Trace ---");
                System.Diagnostics.Debug.WriteLine(ex.InnerException.StackTrace);
            }
        }
        else
        {
            System.Diagnostics.Debug.WriteLine("Exception object was null.");
        }
        System.Diagnostics.Debug.WriteLine("--- END CRASH LOG ---");
    }
}