namespace PawfeedsProvisioner.Models;

public class ProvisionRequest
{
    public string ssid { get; set; } = "";
    public string password { get; set; } = "";
    public string hostname { get; set; } = "";
    public string uid { get; set; } = "";
}