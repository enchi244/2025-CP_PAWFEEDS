using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using PawfeedsProvisioner.Models;

namespace PawfeedsProvisioner.Services;

public class ProvisioningClient
{
    private readonly HttpClient _http;
    private readonly JsonSerializerOptions _json;

    public ProvisioningClient()
    {
        _http = new HttpClient
        {
            // BaseAddress is for the AP mode. We'll use full URLs for LAN calls.
            BaseAddress = new Uri("http://192.168.4.1/"),
            Timeout = TimeSpan.FromSeconds(20)
        };

        _json = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };
    }
    
    public async Task<IReadOnlyList<WifiNetwork>> GetNetworksAsync(CancellationToken ct = default)
    {
        var raw = await _http.GetStringAsync("scan", ct);
        if (string.IsNullOrWhiteSpace(raw))
            return Array.Empty<WifiNetwork>();

        var trimmed = raw.Trim();

        try
        {
            if (trimmed.StartsWith("["))
            {
                var list = JsonSerializer.Deserialize<List<WifiNetwork>>(trimmed, _json) ?? new();
                return Normalize(list);
            }

            if (trimmed.StartsWith("{"))
            {
                using var doc = JsonDocument.Parse(trimmed);
                var root = doc.RootElement;

                if (TryExtractArray(root, out var arr))
                {
                    var list = ParseArray(arr);
                    return Normalize(list);
                }

                if (root.TryGetProperty("list", out var listArr) && listArr.ValueKind == JsonValueKind.Array)
                {
                    var list = ParseArray(listArr);
                    return Normalize(list);
                }

                var single = ParseOne(root);
                if (single is not null) return new[] { single };
            }

            var lines = raw
                .Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(s => s.Trim())
                .Where(s => s.Length > 0)
                .Select(ssid => new WifiNetwork { SSID = ssid })
                .ToList();

            return lines;
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"Failed to parse /scan response: {ex.Message}\nRaw: {Truncate(trimmed, 200)}");
        }
    }

    public async Task<ProvisionResult?> ProvisionAsync(ProvisionRequest req, CancellationToken ct = default)
    {
        var jsonRequest = JsonSerializer.Serialize(req);
        var content = new StringContent(jsonRequest, Encoding.UTF8, "application/json");
        var resp = await _http.PostAsync("provision", content, ct);

        if (!resp.IsSuccessStatusCode)
            return new ProvisionResult { success = false, message = $"HTTP {(int)resp.StatusCode}" };

        var raw = await resp.Content.ReadAsStringAsync(ct);
        if (string.IsNullOrWhiteSpace(raw))
            return new ProvisionResult { success = false, message = "Empty response" };

        try
        {
            var trimmed = raw.Trim();
            if (trimmed.StartsWith("{"))
            {
                var pr = JsonSerializer.Deserialize<ProvisionResult>(trimmed, _json);
                if (pr is not null) return pr;
            }

            return new ProvisionResult { success = true, message = raw };
        }
        catch
        {
            return new ProvisionResult { success = true, message = raw };
        }
    }
    
    public async Task<bool> FactoryResetAsync(string ipAddress, CancellationToken ct = default)
    {
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(5));

            var request = new HttpRequestMessage(HttpMethod.Post, $"http://{ipAddress}/factory_reset");
            request.Content = new StringContent("", Encoding.UTF8, "application/json");

            var response = await _http.SendAsync(request, cts.Token);
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[FactoryResetAsync] Failed to reset device at {ipAddress}: {ex.Message}");
            return false;
        }
    }

    // --- START MODIFICATION: Updated method signature and logic ---
    public async Task<bool> FeedNowAsync(string ipAddress, int grams, int feederId, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(ipAddress) || ipAddress == "N/A" || grams <= 0 || (feederId != 1 && feederId != 2))
        {
            return false;
        }

        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(10)); // Timeout for the request

            var url = $"http://{ipAddress}/feed";
            var payload = new { grams, feeder = feederId }; // Add feederId to payload
            var jsonContent = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            
            var response = await _http.PostAsync(url, jsonContent, cts.Token);
            
            // We consider any 2xx status code as success for starting the feed.
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[FeedNowAsync] Failed to send feed command to {ipAddress} for feeder {feederId}: {ex.Message}");
            return false;
        }
    }
    // --- END MODIFICATION ---

    public async Task<string?> GetStatusAsync(CancellationToken ct = default)
    {
        try { return await _http.GetStringAsync("status", ct); }
        catch { return null; }
    }

    private static bool TryExtractArray(JsonElement root, out JsonElement arr)
    {
        string[] keys = { "networks", "aps", "AP", "results", "wifi", "stations" };
        foreach (var k in keys)
        {
            if (root.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Array)
            {
                arr = v;
                return true;
            }
        }
        if (root.TryGetProperty("scan", out var scan) && scan.ValueKind == JsonValueKind.Object)
        {
            if (TryExtractArray(scan, out arr))
                return true;
        }
        arr = default;
        return false;
    }
    private List<WifiNetwork> ParseArray(JsonElement arr)
    {
        var list = new List<WifiNetwork>(arr.GetArrayLength());
        foreach (var el in arr.EnumerateArray())
        {
            var one = ParseOne(el);
            if (one is not null) list.Add(one);
        }
        return list;
    }
    private WifiNetwork? ParseOne(JsonElement el)
    {
        if (el.ValueKind != JsonValueKind.Object) return null;
        string ssid = GetString(el, "ssid") ?? GetString(el, "SSID") ?? GetString(el, "ap") ?? "";
        int rssi = GetInt(el, "rssi") ?? GetInt(el, "RSSI") ?? GetInt(el, "signal") ?? 0;
        bool? secure = GetBool(el, "secure") ?? GetBool(el, "encrypted") ?? GetBool(el, "secureMode");
        if (secure is null)
        {
            var auth = GetString(el, "auth") ?? GetString(el, "encryption") ?? GetString(el, "ENC");
            if (!string.IsNullOrEmpty(auth))
                secure = !auth.Equals("open", StringComparison.OrdinalIgnoreCase);
        }
        return new WifiNetwork
        {
            SSID = ssid,
            RSSI = rssi,
            Secure = secure ?? true
        };
    }
    private static string? GetString(JsonElement obj, string name)
        => obj.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    private static int? GetInt(JsonElement obj, string name)
    {
        if (!obj.TryGetProperty(name, out var v)) return null;
        return v.ValueKind switch
        {
            JsonValueKind.Number => v.TryGetInt32(out var i) ? i : (int?)null,
            JsonValueKind.String => int.TryParse(v.GetString(), out var s) ? s : (int?)null,
            _ => null
        };
    }
    private static bool? GetBool(JsonElement obj, string name)
    {
        if (!obj.TryGetProperty(name, out var v)) return null;
        return v.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.String => bool.TryParse(v.GetString(), out var b) ? b : (bool?)null,
            JsonValueKind.Number => v.TryGetInt32(out var i) ? i != 0 : (bool?)null,
            _ => null
        };
    }
    private static IReadOnlyList<WifiNetwork> Normalize(List<WifiNetwork> list)
        => list.Where(n => !string.IsNullOrWhiteSpace(n.SSID))
               .OrderByDescending(n => n.RSSI)
               .ToList();
    private static string Truncate(string s, int max)
        => s.Length <= max ? s : s.Substring(0, max) + "…";
}