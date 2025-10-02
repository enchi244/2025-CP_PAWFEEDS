// Import v2 APIs
const {onCall} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions/v2");

// Import Firebase Admin SDK
const admin = require("firebase-admin");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

admin.initializeApp();

// Set the region for all functions in this file using the v2 API
setGlobalOptions({region: "asia-east2"});

/**
 * Registers a new device in Firestore.
 */
exports.registerDevice = onCall(async (request) => {
  const {deviceId, name, uid} = request.data;

  if (!uid || !deviceId || !name) {
    throw new Error(
      "The function must be called with 'uid', 'deviceId', and 'name' " +
      "arguments.",
    );
  }

  const db = getFirestore();
  const deviceRef = db.collection("devices").doc(deviceId);

  try {
    const doc = await deviceRef.get();
    if (doc.exists) {
      console.log(`Device ${deviceId} already registered.`);
      return {success: true, message: "Device already registered."};
    } else {
      await deviceRef.set({
        uid: uid,
        name: name,
        lastSeen: FieldValue.serverTimestamp(),
      });
      console.log(
        `Successfully registered device ${deviceId} for user ${uid}.`,
      );
      return {success: true, message: "Device registered successfully."};
    }
  } catch (error) {
    console.error("Error registering device:", error);
    throw new Error(
      "An unexpected error occurred while registering the device.",
    );
  }
});


/**
 * Sends a command to a specific device.
 */
exports.sendCommand = onCall(async (request) => {
  // Check if the user is authenticated.
  if (!request.auth) {
    throw new Error("The function must be called while authenticated.");
  }

  const uid = request.auth.uid;
  const {deviceId, command} = request.data;

  // Validate input from the app.
  if (!deviceId || !command) {
    throw new Error(
      "The function must be called with 'deviceId' and 'command' arguments.",
    );
  }

  const db = getFirestore();
  const deviceRef = db.collection("devices").doc(deviceId);

  try {
    const deviceDoc = await deviceRef.get();

    // Verify the device belongs to the user making the request.
    if (!deviceDoc.exists || deviceDoc.data().uid !== uid) {
      throw new Error("No such device found or permission denied.");
    }

    // Add the command to a subcollection.
    const commandRef = await deviceRef.collection("commands").add({
      command: command, // e.g., { type: 'FEED', amount: 50 }
      createdAt: FieldValue.serverTimestamp(),
      status: "pending",
    });

    console.log(
      `Command ${JSON.stringify(command)} sent to device ${deviceId} ` +
      `by user ${uid}. Command ID: ${commandRef.id}`,
    );

    return {success: true, message: "Command sent successfully."};
  } catch (error) {
    console.error(`Error sending command to device ${deviceId}:`, error);
    throw new Error(
      "An unexpected error occurred while sending the command.",
    );
  }
});