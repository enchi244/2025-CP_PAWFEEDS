namespace PawfeedsProvisioner.Services;

public interface INetworkInfo
{
    // Returns (localIp, subnetPrefix) e.g., ("192.168.1.12", 24). If unknown, prefix=24.
    (System.Net.IPAddress? localIp, int prefix) GetLocalIpAndPrefix();
}
