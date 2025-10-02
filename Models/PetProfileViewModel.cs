using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;

namespace PawfeedsProvisioner.Models;

public class PetProfileViewModel : INotifyPropertyChanged
{
    private string _name = "Default Profile";
    public string Name
    {
        get => _name;
        set { _name = value; OnPropertyChanged(nameof(Name)); }
    }

    private int _ageMonths = 12;
    public int AgeMonths
    {
        get => _ageMonths;
        set { _ageMonths = value; OnPropertyChanged(); RecalculateFeedingAmount(); }
    }

    private double _weightKg = 10.0;
    public double WeightKg
    {
        get => _weightKg;
        set { _weightKg = value; OnPropertyChanged(); RecalculateFeedingAmount(); }
    }

    private int _foodKcalPer100g = 350;
    public int FoodKcalPer100g
    {
        get => _foodKcalPer100g;
        set { _foodKcalPer100g = value; OnPropertyChanged(); RecalculateFeedingAmount(); }
    }
    
    private int _sexStatus = 0; // 0=neutered, 1=male, 2=female
    public int SexStatus
    {
        get => _sexStatus;
        set { _sexStatus = value; OnPropertyChanged(); RecalculateFeedingAmount(); }
    }
    
    private int _activityLevel = 1; // 0=sedentary, 1=normal, 2=active
    public int ActivityLevel
    {
        get => _activityLevel;
        set { _activityLevel = value; OnPropertyChanged(); RecalculateFeedingAmount(); }
    }

    private int _displayCalculation = 0;
    public int DisplayCalculation
    {
        get => _displayCalculation;
        private set { _displayCalculation = value; OnPropertyChanged(); }
    }

    private int _editedCalculation = 0;
    public int EditedCalculation
    {
        get => _editedCalculation;
        set { _editedCalculation = value; OnPropertyChanged(); }
    }

    public ObservableCollection<FeedingSchedule> Schedules { get; set; } = new();

    [JsonIgnore]
    public List<string> SexStatusOptions { get; } = new() { "Neutered/Spayed", "Intact Male", "Intact Female" };
    [JsonIgnore]
    public List<string> ActivityLevelOptions { get; } = new() { "Sedentary", "Normal", "Active" };

    public PetProfileViewModel()
    {
        // Listen for when schedules are added or removed to trigger a recalculation.
        Schedules.CollectionChanged += (s, e) => RecalculateFeedingAmount();
    }

    // --- Calculation Logic ---
    public void RecalculateFeedingAmount()
    {
        if (WeightKg <= 0 || FoodKcalPer100g <= 0)
        {
            DisplayCalculation = 0;
            EditedCalculation = 0;
            return;
        }

        double rer = 70.0 * Math.Pow(WeightKg, 0.75);
        double k;

        // *** START FIX: Correctly apply multipliers based on age ***
        if (AgeMonths < 4)
        {
            k = 3.0;
        }
        else if (AgeMonths <= 12)
        {
            k = 2.0;
        }
        else // Adult dog logic
        {
            // Base 'k' on sex status for adults
            k = (SexStatus == 0) ? 1.6 : 1.8; // 0 for Neutered/Spayed

            // Refine 'k' based on activity level for adults ONLY
            switch (ActivityLevel)
            {
                case 0: // Sedentary
                    k = 1.2;
                    break;
                case 2: // Active
                    // The logic from your text file: increase k, but cap it.
                    k = Math.Min(k + 0.2, 2.0); 
                    break;
                // case 1 (Normal) uses the base 'k' from sex status
            }
        }
        // *** END FIX ***

        double dailyKcalNeeded = rer * k;
        double gramsPerDay = (dailyKcalNeeded / FoodKcalPer100g) * 100.0;
        
        int numberOfMeals = Schedules.Count(s => s.IsEnabled);

        if (numberOfMeals > 0)
        {
            DisplayCalculation = (int)Math.Round(gramsPerDay / numberOfMeals);
        }
        else
        {
            DisplayCalculation = 0;
        }
        
        EditedCalculation = DisplayCalculation;
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}