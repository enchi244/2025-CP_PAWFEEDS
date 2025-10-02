using Plugin.Firebase.Firestore;

namespace PawfeedsProvisioner.Models;

public class Device
{
    [FirestoreDocumentId]
    public string Id { get; set; } = "";

    [FirestoreProperty("uid")]
    public string Uid { get; set; } = "";

    [FirestoreProperty("name")]
    public string Name { get; set; } = "";

    [FirestoreProperty("lastSeen")]
    public DateTime LastSeen { get; set; }
}