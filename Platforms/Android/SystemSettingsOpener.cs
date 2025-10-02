using Android.Content;
using Android.Provider;

namespace PawfeedsProvisioner.Services;

public class SystemSettingsOpener : ISystemSettingsOpener
{
    public Task OpenWifiSettingsAsync()
    {
        var intent = new Intent(Settings.ActionWifiSettings);
        intent.SetFlags(ActivityFlags.NewTask);
        Android.App.Application.Context.StartActivity(intent);
        return Task.CompletedTask;
    }
}
