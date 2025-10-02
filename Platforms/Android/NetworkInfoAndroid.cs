#if ANDROID
using System.Net;
using Android.OS;
using Android.Net;
using Android.Net.Wifi;
using Java.Net;
using System.Runtime.Versioning;
using PawfeedsProvisioner.Services;

// Aliases to avoid any ambiguity with MAUI's Application type
using AApp = Android.App.Application;
using AContext = Android.Content.Context;


namespace PawfeedsProvisioner.Platforms.Android;

public class NetworkInfoAndroid : INetworkInfo
{
    private readonly AContext _context;

    public NetworkInfoAndroid(AContext context)
    {
        _context = context;
    }

    // Convert legacy int to IPv4
    private static IPAddress IntToIp(int value)
    {
        byte[] bytes =
        {
            (byte)(value & 0xFF),
            (byte)((value >> 8) & 0xFF),
            (byte)((value >> 16) & 0xFF),
            (byte)((value >> 24) & 0xFF)
        };
        return new IPAddress(bytes);
    }

    private static int PrefixFromMask(IPAddress mask)
    {
        int count = 0;
        foreach (var b in mask.GetAddressBytes())
        {
            byte v = b;
            for (int i = 0; i < 8; i++)
            {
                if ((v & 0x80) != 0) count++;
                v <<= 1;
            }
        }
        return count;
    }

    public (IPAddress? localIp, int prefix) GetLocalIpAndPrefix()
    {
        // FIX: Use the injected context instead of the static AApp.Context
        var cm = (ConnectivityManager?)_context.GetSystemService(AContext.ConnectivityService);

        if (cm == null) return (null, 24);

        // Modern path for Android M+ (API 23+) where ActiveNetwork is reliable.
        if (OperatingSystem.IsAndroidVersionAtLeast(23))
        {
            var network = cm.ActiveNetwork;
            if (network != null)
            {
                var lp = cm.GetLinkProperties(network);
                if (lp != null)
                {
                    foreach (var la in lp.LinkAddresses)
                    {
                        if (la.Address is Inet4Address addr)
                        {
                            var bytes = addr.GetAddress();
                            if (bytes is { Length: 4 })
                            {
                                var ip = new IPAddress(bytes);
                                int prefix = la.PrefixLength;
                                return (ip, prefix);
                            }
                        }
                    }
                }
            }
        }
        
        // Legacy fallback for older Android versions (< API 23).
        #pragma warning disable CA1422 // Validate platform compatibility
        var wifi = _context.GetSystemService(AContext.WifiService) as WifiManager;
        if (wifi?.DhcpInfo is DhcpInfo dhcp)
        {
            try
            {
                var ip = IntToIp(dhcp.IpAddress);
                int prefix = 24;

                if (dhcp.Netmask != 0)
                {
                    var mask = IntToIp(dhcp.Netmask);
                    prefix = PrefixFromMask(mask);
                }
                return (ip, prefix);
            }
            catch
            {
                // ignore and return defaults below
            }
        }
        #pragma warning restore CA1422 // Validate platform compatibility

        return (null, 24);
    }
}
#endif