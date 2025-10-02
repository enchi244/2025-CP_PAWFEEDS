using PawfeedsProvisioner.Models;
using System.Collections.ObjectModel;
using System.Text.Json;

namespace PawfeedsProvisioner.Services;

public class ProfileService
{
    private const string FeedersKey = "FeedersData";

    public void SaveFeeders(List<FeederViewModel> feeders)
    {
        try
        {
            string feedersJson = JsonSerializer.Serialize(feeders);
            Preferences.Set(FeedersKey, feedersJson);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error saving feeders data: {ex.Message}");
        }
    }

    public List<FeederViewModel> LoadFeeders()
    {
        try
        {
            string? feedersJson = Preferences.Get(FeedersKey, null);
            if (string.IsNullOrEmpty(feedersJson))
            {
                return CreateDefaultFeeders();
            }

            var feeders = JsonSerializer.Deserialize<List<FeederViewModel>>(feedersJson);

            if (feeders == null || !feeders.Any())
            {
                return CreateDefaultFeeders();
            }

            bool needsSave = false;
            for (int i = 0; i < feeders.Count; i++)
            {
                if (feeders[i].Id == 0)
                {
                    feeders[i].Id = i + 1;
                    needsSave = true;
                }
            }
            if (needsSave)
            {
                SaveFeeders(feeders);
            }

            return feeders;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error loading feeders data: {ex.Message}");
            return CreateDefaultFeeders();
        }
    }

    private List<FeederViewModel> CreateDefaultFeeders()
    {
        var defaultFeeders = new List<FeederViewModel>
        {
            new FeederViewModel 
            { 
                Id = 1,
                Name = "Feeder 1", 
                Profiles = new ObservableCollection<PetProfileViewModel> 
                { 
                    new PetProfileViewModel { Name = "Dog A" } 
                } 
            },
            new FeederViewModel 
            { 
                Id = 2,
                Name = "Feeder 2",
                Profiles = new ObservableCollection<PetProfileViewModel> 
                { 
                    new PetProfileViewModel { Name = "Dog B" } 
                } 
            }
        };
        SaveFeeders(defaultFeeders);
        return defaultFeeders;
    }
}