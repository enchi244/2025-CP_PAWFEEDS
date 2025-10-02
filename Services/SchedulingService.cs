using PawfeedsProvisioner.Models;
using System.Diagnostics;
using Plugin.LocalNotification;

namespace PawfeedsProvisioner.Services;

public class SchedulingService
{
    private readonly IServiceProvider _serviceProvider;
    private IDispatcherTimer? _timer;
    private TimeSpan _lastCheckedTime;

    public SchedulingService(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public void Start()
    {
        if (_timer?.IsRunning == true) return;
        if (Application.Current == null) return;

        _timer = Application.Current.Dispatcher.CreateTimer();
        _timer.Interval = TimeSpan.FromSeconds(30);
        _timer.Tick += OnTimerTick;
        _timer.Start();

        _lastCheckedTime = DateTime.Now.TimeOfDay;
        Debug.WriteLine("[SchedulingService] Service started.");
    }

    private async void OnTimerTick(object? sender, EventArgs e)
    {
        var now = DateTime.Now;
        var currentTime = now.TimeOfDay;
        var currentDay = now.DayOfWeek;

        using var scope = _serviceProvider.CreateScope();
        var profileService = scope.ServiceProvider.GetRequiredService<ProfileService>();
        var provisioningClient = scope.ServiceProvider.GetRequiredService<ProvisioningClient>();

        // --- START FIX: Use LoadFeeders and iterate through the new data structure ---
        var allFeeders = profileService.LoadFeeders();
        if (allFeeders == null || !allFeeders.Any()) return;

        var timeToCheckFrom = _lastCheckedTime;
        _lastCheckedTime = currentTime;

        foreach (var feeder in allFeeders)
        {
            if (string.IsNullOrEmpty(feeder.FeederIp) || feeder.FeederIp == "N/A") continue;

            foreach (var profile in feeder.Profiles)
            {
                if (profile?.Schedules == null || !profile.Schedules.Any()) continue;

                foreach (var schedule in profile.Schedules)
                {
                    if (!schedule.IsEnabled || !schedule.Days.Contains(currentDay)) continue;

                    bool isTimeOccurringNow = IsTimeInInterval(schedule.Time, timeToCheckFrom, currentTime);

                    if (isTimeOccurringNow)
                    {
                        Debug.WriteLine($"[SchedulingService] Triggering schedule '{schedule.Name}' for profile '{profile.Name}' on '{feeder.Name}'");

                        int portion = profile.EditedCalculation > 0 ? profile.EditedCalculation : profile.DisplayCalculation;

                        if (portion > 0)
                        {
                            bool success = await provisioningClient.FeedNowAsync(feeder.FeederIp, portion, feeder.Id);

                            if (success)
                            {
                                var request = new NotificationRequest
                                {
                                    NotificationId = new Random().Next(1000, 9999),
                                    Title = $"Pawfeed Dispensed from {feeder.Name}!",
                                    Subtitle = $"For {profile.Name} - {schedule.Name}",
                                    Description = $"Just dispensed {portion}g of food.",
                                    Schedule = new NotificationRequestSchedule { NotifyTime = DateTime.Now.AddSeconds(1) }
                                };
                                await LocalNotificationCenter.Current.Show(request);
                            }
                        }
                    }
                }
            }
        }
        // --- END FIX ---
    }

    private bool IsTimeInInterval(TimeSpan timeToTest, TimeSpan start, TimeSpan end)
    {
        if (start <= end)
        {
            return timeToTest > start && timeToTest <= end;
        }
        else
        {
            return timeToTest > start || timeToTest <= end;
        }
    }
}