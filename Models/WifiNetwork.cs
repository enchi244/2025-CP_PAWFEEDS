namespace PawfeedsProvisioner.Models;

public class WifiNetwork
{
    public string SSID { get; set; } = "";
    public int RSSI { get; set; } = 0;
    public bool Secure { get; set; } = true;
}
