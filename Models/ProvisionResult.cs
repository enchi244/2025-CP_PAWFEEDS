using System.Text.Json.Serialization;

namespace PawfeedsProvisioner.Models
{
    /// <summary>
    /// Response returned by the ESP provisioning endpoint.
    /// Older firmware may only send { success, message, deviceId }.
    /// Newer firmware can also include feederId, cameraIp, feederIp.
    /// </summary>
    public class ProvisionResult
    {
        [JsonPropertyName("success")]
        public bool success { get; set; }

        [JsonPropertyName("message")]
        public string? message { get; set; }

        // Unique ID for the device/hub (derived from MAC with colons removed).
        [JsonPropertyName("deviceId")]
        public string? deviceId { get; set; }

        // New: Which feeder this response pertains to (1, 2, ...).
        // Defaults to 0 when not provided by older firmware.
        [JsonPropertyName("feederId")]
        public int feederId { get; set; }

        // New: Network info the device reports back after provisioning (optional).
        [JsonPropertyName("cameraIp")]
        public string? cameraIp { get; set; }

        [JsonPropertyName("feederIp")]
        public string? feederIp { get; set; }
    }
}
