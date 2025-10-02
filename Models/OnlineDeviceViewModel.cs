namespace PawfeedsProvisioner.Models
{
    public class OnlineDeviceViewModel
    {
        public string DeviceId { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string Hostname { get; set; } = string.Empty;
        public string Ip { get; set; } = string.Empty;
        public string FeederIp { get; set; } = string.Empty;
        public int FeederId { get; set; }
        
        // --- START MODIFICATION ---
        public double ContainerWeight { get; set; }
        public string ContainerWeightDisplay => $"{ContainerWeight:F1} g";
        // --- END MODIFICATION ---
    }
}