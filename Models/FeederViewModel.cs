using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace PawfeedsProvisioner.Models
{
    public class FeederViewModel : INotifyPropertyChanged
    {
        private int _id;
        public int Id
        {
            get => _id;
            set => SetProperty(ref _id, value);
        }

        private string _name = string.Empty;
        public string Name
        {
            get => _name;
            set => SetProperty(ref _name, value);
        }

        private string _deviceId = string.Empty;
        public string DeviceId
        {
            get => _deviceId;
            set => SetProperty(ref _deviceId, value);
        }

        private string _cameraIp = string.Empty;
        public string CameraIp
        {
            get => _cameraIp;
            set => SetProperty(ref _cameraIp, value);
        }

        private string _feederIp = string.Empty;
        public string FeederIp
        {
            get => _feederIp;
            set => SetProperty(ref _feederIp, value);
        }

        private bool _isSelected;
        public bool IsSelected
        {
            get => _isSelected;
            set => SetProperty(ref _isSelected, value);
        }
        
        // --- START MODIFICATION ---
        private bool _isOnline;
        public bool IsOnline
        {
            get => _isOnline;
            set => SetProperty(ref _isOnline, value);
        }
        // --- END MODIFICATION ---

        private double _containerWeight;
        public double ContainerWeight
        {
            get => _containerWeight;
            set
            {
                if (SetProperty(ref _containerWeight, value))
                {
                    OnPropertyChanged(nameof(ContainerWeightDisplay));
                }
            }
        }

        public string ContainerWeightDisplay => $"{ContainerWeight:F1} g";

        public ObservableCollection<PetProfileViewModel> Profiles { get; set; } = new();

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