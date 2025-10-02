namespace PawfeedsProvisioner.Models
{
    /// <summary>
    /// Payload sent to the ESP provisioning endpoint.
    /// Existing firmware expects: ssid, password, hostname, uid.
    /// We also include feederId (ignored by older firmware but useful for newer builds).
    /// </summary>
    public class ProvisionRequest
    {
        // Required by current firmware
        public string ssid { get; set; } = string.Empty;
        public string password { get; set; } = string.Empty;
        public string hostname { get; set; } = string.Empty;
        public string uid { get; set; } = string.Empty;

        // New: which feeder slot this app is provisioning (1, 2, ...)
        // Older firmware will safely ignore this extra field.
        public int feederId { get; set; } = 1;
    }
}
