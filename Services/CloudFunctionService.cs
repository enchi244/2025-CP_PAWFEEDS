using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System;
using System.Diagnostics;

namespace PawfeedsProvisioner.Services
{
    public class CloudFunctionService
    {
        private readonly HttpClient _httpClient;
        private readonly AuthService _authService;
        private const string FunctionUrl = "https://asia-east2-pawfeedscloud.cloudfunctions.net/sendCommand";

        public CloudFunctionService(AuthService authService)
        {
            _authService = authService;
            _httpClient = new HttpClient();
        }

        public async Task<(bool Success, string Message)> SendCommandAsync(string deviceId, object command)
        {
            try
            {
                var token = await _authService.GetCurrentUserTokenAsync();
                _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var payload = new { data = new { deviceId, command } };
                var jsonPayload = JsonSerializer.Serialize(payload);
                var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

                Debug.WriteLine($"[CloudFunctionService] Sending command to {deviceId}...");
                var response = await _httpClient.PostAsync(FunctionUrl, content);

                if (response.IsSuccessStatusCode)
                {
                    var responseBody = await response.Content.ReadAsStringAsync();
                    Debug.WriteLine($"[CloudFunctionService] Successfully sent command. Response: {responseBody}");
                    return (true, "Command sent successfully.");
                }
                else
                {
                    var errorBody = await response.Content.ReadAsStringAsync();
                    Debug.WriteLine($"[CloudFunctionService] Failed to send command. Status: {response.StatusCode}, Body: {errorBody}");
                    return (false, $"Error: {response.ReasonPhrase}");
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[CloudFunctionService] Exception sending command: {ex.Message}");
                return (false, "An unexpected error occurred.");
            }
        }
    }
}