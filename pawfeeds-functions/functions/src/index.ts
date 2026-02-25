import { Expo, ExpoPushMessage } from "expo-server-sdk";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { DataSnapshot, getDatabase, ServerValue } from "firebase-admin/database";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { DatabaseEvent, onValueCreated } from "firebase-functions/v2/database";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, onRequest, Request } from "firebase-functions/v2/https";
import { onSchedule, ScheduledEvent } from "firebase-functions/v2/scheduler";

// Initialize Firebase Admin SDK
initializeApp();
const firestore = getFirestore();
const rtdb = getDatabase(); 

// Initialize Expo SDK
const expo = new Expo();

// Define the structure of the expected request body for type safety
interface RegisterFeederRequest {
  feederId: string;
  owner_uid: string;
}

// Define the structure for Schedule data to ensure type safety in Firestore operations
interface ScheduleData {
  time: string;
  repeatDays: string[];
  petId: string;
  bowlNumber: number;
  portionGrams: number;
  isEnabled: boolean; 
}

// Define structure for creating a user
interface CreateUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

/**
 * HTTP Cloud Function to register a new feeder device.
 */
export const registerFeeder = onRequest(
  { region: "asia-southeast1", cors: true },
  async (req: Request, res: any) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { feederId, owner_uid } = req.body as RegisterFeederRequest;

    if (!feederId || !owner_uid) {
      logger.error("Missing feederId or owner_uid in request body", req.body);
      res.status(400).send("Bad Request: Missing feederId or owner_uid.");
      return;
    }

    logger.info(`Attempting to register feeder: ${feederId} for owner: ${owner_uid}`);

    try {
      const db = getFirestore();
      const feederDocRef = db.collection("feeders").doc(feederId);

      await feederDocRef.set({
        owner_uid: owner_uid,
        createdAt: Timestamp.now(),
        status: "online",
        foodLevels: { "1": 100, "2": 100 },
        streamStatus: { "1": "offline", "2": "offline" },
        lowFoodNotifiedAt: {},
      });

      logger.info(`Successfully registered feeder: ${feederId}`);
      res.status(200).send({ status: "success", message: `Feeder ${feederId} registered.` });
    } catch (error) {
      logger.error(`Error registering feeder ${feederId}:`, error);
      res.status(500).send("Internal Server Error");
    }
  }
);

/**
 * Scheduled Cloud Function that runs every minute to check all schedules.
 */
export const scheduledFeedChecker = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "Asia/Singapore", 
    region: "asia-southeast1",
  },
  async (event: ScheduledEvent) => { 
    logger.info("Running scheduled feed checker...");

    const now = new Date();
    const timeZone = "Asia/Singapore";
    
    // --- TIME FORMATTING ---
    const formatterHour = new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone });
    const formatterMinute = new Intl.DateTimeFormat('en-US', { minute: '2-digit', timeZone });
    
    const currentHour = formatterHour.format(now).padStart(2, '0');
    const formattedHour = currentHour === '24' ? '00' : currentHour;

    const currentMinute = formatterMinute.format(now).padStart(2, '0');
    const currentTime = `${formattedHour}:${currentMinute}`;
    
    // --- DAY FORMATTING (FIXED) ---
    // Previously used now.getDay() which is UTC. 
    // Now we force the day retrieval to respect the Singapore Timezone.
    const dayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }); 
    const currentDayShort = dayFormatter.format(now); // "Sun", "Mon", "Tue"...

    // Map 'short' weekday names to your specific App codes:
    // U=Sunday, M=Monday, T=Tuesday, W=Wednesday, R=Thursday, F=Friday, S=Saturday
    const dayMap: { [key: string]: string } = {
      "Sun": "U",
      "Mon": "M",
      "Tue": "T",
      "Wed": "W",
      "Thu": "R",
      "Fri": "F",
      "Sat": "S"
    };

    const currentDay = dayMap[currentDayShort];

    if (!currentDay) {
        logger.error(`Could not determine current day from '${currentDayShort}'`);
        return;
    }

    logger.info(`Current time in ${timeZone}: ${currentTime}, Day: ${currentDay} (Raw: ${currentDayShort})`);

    try {
      const feedersSnapshot = await firestore.collection("feeders").get();
      if (feedersSnapshot.empty) {
        logger.info("No feeders found.");
        return;
      }

      const promises: Promise<any>[] = [];

      for (const feederDoc of feedersSnapshot.docs) {
        const feederId = feederDoc.id;
        const feederData = feederDoc.data();
        const ownerUid = feederData.owner_uid;
        
        const schedulesRef = feederDoc.ref.collection("schedules");
        const q = schedulesRef.where("isEnabled", "==", true);

        const promise = q.get().then(async (scheduleSnapshot) => {
          if (scheduleSnapshot.empty) {
            return;
          }

          for (const scheduleDoc of scheduleSnapshot.docs) {
            const schedule = scheduleDoc.data() as ScheduleData;
            
            if (schedule.time === currentTime && schedule.repeatDays && schedule.repeatDays.includes(currentDay)) {
              logger.info(`MATCH FOUND: Triggering schedule ${scheduleDoc.id} for feeder ${feederId}`);

              // 1. Get the pet's RFID tag from their profile
              const petId = schedule.petId;
              if (!petId) {
                logger.warn(`Schedule ${scheduleDoc.id} has no petId. Skipping.`);
                continue;
              }

              const petDocRef = firestore.collection("feeders").doc(feederId).collection("pets").doc(petId);
              const petDoc = await petDocRef.get();

              if (!petDoc.exists) {
                logger.error(`Pet document ${petId} not found for schedule ${scheduleDoc.id}. Skipping.`);
                continue;
              }

              const petData = petDoc.data();
              const rfidTagId = petData?.rfidTagId;
              const petName = petData?.name || "Unknown Pet";

              if (!rfidTagId) {
                logger.warn(`Pet ${petId} has no rfidTagId. Skipping schedule ${scheduleDoc.id}.`);
                continue;
              }
              
              // 2. Send command to RTDB for the feeder to *await* that tag
              const command = {
                command: "await_rfid", 
                bowl: schedule.bowlNumber,
                amount: schedule.portionGrams,
                expectedTagId: rfidTagId, 
                timestamp: ServerValue.TIMESTAMP,
                scheduleId: scheduleDoc.id, 
                petId: petId, 
              };

              const commandRef = rtdb.ref(`commands/${feederId}`);
              commandRef.set(command).catch((err: unknown) => { 
                logger.error(`Failed to send await_rfid command to feeder ${feederId} for schedule ${scheduleDoc.id}`, err);
              });

              // --- LOGGING: Create a history entry ---
              const historyRef = firestore.collection("feeders").doc(feederId).collection("history");
              historyRef.add({
                type: 'scheduled',
                amount: schedule.portionGrams,
                bowlNumber: schedule.bowlNumber,
                petName: petName,
                timestamp: FieldValue.serverTimestamp()
              }).catch(err => logger.error(`Failed to log history for feeder ${feederId}`, err));


              // 3. Send push notification to the owner to let them know the feeder is "waiting"
              if (ownerUid) {
                const title = `Waiting for ${petName}...`;
                const body = `Feeder is now waiting for ${petName} at Bowl ${schedule.bowlNumber}.`;
                // We make this non-blocking
                sendGenericPushNotification(ownerUid, title, body, { screen: "home" })
                  .catch(err => logger.error(`Failed to send "awaiting" push notification for ${ownerUid}`, err));
              }
            }
          }
        }).catch((err: unknown) => { 
            logger.error(`Error querying schedules for feeder ${feederId}:`, err);
        });
        promises.push(promise);
      }

      await Promise.all(promises);
      logger.info("Scheduled feed checker finished.");

    } catch (error) {
      logger.error("Error running scheduled feed checker:", error);
    }
  }
);


// ==========================================================
// --- Feeder Timeout Handler ---
// ==========================================================

/**
 * Realtime Database trigger that fires when the feeder reports a timeout.
 */
export const onFeederTimeout = onValueCreated(
  {
    ref: "/feeder_timeout_events/{feederId}/{eventKey}",
    region: "asia-southeast1",
  },
  async (event: DatabaseEvent<DataSnapshot>) => { 
    const feederId = event.params.feederId;
    const timeoutEvent = event.data.val();
    
    // The feeder must send the IDs back to Firebase
    const { scheduleId, petId } = timeoutEvent;

    if (!scheduleId || !petId) {
      logger.error("Timeout event missing scheduleId or petId. Deleting record.", timeoutEvent);
      await event.data.ref.remove();
      return;
    }

    logger.info(`Feeder timeout detected for schedule ${scheduleId} on feeder ${feederId}.`);

    // 1. Get ownerUid and petName for notification
    const feederDoc = await firestore.collection("feeders").doc(feederId).get();
    const ownerUid = feederDoc.data()?.owner_uid;

    if (!ownerUid) {
      logger.error(`Owner not found for feeder ${feederId}. Cannot send notification.`);
      await event.data.ref.remove();
      return;
    }
    
    const petDocRef = firestore.collection("feeders").doc(feederId).collection("pets").doc(petId);
    const petDoc = await petDocRef.get();
    const petName = petDoc.data()?.name || "your pet";

    // 2. Send the "No Dog Close" notification
    const title = `⚠️ ${petName} missed their meal.`;
    const body = `Feeder timeout: No RFID detected for ${petName}'s scheduled meal. Tap to skip meal.`;
    
    // Pass scheduleId to the app so it can call the 'skipScheduledMeal' function
    const data = {
      screen: "home",
      action: "missed_meal_notification",
      scheduleId: scheduleId,
    };
    
    // Send a non-blocking notification
    sendGenericPushNotification(ownerUid, title, body, data)
      .catch(err => logger.error(`Failed to send timeout notification for ${ownerUid}`, err));

    // 3. Delete the RTDB record to clean up and prevent re-triggering.
    await event.data.ref.remove();

    logger.info(`Feeder timeout handler finished for schedule ${scheduleId}.`);
  }
);


// ==========================================================
// --- Skip Meal Backend Logic ---
// ==========================================================

/**
 * Callable Cloud Function to handle the "Skip Meal" action.
 */
export const skipScheduledMeal = onCall(
  { region: "asia-southeast1" },
  async (request) => {
    const { scheduleId } = request.data;
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError("unauthenticated", "The user must be logged in to skip a meal.");
    }
    if (!scheduleId) {
      throw new HttpsError("invalid-argument", "Missing scheduleId.");
    }

    logger.info(`User ${uid} requested to skip schedule ${scheduleId}.`);

    try {
      // 1. Find the feeder ID for the owner
      const feedersRef = firestore.collection("feeders");
      const qFeeder = feedersRef.where("owner_uid", "==", uid).limit(1);
      const feederSnapshot = await qFeeder.get();

      if (feederSnapshot.empty) {
        throw new HttpsError("not-found", "No feeder associated with the user.");
      }
      const feederId = feederSnapshot.docs[0].id;
      const schedulesRef = firestore.collection("feeders").doc(feederId).collection("schedules");
      const scheduleDocRef = schedulesRef.doc(scheduleId);
      const scheduleDoc = await scheduleDocRef.get();

      if (!scheduleDoc.exists) {
        throw new HttpsError("not-found", `Schedule ${scheduleId} not found.`);
      }

      // Use the ScheduleData interface here
      const scheduleData = scheduleDoc.data() as ScheduleData | undefined;
      const petId = scheduleData?.petId;

      if (!petId) {
          throw new HttpsError("failed-precondition", `Schedule ${scheduleId} is not linked to a pet.`);
      }
      
      // If already disabled, we don't need to do anything
      if (scheduleData?.isEnabled === false) {
          logger.warn(`Schedule ${scheduleId} is already disabled. Skipping update.`);
          return { status: "success", message: `Schedule ${scheduleId} was already disabled.` };
      }

      // 2. Fetch pet's recommended portion
      const petDocRef = firestore.collection("feeders").doc(feederId).collection("pets").doc(petId);
      const petSnap = await petDocRef.get();
      if (!petSnap.exists || !petSnap.data()?.recommendedPortion) {
        throw new HttpsError("failed-precondition", `Pet ${petId} not found or missing recommendedPortion.`);
      }
      const recommendedPortion = petSnap.data()?.recommendedPortion || 0;

      // 3. Determine new enabled count and portion for recalculation
      const q = schedulesRef.where("petId", "==", petId);
      const querySnapshot = await q.get();

      const currentEnabledCount = querySnapshot.docs.filter(
        doc => (doc.data() as ScheduleData)?.isEnabled === true
      ).length; 
      
      const newEnabledCount = currentEnabledCount > 1 ? currentEnabledCount - 1 : 0;
      
      const newPortion = newEnabledCount > 0 ? Math.round(recommendedPortion / newEnabledCount) : 0;

      // 4. Batch update all schedules for the pet
      const batch = firestore.batch();

      querySnapshot.docs.forEach(docSnapshot => {
        const docRef = docSnapshot.ref;
        const isCurrentDoc = docSnapshot.id === scheduleId;
        const currentData = docSnapshot.data() as ScheduleData;
        const currentIsEnabled = currentData?.isEnabled;

        if (isCurrentDoc) {
          // Disable the skipped schedule and set its portion to 0
          batch.update(docRef, { isEnabled: false, portionGrams: 0 });
        } else if (currentIsEnabled) {
          // Update all other currently active schedules with the new, increased portion
          batch.update(docRef, { portionGrams: newPortion });
        }
      });

      await batch.commit();

      logger.info(`Successfully skipped and disabled schedule ${scheduleId}. New portion per meal: ${newPortion}g`);
      return { status: "success", message: `Meal skipped and schedule ${scheduleId} disabled.` };

    } catch (error) {
      logger.error(`Error skipping scheduled meal ${scheduleId}:`, error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "An unexpected error occurred while processing the skip request.");
    }
  }
);


// ==========================================================
// --- ADMIN: Create User Account ---
// ==========================================================

export const createUserAccount = onCall(
  { region: "asia-southeast1" },
  async (request) => {
    // 1. Security Check: Ensure caller is an Admin
    const requesterUid = request.auth?.uid;
    if (!requesterUid) {
      throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    const userDoc = await firestore.collection("users").doc(requesterUid).get();
    if (!userDoc.exists || !userDoc.data()?.isAdmin) {
      throw new HttpsError("permission-denied", "Only admins can create accounts.");
    }

    const { email, password, firstName, lastName } = request.data as CreateUserRequest;

    if (!email || !password || !firstName || !lastName) {
      throw new HttpsError("invalid-argument", "Missing required fields.");
    }

    try {
      // 2. Create Auth User
      const userRecord = await getAuth().createUser({
        email,
        password,
        displayName: `${firstName} ${lastName}`,
      });

      // 3. Create Firestore Profile
      await firestore.collection("users").doc(userRecord.uid).set({
        uid: userRecord.uid,
        firstName,
        lastName,
        email: email.toLowerCase(),
        createdAt: Timestamp.now(),
        isAdmin: false, // Default to false, promote later if needed
      });

      logger.info(`Admin ${requesterUid} created user ${userRecord.uid}`);
      return { status: "success", uid: userRecord.uid, message: "User created successfully." };

    } catch (error: any) {
      logger.error("Error creating user:", error);
      throw new HttpsError("internal", error.message || "Failed to create user.");
    }
  }
);


// ==========================================================
// --- NEW FEATURE: Pet Milestone Checker (Daily at 9 AM) ---
// ==========================================================

export const checkPetMilestones = onSchedule(
  {
    schedule: "every day 09:00", 
    timeZone: "Asia/Singapore",
    region: "asia-southeast1",
  },
  async (event) => {
    logger.info("Running daily pet milestone checker...");

    try {
      // 1. Query ALL pets across ALL feeders using a Collection Group Query
      const petsSnapshot = await firestore.collectionGroup("pets").get();

      if (petsSnapshot.empty) {
        logger.info("No pets found in database.");
        return;
      }

      const promises: Promise<any>[] = [];
      const today = new Date();

      for (const petDoc of petsSnapshot.docs) {
        const petData = petDoc.data();
        const birthdayTimestamp = petData.birthday;

        // Skip if no birthday set
        if (!birthdayTimestamp) continue;

        // 2. Calculate Age in Months
        const birthDate = birthdayTimestamp.toDate();
        let months = (today.getFullYear() - birthDate.getFullYear()) * 12;
        months -= birthDate.getMonth();
        months += today.getMonth();
        // Adjust if the specific day hasn't passed yet in the current month
        if (today.getDate() < birthDate.getDate()) {
          months--;
        }

        // 3. Check Milestones
        // We use a 'flags' array in the doc so we don't spam them every day of that month
        const notifiedMilestones = petData.notifiedMilestones || [];
        let alertTitle = "";
        let alertBody = "";
        let newMilestoneTag = "";

        // --- Milestone A: 4 Months (Rapid -> Slow Growth) ---
        if (months === 4 && !notifiedMilestones.includes("4mo")) {
          newMilestoneTag = "4mo";
          alertTitle = `🐶 ${petData.name} is 4 months old!`;
          alertBody = "Growth spurts change! Your puppy's calorie needs are shifting. Please check their weight profile to adjust portions.";
        }
        
        // --- Milestone B: 12 Months (Puppy -> Adult) ---
        else if (months === 12 && !notifiedMilestones.includes("12mo")) {
          newMilestoneTag = "12mo";
          alertTitle = `🎂 Happy 1st Birthday ${petData.name}!`;
          alertBody = `${petData.name} is officially an adult! Their metabolism has slowed down. Please update their profile to 'Adult' settings to prevent overfeeding.`;
        }

        // 4. Execute Notification & Update
        if (newMilestoneTag) {
          logger.info(`Triggering milestone ${newMilestoneTag} for pet ${petDoc.id} (${petData.name})`);

          // A. Get the parent Feeder to find the Owner UID
          // Structure: feeders/{feederId}/pets/{petId}
          const feederRef = petDoc.ref.parent.parent; 
          
          if (feederRef) {
            const p = feederRef.get().then(async (feederSnap) => {
              const ownerUid = feederSnap.data()?.owner_uid;
              
              if (ownerUid) {
                // B. Send Push Notification
                await sendGenericPushNotification(ownerUid, alertTitle, alertBody, { screen: "pet_profile", petId: petDoc.id });
                
                // C. Update the Pet Document so we don't notify again
                await petDoc.ref.update({
                  notifiedMilestones: FieldValue.arrayUnion(newMilestoneTag)
                });
              }
            });
            promises.push(p);
          }
        }
      }

      await Promise.all(promises);
      logger.info("Milestone check complete.");

    } catch (error) {
      logger.error("Error in checkPetMilestones:", error);
    }
  }
);


// ==========================================================
// --- EXISTING HELPER FUNCTIONS ---
// ==========================================================

/**
 * Realtime Database trigger that fires when the feeder reports an EMPTY or JAM error.
 */
export const onFeederError = onValueCreated(
  {
    ref: "/feeder_errors/{feederId}/{eventKey}",
    region: "asia-southeast1",
  },
  async (event: DatabaseEvent<DataSnapshot>) => {
    const feederId = event.params.feederId;
    const errorEvent = event.data.val();
    const { bowl } = errorEvent; 

    logger.info(`Feeder error detected for feeder ${feederId}:`, errorEvent);

    // 1. Get ownerUid to know who to notify
    const feederDoc = await firestore.collection("feeders").doc(feederId).get();
    const ownerUid = feederDoc.data()?.owner_uid;

    if (!ownerUid) {
      logger.error(`Owner not found for feeder ${feederId}. Cannot send notification.`);
      await event.data.ref.remove();
      return;
    }

    // 2. Send the Critical Alert Notification
    const title = "⚠️ Feeder Jammed or Empty";
    const body = `Bowl ${bowl} could not dispense food. The container might be empty or jammed. Please check it immediately.`;

    const data = {
      screen: "home",
      action: "feeder_error",
      bowl: String(bowl)
    };

    await sendGenericPushNotification(ownerUid, title, body, data)
      .catch(err => logger.error(`Failed to send error notification for ${ownerUid}`, err));

    // 3. Delete the RTDB record to clean up and prevent re-triggering
    await event.data.ref.remove();
    logger.info(`Feeder error notification sent and record cleaned for ${feederId}.`);
  }
);

// ==========================================================
// --- [NEW] Hunger Alert Handler ---
// ==========================================================

/**
 * Realtime Database trigger that fires when the feeder reports 3 unscheduled scans.
 */
export const onHungerAlert = onValueCreated(
  {
    ref: "/feeder_hunger_alerts/{feederId}/{eventKey}",
    region: "asia-southeast1",
  },
  async (event: DatabaseEvent<DataSnapshot>) => {
    const feederId = event.params.feederId;
    const alertData = event.data.val();
    const { bowl, tagId } = alertData;

    logger.info(`Hunger alert detected for feeder ${feederId}:`, alertData);

    // 1. Get ownerUid 
    const feederDoc = await firestore.collection("feeders").doc(feederId).get();
    const ownerUid = feederDoc.data()?.owner_uid;

    if (!ownerUid) {
      logger.error(`Owner not found for feeder ${feederId}. Cannot send notification.`);
      await event.data.ref.remove();
      return;
    }

    // 2. Try to identify the pet name from the tagId
    let petName = "A pet";
    if (tagId) {
      const petsRef = firestore.collection("feeders").doc(feederId).collection("pets");
      const q = petsRef.where("rfidTagId", "==", tagId).limit(1);
      const petSnapshot = await q.get();
      
      if (!petSnapshot.empty) {
        petName = petSnapshot.docs[0].data().name || "A pet";
      }
    }

    // 3. Send the Hunger Notification
    const title = `🐶 ${petName} might be hungry!`;
    const body = `${petName} has scanned Bowl ${bowl} multiple times without an active schedule.`;

    const data = {
      screen: "home",
      action: "hunger_alert",
      bowl: String(bowl)
    };

    await sendGenericPushNotification(ownerUid, title, body, data)
      .catch(err => logger.error(`Failed to send hunger notification for ${ownerUid}`, err));

    // 4. Delete the RTDB record to clean up and prevent re-triggering
    await event.data.ref.remove();
    logger.info(`Hunger alert notification sent and record cleaned for ${feederId}.`);
  }
);

/**
 * Firestore trigger that fires when a feeder document is updated.
 */
export const onFeederStatusUpdate = onDocumentUpdated(
  { document: "feeders/{feederId}", region: "asia-southeast1" },
  async (event) => { 
    // This function acts as a placeholder now since we removed the notifications.
    // We keep the basic checks so the code remains valid and ready for future features.

    if (!event.data) return;

    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    if (!beforeData || !afterData) return;

    const beforeFoodLevels = beforeData.foodLevels;
    const afterFoodLevels = afterData.foodLevels;
    
    // Just logging for debugging purposes
    if (JSON.stringify(beforeFoodLevels) !== JSON.stringify(afterFoodLevels)) {
       logger.info(`Food levels updated for ${event.params.feederId}`, afterFoodLevels);
    }

    // --- NOTIFICATION LOGIC REMOVED HERE --- 
    return;
  }
);


/**
 * Helper function to send a generic push notification to a user.
 */
async function sendGenericPushNotification(uid: string, title: string, body: string, data: { [key: string]: string }) {
  try {
    const notificationRef = rtdb.ref(`user_notifications/${uid}`).push();
    await notificationRef.set({
      title,
      body,
      data,
      timestamp: ServerValue.TIMESTAMP,
    });
    logger.info(`RTDB notification message sent to user: ${uid}`);
  } catch (rtdbError) {
    logger.error(`Error sending RTDB notification message to ${uid}:`, rtdbError);
  }

  try {
    const userDocRef = firestore.collection("users").doc(uid);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      logger.warn(`User document not found for uid: ${uid}. Cannot send Expo notification.`);
      return;
    }

    const pushToken = userDoc.data()?.pushToken;

    if (!pushToken) {
      logger.warn(`No pushToken found for uid: ${uid}. Cannot send Expo notification.`);
      return;
    }

    if (!Expo.isExpoPushToken(pushToken)) {
      logger.error(`Push token ${pushToken} is not a valid Expo push token.`);
      return;
    }

    const message: ExpoPushMessage = {
      to: pushToken,
      sound: "default",
      title: title,
      body: body,
      data: data,
    };

    const chunks = expo.chunkPushNotifications([message]);
    const tickets: Promise<any>[] = [];
    for (const chunk of chunks) {
      tickets.push(expo.sendPushNotificationsAsync(chunk));
    }

    await Promise.all(tickets);
    logger.info(`Expo push notification sent successfully to user: ${uid}`);

  } catch (error) {
    logger.error(`Error sending Expo push notification to ${uid}:`, error);
  }
}