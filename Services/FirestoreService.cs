using System;
using System.Linq;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading.Tasks;
using Plugin.Firebase.Firestore;
using PawfeedsProvisioner.Models;
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
            {
                Debug.WriteLine("[FirestoreService] GetMyDevicesAsync aborted: user not logged in.");
                return new List<Device>();
            }

            try
            {
                var query = _firestore
                    .GetCollection("devices")
                    .WhereEqualsTo("uid", uid);

                var snapshot = await query.GetDocumentsAsync<Device>();

                var deviceList = snapshot.Documents
                    .Select(doc =>
                    {
                        var device = doc.Data;
                        if (device != null)
                            device.Id = doc.Reference.Id;
                        return device;
                    })
                    .Where(d => d != null && !string.IsNullOrEmpty(d!.Name))
                    .ToList();

                Debug.WriteLine($"[FirestoreService] Found {deviceList.Count} devices for UID {uid}.");
                return deviceList!;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[FirestoreService] GetMyDevicesAsync error: {ex.Message}");
                return new List<Device>();
            }
        }

        public async Task SaveDeviceAsync(FeederViewModel feeder)
        {
            var uid = _authService.GetCurrentUserUid();
            if (string.IsNullOrWhiteSpace(uid) || string.IsNullOrWhiteSpace(feeder.DeviceId))
            {
                Debug.WriteLine($"[FirestoreService] SaveDeviceAsync aborted: missing UID or DeviceId. UID='{uid}', DeviceId='{feeder.DeviceId}'.");
                return;
            }

            try
            {
                var deviceRef = _firestore.GetCollection("devices").GetDocument(feeder.DeviceId);

                var deviceData = new Dictionary<object, object>
                {
                    { "name", feeder.Name },
                    { "uid", uid },
                    { "lastSeen", FieldValue.ServerTimestamp() }
                };

                await deviceRef.SetDataAsync(deviceData, SetOptions.Merge());

                Debug.WriteLine($"[FirestoreService] Upserted device '{feeder.DeviceId}'.");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[FirestoreService] SaveDeviceAsync error for '{feeder.DeviceId}': {ex.Message}");
            }
        }

        public async Task SaveFeederAsync(FeederViewModel feeder)
        {
            var uid = _authService.GetCurrentUserUid();
            if (string.IsNullOrWhiteSpace(uid) ||
                string.IsNullOrWhiteSpace(feeder.DeviceId) ||
                feeder.Id <= 0)
            {
                Debug.WriteLine($"[FirestoreService] SaveFeederAsync aborted: invalid UID/DeviceId/FeederId. UID='{uid}', DeviceId='{feeder.DeviceId}', FeederId='{feeder.Id}'.");
                return;
            }

            try
            {
                var feedersRef = _firestore
                    .GetCollection("devices")
                    .GetDocument(feeder.DeviceId)
                    .GetCollection("feeders");

                var feederDoc = feedersRef.GetDocument(feeder.Id.ToString());

                var data = new Dictionary<object, object>
                {
                    { "name", feeder.Name },
                    { "cameraIp", feeder.CameraIp },
                    { "feederIp", feeder.FeederIp },
                    { "containerWeightGrams", feeder.ContainerWeight },
                    { "lastSeen", FieldValue.ServerTimestamp() }
                };

                await feederDoc.SetDataAsync(data, SetOptions.Merge());

                Debug.WriteLine($"[FirestoreService] Upserted feeder '{feeder.Id}' under device '{feeder.DeviceId}'.");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[FirestoreService] SaveFeederAsync error for device '{feeder.DeviceId}', feeder '{feeder.Id}': {ex.Message}");
            }
        }

        /// <summary>
        /// Checks if a device with the given hostname exists for the current user.
        /// </summary>
        public async Task<bool> DeviceWithHostnameExistsAsync(string hostname)
        {
            var uid = _authService.GetCurrentUserUid();
            if (string.IsNullOrEmpty(uid)) return false;

            try
            {
                var query = _firestore
                    .GetCollection("devices")
                    .WhereEqualsTo("uid", uid)
                    .WhereEqualsTo("name", hostname);

                var snapshot = await query.GetDocumentsAsync<Device>();
                return snapshot.Documents.Any();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[FirestoreService] DeviceWithHostnameExistsAsync error: {ex.Message}");
                return false;
            }
        }
    }
}
