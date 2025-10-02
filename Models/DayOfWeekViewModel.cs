using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace PawfeedsProvisioner.Models;

// This class helps manage the state of the day-of-the-week buttons in the UI.
public class DayOfWeekViewModel : INotifyPropertyChanged
{
    public DayOfWeek Day { get; }
    public string Name { get; }

    private bool _isSelected;
    public bool IsSelected
    {
        get => _isSelected;
        set
        {
            if (_isSelected != value)
            {
                _isSelected = value;
                OnPropertyChanged();
            }
        }
    }

    public DayOfWeekViewModel(DayOfWeek day, string name, bool isSelected = true)
    {
        Day = day;
        Name = name;
        _isSelected = isSelected;
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}