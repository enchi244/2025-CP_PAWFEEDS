using System.Diagnostics;
using Firebase.Auth;
using Providers = Firebase.Auth.Providers;

namespace PawfeedsProvisioner.Services;

public class AuthService
{
    private readonly FirebaseAuthClient _auth;

    public bool IsSignedIn => _auth.User != null;
    public string? Uid => _auth.User?.Uid;

    public AuthService(string apiKey)
    {
        var config = new FirebaseAuthConfig
        {
            ApiKey = apiKey,
            AuthDomain = "pawfeedscloud.firebaseapp.com",
            Providers = new Providers.FirebaseAuthProvider[]
            {
                new Providers.EmailProvider()
            }
        };

        _auth = new FirebaseAuthClient(config);
    }

    public string? GetCurrentUserUid() => _auth.User?.Uid;

    public async Task<string> SignInAsync(string email, string password)
    {
        try
        {
            await _auth.SignInWithEmailAndPasswordAsync(email, password);
            return "Success";
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AuthService] SignIn failed: {ex.Message}");
            return ex.Message;
        }
    }

    public async Task<string> SignUpAsync(string email, string password)
    {
        try
        {
            await _auth.CreateUserWithEmailAndPasswordAsync(email, password);
            return "Success";
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AuthService] SignUp failed: {ex.Message}");
            return ex.Message;
        }
    }

    public void SignOut() => _auth.SignOut();

    public Task SignOutAsync()
    {
        _auth.SignOut();
        return Task.CompletedTask;
    }

    public async Task<string> GetCurrentUserTokenAsync()
    {
        if (_auth.User == null)
            throw new Exception("User is not authenticated.");
        return await _auth.User.GetIdTokenAsync(true);
    }

    // Back-compat tuple forms (if anything still calls these)
    public async Task<(bool, string)> LoginAsync(string email, string password)
    {
        try
        {
            await _auth.SignInWithEmailAndPasswordAsync(email, password);
            return (true, string.Empty);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AuthService] Login failed: {ex.Message}");
            return (false, ex.Message);
        }
    }

    public async Task<(bool, string)> RegisterAsync(string email, string password)
    {
        try
        {
            await _auth.CreateUserWithEmailAndPasswordAsync(email, password);
            return (true, string.Empty);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AuthService] Register failed: {ex.Message}");
            return (false, ex.Message);
        }
    }
}
