// Import v2 APIs
const {onCall} = require("firebase-functions/v2/https");
const {onRequest} = require("firebase-functions/v2/https");
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
 * Triggered by a webhook from the feeder to notify the user of a dispense.
 */
exports.onDispense = onRequest(async (request, response) => {
  // 1. Get the deviceId from the webhook's query parameters
  const deviceId = request.query.deviceId;

  if (!deviceId) {
    console.error("No deviceId provided in the request query.");
    response.status(400).send("Bad Request: Missing 'deviceId' parameter.");
    return;
  }

  console.log(`Dispense event received for device: ${deviceId}`);

  const db = getFirestore();

  try {
    // 2. Look up the device in Firestore to find the owner's uid
    const deviceRef = db.collection("devices").doc(deviceId);
    const deviceDoc = await deviceRef.get();

    if (!deviceDoc.exists) {
      console.error(`Device ${deviceId} not found in Firestore.`);
      response.status(404).send("Device not found.");
      return;
    }

    const uid = deviceDoc.data().uid;
    const deviceName = deviceDoc.data().name || "Your pet";

    if (!uid) {
      console.error(`Device ${deviceId} is not associated with a user.`);
      response.status(500).send("Internal Server Error: Device has no owner.");
      return;
    }

    // 3. Look up the user in Firestore to get their fcmToken
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.error(`User ${uid} not found in Firestore.`);
      response.status(404).send("User not found.");
      return;
    }

    const fcmToken = userDoc.data().fcmToken;

    if (!fcmToken) {
      console.log(`User ${uid} does not have an FCM token. Skipping push.`);
      response.status(200).send("OK: No action needed (no FCM token).");
      return;
    }

    // 4. Send a push notification using the Firebase Admin SDK
    const message = {
      token: fcmToken,
      notification: {
        title: "Your pet has been fed!",
        body: `${deviceName} has just dispensed a meal.`,
      },
      // You can also send data payloads
      data: {
        deviceId: deviceId,
        dispenseTime: new Date().toISOString(),
      },
    };

    await admin.messaging().send(message);
    console.log(`Successfully sent notification to user ${uid}.`);
    response.status(200).send("OK: Notification sent.");
  } catch (error) {
    console.error(
        `Failed to send notification for device ${deviceId}:`, error,
    );
    response.status(500).send("Internal Server Error.");
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
