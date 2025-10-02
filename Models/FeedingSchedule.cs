using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace PawfeedsProvisioner.Models;

public class FeedingSchedule : INotifyPropertyChanged
{
    private string _name = "New Schedule";
    public string Name
    {
        get => _name;
        set { _name = value; OnPropertyChanged(); }
    }

    private TimeSpan _time = TimeSpan.FromHours(8);
    public TimeSpan Time
    {
        get => _time;
        set { _time = value; OnPropertyChanged(); }
    }

    private bool _isEnabled = true;
    public bool IsEnabled
    {
        get => _isEnabled;
        set { _isEnabled = value; OnPropertyChanged(); }
    }

    private List<DayOfWeek> _days = new List<DayOfWeek> 
    { 
        DayOfWeek.Sunday, DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, 
        DayOfWeek.Thursday, DayOfWeek.Friday, DayOfWeek.Saturday 
    };
    public List<DayOfWeek> Days
    {
        get => _days;
        set { _days = value; OnPropertyChanged(); }
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}