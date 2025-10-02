using System.Linq;
using PawfeedsProvisioner.Models;
using Plugin.Firebase.Firestore;
using System.Collections.Generic;
using Device = PawfeedsProvisioner.Models.Device;

namespace PawfeedsProvisioner.Services
{
    public class FirestoreService
    {
        private readonly IFirebaseFirestore _firestore;
        private readonly AuthService _authService;

        public FirestoreService(AuthService authService)
        {
            _firestore = CrossFirebaseFirestore.Current;
            _authService = authService;
        }

        public async Task<List<Device>> GetMyDevicesAsync()
        {
            var uid = _authService.GetCurrentUserUid();
            if (string.IsNullOrEmpty(uid))
                return new List<Device>();

            try
            {
                // Build query against "devices" where field "uid" == current user
                var query = _firestore
                    .GetCollection("devices")
                    .WhereEqualsTo("uid", uid);

                // Correct pattern for Plugin.Firebase v3.0.0
                var snapshot = await query.GetDocumentsAsync<Device>();
                var list = snapshot.Documents
                    .Select(doc => doc.Data) // .Data contains the deserialized object
                    .Where(device => device != null && !string.IsNullOrEmpty(device.Name))
                    .ToList();

                return list;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[FirestoreService] Error: {ex.Message}");
                return new List<Device>();
            }
        }

        public async Task UpdateUserFcmToken(string token)
        {
            var uid = _authService.GetCurrentUserUid();
            if (string.IsNullOrEmpty(uid) || string.IsNullOrEmpty(token))
            {
                Console.WriteLine("[FirestoreService] Cannot update FCM token. User not logged in or token is empty.");
                return;
            }

            try
            {
                var userRef = _firestore.GetCollection("users").GetDocument(uid);
                var data = new Dictionary<string, object>
                {
                    { "fcmToken", token },
                    { "lastSeen", FieldValue.ServerTimestamp } // Good practice to update a timestamp
                };
                await userRef.SetDocumentAsync(data, SetOptions.MergeAll);
                Console.WriteLine($"[FirestoreService] FCM token successfully updated for user {uid}.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[FirestoreService] Error updating FCM token: {ex.Message}");
            }
        }
    }
}
