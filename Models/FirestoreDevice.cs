using Plugin.Firebase.Firestore;

namespace PawfeedsProvisioner.Models
{
    public class FirestoreDevice
    {
        [FirestoreDocumentId]
        public string Id { get; set; } = string.Empty;

        [FirestoreProperty("name")]
        public string Name { get; set; } = string.Empty;
    }
}