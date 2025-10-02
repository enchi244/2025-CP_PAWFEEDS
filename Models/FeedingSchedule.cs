using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;

namespace PawfeedsProvisioner.Models
{
    public class FeedingSchedule : INotifyPropertyChanged
    {
        private string _name = string.Empty;
        public string Name
        {
            get => _name;
            set => SetProperty(ref _name, value);
        }

        private TimeSpan _time;
        public TimeSpan Time
        {
            get => _time;
            set => SetProperty(ref _time, value);
        }

        private bool _isEnabled = true;
        public bool IsEnabled
        {
            get => _isEnabled;
            set => SetProperty(ref _isEnabled, value);
        }

        private List<DayOfWeek> _days = new();
        public List<DayOfWeek> Days
        {
            get => _days;
            set => SetProperty(ref _days, value);
        }

        // --- START MODIFICATION ---
        private DateTime _lastTriggered;
        [JsonIgnore] // We don't want to save this to the JSON file, it's for runtime only
        public DateTime LastTriggered
        {
            get => _lastTriggered;
            set => SetProperty(ref _lastTriggered, value);
        }
        // --- END MODIFICATION ---

        public event PropertyChangedEventHandler? PropertyChanged;
        protected virtual void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }

        protected bool SetProperty<T>(ref T backingStore, T value, [CallerMemberName] string propertyName = "")
        {
            if (EqualityComparer<T>.Default.Equals(backingStore, value))
                return false;

            backingStore = value;
            OnPropertyChanged(propertyName);
            return true;
        }
    }
}