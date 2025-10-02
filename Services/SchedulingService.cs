using System.Diagnostics;
using System.Text;
using System.Text.Json;
using PawfeedsProvisioner.Models;

namespace PawfeedsProvisioner.Services
{
    public class SchedulingService
    {
        private readonly ProfileService _profileService;
        private readonly CloudFunctionService _cloudFunctionService;
        private readonly HttpClient _httpClient;
        private Timer? _timer;

        public SchedulingService(ProfileService profileService, CloudFunctionService cloudFunctionService)
        {
            _profileService = profileService;
            _cloudFunctionService = cloudFunctionService;
            _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        }

        public void Start()
        {
            _timer = new Timer(async _ => await CheckSchedulesAsync(), null, TimeSpan.Zero, TimeSpan.FromSeconds(10));
            Debug.WriteLine("[SchedulingService] Started");
        }

        public void Stop()
        {
            _timer?.Change(Timeout.Infinite, 0);
            Debug.WriteLine("[SchedulingService] Stopped");
        }

        private async Task CheckSchedulesAsync()
        {
            try
            {
                var now = DateTime.Now;
                // This line is updated to fix the compiler error
                var feeders = _profileService.GetFeeders();
                var tasksToRun = new List<Task>();

                if (feeders == null) return;

                foreach (var feeder in feeders)
                {
                    if (feeder.Profiles == null) continue;

                    foreach (var profile in feeder.Profiles)
                    {
                        if (profile.Schedules == null) continue;

                        foreach (var schedule in profile.Schedules)
                        {
                            bool isDue = schedule.IsEnabled &&
                                         schedule.Days.Contains(now.DayOfWeek) &&
                                         now.TimeOfDay >= schedule.Time &&
                                         schedule.LastTriggered.Date < now.Date;

                            if (isDue)
                            {
                                schedule.LastTriggered = now;
                                Debug.WriteLine($"[SchedulingService] Schedule '{schedule.Name}' for feeder '{feeder.Name}' is due.");

                                int portion = profile.EditedCalculation;
                                if (portion <= 0)
                                {
                                    Debug.WriteLine($"[SchedulingService] Portion for '{schedule.Name}' is 0, skipping.");
                                    continue;
                                }
                                
                                tasksToRun.Add(TriggerFeedAsync(feeder, portion, schedule.Name));
                            }
                        }
                    }
                }

                if (tasksToRun.Any())
                {
                    Debug.WriteLine($"[SchedulingService] Executing {tasksToRun.Count} feed tasks concurrently.");
                    await Task.WhenAll(tasksToRun);
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[SchedulingService] Error checking schedules: {ex.Message}");
            }
        }
        
        private async Task TriggerFeedAsync(FeederViewModel feeder, int portion, string scheduleName)
        {
            Debug.WriteLine($"[SchedulingService] Triggering feed for {feeder.Name} ({portion}g) from schedule '{scheduleName}'.");

            if (!string.IsNullOrWhiteSpace(feeder.FeederIp) && feeder.FeederIp != "N/A")
            {
                await FeedLocallyAsync(feeder, portion);
            }
            else if (!string.IsNullOrWhiteSpace(feeder.DeviceId))
            {
                await FeedRemotelyAsync(feeder, portion);
            }
            else
            {
                Debug.WriteLine($"[SchedulingService] Feeder '{feeder.Name}' has no IP or DeviceId. Cannot trigger feed.");
            }
        }

        private async Task FeedLocallyAsync(FeederViewModel feeder, int portion)
        {
            try
            {
                var url = $"http://{feeder.FeederIp}/feed";
                var payload = new { grams = portion, feeder = feeder.Id };
                var json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync(url, content);

                if (response.IsSuccessStatusCode)
                {
                    Debug.WriteLine($"[SchedulingService] Successfully sent local feed command to '{feeder.Name}'.");
                }
                else
                {
                    var error = await response.Content.ReadAsStringAsync();
                    Debug.WriteLine($"[SchedulingService] Failed to send local command to '{feeder.Name}': {error}");
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[SchedulingService] Exception during local feed for '{feeder.Name}': {ex.Message}");
            }
        }

        private async Task FeedRemotelyAsync(FeederViewModel feeder, int portion)
        {
            try
            {
                var commandPayload = new { type = "FEED", portion };
                var result = await _cloudFunctionService.SendCommandAsync(feeder.DeviceId, commandPayload);

                if (result.Success)
                {
                    Debug.WriteLine($"[SchedulingService] Successfully sent remote feed command to '{feeder.Name}'.");
                }
                else
                {
                    Debug.WriteLine($"[SchedulingService] Failed to send remote command to '{feeder.Name}': {result.Message}");
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[SchedulingService] Exception during remote feed for '{feeder.Name}': {ex.Message}");
            }
        }
    }
}