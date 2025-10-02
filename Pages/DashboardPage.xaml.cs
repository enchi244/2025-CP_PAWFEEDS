using PawfeedsProvisioner.Models;
using PawfeedsProvisioner.Services;
using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.ComponentModel;
using System.Diagnostics;
using Microsoft.Maui.Handlers;
using System.Linq;
using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace PawfeedsProvisioner.Pages;

[QueryProperty(nameof(CameraIp), "CameraIp")]
[QueryProperty(nameof(FeederIp), "FeederIp")]
[QueryProperty(nameof(FeederId), "FeederId")]
[QueryProperty(nameof(DeviceId), "DeviceId")]
public partial class DashboardPage : ContentPage
{
    #region Properties
    public string CameraIp { get; set; } = string.Empty;
    public string FeederIp { get; set; } = string.Empty;
    public int FeederId { get; set; }
    public string DeviceId { get; set; } = string.Empty;

    private readonly ProfileService _profileService;
    private readonly ProvisioningClient _provisioningClient;
    private readonly CloudFunctionService _cloudFunctionService;
    private readonly FirestoreService _firestoreService;

    public ObservableCollection<FeederViewModel> Feeders { get; set; }

    private FeederViewModel _currentFeeder = null!;
    public FeederViewModel CurrentFeeder
    {
        get => _currentFeeder;
        set
        {
            if (_currentFeeder != value)
            {
                _currentFeeder = value;

                foreach (var feeder in Feeders)
                {
                    feeder.IsSelected = (feeder == _currentFeeder);
                }

                OnPropertyChanged(nameof(CurrentFeeder));

                PetProfileViewModel? newProfileSelection = null;
                if (_currentFeeder != null)
                {
                    newProfileSelection = _currentFeeder.Profiles.FirstOrDefault();
                    if (newProfileSelection == null)
                    {
                        newProfileSelection = new PetProfileViewModel { Name = "Default Profile" };
                        _currentFeeder.Profiles.Add(newProfileSelection);
                        _ = SaveAndSyncCurrentFeederAsync();
                    }
                }

                CurrentProfile = newProfileSelection ?? new PetProfileViewModel();
                UpdateStreamUrl();

                _statusPollingTimer?.Change(Timeout.Infinite, 0);
                _statusPollingTimer?.Dispose();
                _statusPollingTimer = new Timer(PollFeederStatus, null, TimeSpan.Zero, TimeSpan.FromSeconds(5));
            }
        }
    }

    private PetProfileViewModel _currentProfile = null!;
    public PetProfileViewModel CurrentProfile
    {
        get => _currentProfile;
        set
        {
            if (_currentProfile != value)
            {
                if (_currentProfile != null)
                {
                    _currentProfile.PropertyChanged -= OnProfilePropertyChanged;
                    if (_currentProfile.Schedules != null)
                    {
                        _currentProfile.Schedules.CollectionChanged -= OnSchedulesCollectionChanged;
                        foreach (var schedule in _currentProfile.Schedules)
                            schedule.PropertyChanged -= OnSchedulePropertyChanged;
                    }
                }

                _currentProfile = value;

                if (_currentProfile != null)
                {
                    _currentProfile.PropertyChanged += OnProfilePropertyChanged;
                    if (_currentProfile.Schedules != null)
                    {
                        _currentProfile.Schedules.CollectionChanged += OnSchedulesCollectionChanged;
                        foreach (var schedule in _currentProfile.Schedules)
                            schedule.PropertyChanged += OnSchedulePropertyChanged;
                    }
                }

                OnPropertyChanged(nameof(CurrentProfile));
                OnPropertyChanged(nameof(Schedules));
                UpdateSchedulesVisibility();
            }
        }
    }

    public ObservableCollection<FeedingSchedule> Schedules => CurrentProfile?.Schedules ?? new ObservableCollection<FeedingSchedule>();
    public ObservableCollection<DayOfWeekViewModel> DaysOfWeek { get; set; }
    private FeedingSchedule? _currentlyEditingSchedule;
    private bool _isFeeding = false;

    private Timer? _statusPollingTimer;
    private readonly HttpClient _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };

    #endregion

    public DashboardPage(
        ProfileService profileService,
        ProvisioningClient provisioningClient,
        CloudFunctionService cloudFunctionService,
        FirestoreService firestoreService)
    {
        InitializeComponent();
        _profileService = profileService;
        _provisioningClient = provisioningClient;
        _cloudFunctionService = cloudFunctionService;
        _firestoreService = firestoreService;

        Feeders = new ObservableCollection<FeederViewModel>(_profileService.LoadFeeders());
        this.BindingContext = this;

        DaysOfWeek = new ObservableCollection<DayOfWeekViewModel>
        {
            new(DayOfWeek.Sunday, "S"), new(DayOfWeek.Monday, "M"), new(DayOfWeek.Tuesday, "T"),
            new(DayOfWeek.Wednesday, "W"), new(DayOfWeek.Thursday, "TH"),
            new(DayOfWeek.Friday, "F"), new(DayOfWeek.Saturday, "S")
        };
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();

        string cameraIp = Uri.UnescapeDataString(CameraIp ?? string.Empty);
        string feederIp = Uri.UnescapeDataString(FeederIp ?? string.Empty);
        string deviceId = Uri.UnescapeDataString(DeviceId ?? string.Empty);

        FeederViewModel? targetFeeder = Feeders.FirstOrDefault(f => f.Id == FeederId);

        if (targetFeeder != null)
        {
            targetFeeder.CameraIp = cameraIp;
            targetFeeder.FeederIp = feederIp;
            if (!string.IsNullOrWhiteSpace(deviceId))
            {
                targetFeeder.DeviceId = deviceId;
            }
            await SaveAndSyncCurrentFeederAsync();
            CurrentFeeder = targetFeeder;
        }
        else if (FeederId > 0)
        {
            targetFeeder = new FeederViewModel
            {
                Id = FeederId,
                Name = $"Feeder {FeederId}",
                CameraIp = cameraIp,
                FeederIp = feederIp,
                DeviceId = deviceId
            };
            Feeders.Add(targetFeeder);
            await SaveAndSyncCurrentFeederAsync();
            CurrentFeeder = targetFeeder;
        }
        else if (!Feeders.Any())
        {
            var defaultFeeder = new FeederViewModel { Id = 1, Name = "Feeder 1" };
            Feeders.Add(defaultFeeder);
            await SaveAndSyncCurrentFeederAsync();
            CurrentFeeder = defaultFeeder;
        }
        else
        {
            CurrentFeeder = Feeders.First();
        }
    }

    protected override void OnDisappearing()
    {
        base.OnDisappearing();
        StreamWebView.Source = null;
#if ANDROID
        if (StreamWebView.Handler is WebViewHandler wvh && wvh.PlatformView != null)
        {
            wvh.PlatformView.Destroy();
        }
#endif
        Debug.WriteLine("[DashboardPage] WebView stream stopped and handler cleaned up.");

        _statusPollingTimer?.Change(Timeout.Infinite, 0);
        _statusPollingTimer?.Dispose();
        _statusPollingTimer = null;
    }

    #region Event Handlers for Data Changes
    private async Task SaveAndSyncCurrentFeederAsync()
    {
        _profileService.SaveFeeders(Feeders.ToList());

        if (CurrentFeeder != null && !string.IsNullOrWhiteSpace(CurrentFeeder.DeviceId))
        {
            await _firestoreService.SaveDeviceAsync(CurrentFeeder);
            await _firestoreService.SaveFeederAsync(CurrentFeeder);
        }
    }

    private void OnProfilePropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        _ = SaveAndSyncCurrentFeederAsync();
    }

    private void OnSchedulePropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        CurrentProfile?.RecalculateFeedingAmount();
        _ = SaveAndSyncCurrentFeederAsync();
    }

    private void OnSchedulesCollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        if (e.NewItems != null)
        {
            foreach (INotifyPropertyChanged item in e.NewItems)
                item.PropertyChanged += OnSchedulePropertyChanged;
        }
        if (e.OldItems != null)
        {
            foreach (INotifyPropertyChanged item in e.OldItems)
                item.PropertyChanged -= OnSchedulePropertyChanged;
        }
        CurrentProfile?.RecalculateFeedingAmount();
        UpdateSchedulesVisibility();
        _ = SaveAndSyncCurrentFeederAsync();
    }
    #endregion

    private void OnFeederButtonClicked(object sender, EventArgs e)
    {
        if ((sender as Button)?.BindingContext is FeederViewModel selectedFeeder)
        {
            CurrentFeeder = selectedFeeder;
        }
    }

    #region UI and Device Status
    private void UpdateStreamUrl()
    {
        string? ipAddress = CurrentFeeder?.CameraIp;

        if (!string.IsNullOrEmpty(ipAddress) && ipAddress != "N/A")
        {
            string url = $"http://{ipAddress}/stream";
            StreamWebView.Source = new UrlWebViewSource { Url = url };
        }
        else
        {
            StreamWebView.Source = new UrlWebViewSource { Url = "about:blank" };
        }

        UpdateFeederStatusText();
    }

    private async void PollFeederStatus(object? state)
    {
        if (CurrentFeeder == null || string.IsNullOrWhiteSpace(CurrentFeeder.FeederIp) || CurrentFeeder.FeederIp == "N/A")
        {
            if (CurrentFeeder != null)
            {
                MainThread.BeginInvokeOnMainThread(() => { CurrentFeeder.IsOnline = false; });
            }
            return;
        }

        try
        {
            var url = $"http://{CurrentFeeder.FeederIp}/status";
            var response = await _httpClient.GetStringAsync(url);

            using var doc = JsonDocument.Parse(response);
            if (doc.RootElement.TryGetProperty("container_weight_grams", out var weightElement))
            {
                var weight = weightElement.GetDouble();
                MainThread.BeginInvokeOnMainThread(() =>
                {
                    CurrentFeeder.ContainerWeight = weight;
                    CurrentFeeder.IsOnline = true;
                });
                _ = SaveAndSyncCurrentFeederAsync();
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DashboardPage] Failed to poll status from {CurrentFeeder.FeederIp}: {ex.Message}");
            MainThread.BeginInvokeOnMainThread(() =>
            {
                if (CurrentFeeder != null) CurrentFeeder.IsOnline = false;
            });
        }
    }

    private void UpdateFeederStatusText()
    {
        string camIp = CurrentFeeder?.CameraIp ?? "N/A";
        string feederIp = CurrentFeeder?.FeederIp ?? "N/A";
        string deviceId = CurrentFeeder?.DeviceId ?? "N/A";
        IpAddressLabel.Text = $"Camera: {camIp} | Feeder: {feederIp} | Device ID: {deviceId}";
    }

    private void UpdateSchedulesVisibility()
    {
        bool hasSchedules = CurrentProfile?.Schedules?.Any() ?? false;
        SchedulesList.IsVisible = hasSchedules;
        NoSchedulesLabel.IsVisible = !hasSchedules;
    }
    #endregion

    #region Profile Management
    private async void OnAddProfileClicked(object sender, EventArgs e)
    {
        if (CurrentFeeder == null) return;

        string newProfileName = await DisplayPromptAsync("New Profile", "Enter the name for the new dog profile:");
        if (!string.IsNullOrWhiteSpace(newProfileName))
        {
            var newProfile = new PetProfileViewModel { Name = newProfileName };
            CurrentFeeder.Profiles.Add(newProfile);
            CurrentProfile = newProfile;
            ProfilePicker.SelectedItem = newProfile;
            await SaveAndSyncCurrentFeederAsync();
        }
    }

    private async void OnRenameProfileClicked(object sender, EventArgs e)
    {
        if (CurrentProfile == null) return;

        string newName = await DisplayPromptAsync("Rename Profile", "Enter the new name for this profile:", initialValue: CurrentProfile.Name);
        if (!string.IsNullOrWhiteSpace(newName))
        {
            CurrentProfile.Name = newName;
            await SaveAndSyncCurrentFeederAsync();

            var currentSelection = ProfilePicker.SelectedItem;
            ProfilePicker.ItemsSource = null;
            ProfilePicker.ItemsSource = CurrentFeeder.Profiles;
            ProfilePicker.SelectedItem = currentSelection;
        }
    }
    #endregion

    #region Actions (Feed Now)
    private async void OnFeedNowClicked(object sender, EventArgs e)
    {
        if (_isFeeding) return;

        if (CurrentFeeder == null || CurrentProfile == null)
        {
            await DisplayAlert("Error", "No feeder or profile selected.", "OK");
            return;
        }

        if (string.IsNullOrWhiteSpace(CurrentFeeder.DeviceId))
        {
            await DisplayAlert("Error", "No unique Device ID found for this feeder. Please re-provision the device.", "OK");
            return;
        }

        int portion = CurrentProfile.EditedCalculation;
        if (portion <= 0)
        {
            await DisplayAlert("No Portion", "Cannot feed 0 grams. Please add a schedule or edit the portion size.", "OK");
            return;
        }

        bool confirm = await DisplayAlert("Confirm Remote Feed", $"Dispense {portion}g from {CurrentFeeder.Name} via the cloud?", "Yes", "Cancel");
        if (!confirm) return;

        try
        {
            _isFeeding = true;
            FeedNowBtn.IsEnabled = false;
            FeedNowBtn.Text = "Sending...";

            var commandPayload = new { type = "FEED", feeder = CurrentFeeder.Id, grams = portion };

            var result = await _cloudFunctionService.SendCommandAsync(CurrentFeeder.DeviceId, commandPayload);

            if (result.Success)
            {
                await DisplayAlert("Success", "Remote feed command sent to the device.", "OK");
            }
            else
            {
                await DisplayAlert("Error", $"Failed to send remote command. The device may be offline or an error occurred: {result.Message}", "OK");
            }
        }
        catch (Exception ex)
        {
            await DisplayAlert("Exception", $"An error occurred: {ex.Message}", "OK");
        }
        finally
        {
            _isFeeding = false;
            FeedNowBtn.Text = "FEED NOW";
            if (CurrentFeeder != null)
            {
                FeedNowBtn.IsEnabled = CurrentFeeder.IsOnline;
            }
        }
    }
    #endregion

    #region Schedule Popup Logic
    private void ShowPopup(bool show)
    {
        PopupOverlay.IsVisible = show;
        AddSchedulePopup.IsVisible = show;
        if (!show) _currentlyEditingSchedule = null;
    }

    private void RenderDayOfWeekButtons()
    {
        DaysOfWeekLayout.Children.Clear();

        if (Application.Current?.Resources.TryGetValue("BoolToColorConverter", out var converterResource) is not true ||
            converterResource is not BoolToColorConverter converter)
        {
            return;
        }

        foreach (var dayVM in DaysOfWeek)
        {
            var button = new Button
            {
                BindingContext = dayVM,
                Style = (Style)Application.Current.Resources["DayButton"]
            };

            button.SetBinding(Button.TextProperty, nameof(DayOfWeekViewModel.Name));
            button.SetBinding(Button.BackgroundColorProperty, new Binding(nameof(DayOfWeekViewModel.IsSelected), converter: converter));

            button.Clicked += OnDayToggled;
            DaysOfWeekLayout.Children.Add(button);
        }
    }

    private void OnAddScheduleClicked(object sender, EventArgs e)
    {
        if (CurrentProfile == null) return;
        _currentlyEditingSchedule = null;
        PopupTitle.Text = "Add New Schedule";
        DeleteScheduleButton.IsVisible = false;
        ScheduleNameEntry.Text = "";
        ScheduleTimePicker.Time = TimeSpan.FromHours(8);
        foreach (var day in DaysOfWeek) day.IsSelected = true;

        RenderDayOfWeekButtons();
        ShowPopup(true);
    }

    private void OnEditScheduleClicked(object sender, EventArgs e)
    {
        if ((sender as Button)?.CommandParameter is not FeedingSchedule scheduleToEdit) return;
        _currentlyEditingSchedule = scheduleToEdit;
        PopupTitle.Text = "Edit Schedule";
        DeleteScheduleButton.IsVisible = true;
        ScheduleNameEntry.Text = scheduleToEdit.Name;
        ScheduleTimePicker.Time = scheduleToEdit.Time;
        foreach (var dayVM in DaysOfWeek)
        {
            dayVM.IsSelected = scheduleToEdit.Days.Contains(dayVM.Day);
        }

        RenderDayOfWeekButtons();
        ShowPopup(true);
    }

    private async void OnDeleteScheduleClicked(object sender, EventArgs e)
    {
        if (_currentlyEditingSchedule == null || CurrentProfile == null) return;
        bool confirm = await DisplayAlert("Delete Schedule", $"Delete '{_currentlyEditingSchedule.Name}'?", "Yes", "Cancel");
        if (confirm)
        {
            CurrentProfile.Schedules.Remove(_currentlyEditingSchedule);
            ShowPopup(false);
        }
    }

    private async void OnSaveScheduleClicked(object sender, EventArgs e)
    {
        if (CurrentProfile == null) return;

        if (string.IsNullOrWhiteSpace(ScheduleNameEntry.Text))
        {
            await DisplayAlert("Missing Name", "Please enter a name for the schedule.", "OK");
            return;
        }
        var selectedDays = DaysOfWeek.Where(d => d.IsSelected).Select(d => d.Day).ToList();
        if (!selectedDays.Any())
        {
            await DisplayAlert("No Days Selected", "Please select at least one day for the schedule.", "OK");
            return;
        }
        if (_currentlyEditingSchedule != null)
        {
            _currentlyEditingSchedule.Name = ScheduleNameEntry.Text;
            _currentlyEditingSchedule.Time = ScheduleTimePicker.Time;
            _currentlyEditingSchedule.Days = selectedDays;
        }
        else
        {
            var newSchedule = new FeedingSchedule
            {
                Name = ScheduleNameEntry.Text,
                Time = ScheduleTimePicker.Time,
                Days = selectedDays
            };
            CurrentProfile.Schedules.Add(newSchedule);
        }
        ShowPopup(false);
    }

    private void OnCancelScheduleClicked(object sender, EventArgs e) => ShowPopup(false);

    private void OnDayToggled(object? sender, EventArgs e)
    {
        if ((sender as Button)?.BindingContext is DayOfWeekViewModel dayVM)
        {
            dayVM.IsSelected = !dayVM.IsSelected;
        }
    }
    #endregion
}
