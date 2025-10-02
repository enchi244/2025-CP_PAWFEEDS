using System.Text.Json.Serialization;

namespace PawfeedsProvisioner.Models
{
    public class DeviceStatus
    {
        [JsonPropertyName("mode")]
        public string Mode { get; set; } = string.Empty; // Fix: Added default value

        [JsonPropertyName("connected")]
        public bool Connected { get; set; }

        [JsonPropertyName("ip")]
        public string Ip { get; set; } = string.Empty; // Fix: Added default value

        [JsonPropertyName("hostname")]
        public string Hostname { get; set; } = string.Empty; // Fix: Added default value

        [JsonPropertyName("container_weight_grams")]
        public double ContainerWeightGrams { get; set; }
    }
}