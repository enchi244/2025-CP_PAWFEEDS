namespace PawfeedsProvisioner.Services;

public class StubSettingsOpener : ISystemSettingsOpener
{
    public Task OpenWifiSettingsAsync() => Task.CompletedTask;
}
