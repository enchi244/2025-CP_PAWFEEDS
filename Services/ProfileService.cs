using System.Diagnostics;
using System.Text.Json;
using PawfeedsProvisioner.Models;

namespace PawfeedsProvisioner.Services
{
    public class ProfileService
    {
        private readonly string _filePath;
        private List<FeederViewModel>? _feedersCache; // In-memory cache

        public ProfileService()
        {
            _filePath = Path.Combine(FileSystem.AppDataDirectory, "feeders.json");
        }

        // This method now loads from file ONLY if the cache is empty.
        public List<FeederViewModel> GetFeeders()
        {
            if (_feedersCache != null)
            {
                return _feedersCache;
            }

            if (!File.Exists(_filePath))
            {
                // Create two default feeders if the file doesn't exist.
                _feedersCache = new List<FeederViewModel>
                {
                    new FeederViewModel { Id = 1, Name = "Feeder 1" },
                    new FeederViewModel { Id = 2, Name = "Feeder 2" }
                };
                return _feedersCache;
            }
            try
            {
                var json = File.ReadAllText(_filePath);
                _feedersCache = JsonSerializer.Deserialize<List<FeederViewModel>>(json) ?? new List<FeederViewModel>();
                return _feedersCache;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[ProfileService] Error loading feeders: {ex.Message}");
                _feedersCache = new List<FeederViewModel>();
                return _feedersCache;
            }
        }

        // This method saves to the file AND updates the in-memory cache.
        public void SaveFeeders(List<FeederViewModel> feeders)
        {
            try
            {
                _feedersCache = feeders; // Update the cache
                var json = JsonSerializer.Serialize(feeders, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_filePath, json);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[ProfileService] Error saving feeders: {ex.Message}");
            }
        }
    }
}