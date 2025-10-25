import { Expo, ExpoPushMessage } from "expo-server-sdk";
import { initializeApp } from "firebase-admin/app";
import { getDatabase, ServerValue } from "firebase-admin/database";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onRequest, Request } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

// Initialize Firebase Admin SDK
initializeApp();

const firestore = getFirestore();
const rtdb = getDatabase();
const expo = new Expo(); // Initialize Expo SDK

// Define the structure of the expected request body for type safety
interface RegisterFeederRequest {
  feederId: string;
  owner_uid: string;
}

/**
 * HTTP Cloud Function to register a new feeder device.
 */
export const registerFeeder = onRequest(
  { region: "asia-southeast1", cors: true },
  async (req: Request, res) => {
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
      const feederDocRef = firestore.collection("feeders").doc(feederId);

      await feederDocRef.set({
        owner_uid: owner_uid,
        createdAt: Timestamp.now(),
        status: "online",
        foodLevels: { "1": 100, "2": 100 },
        streamStatus: { "1": "offline", "2": "offline" },
        isSmartMode: false, // Default smart mode to off
        expoPushToken: null, // Add field to store push token
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
    timeZone: "Asia/Singapore", // PHT is GMT+8, same as Singapore
    region: "asia-southeast1",
  },
  async (event) => {
    logger.info("Running scheduled feed checker...");

    const now = new Date();
    const timeZone = "Asia/Singapore";

    const formatterHour = new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone });
    const formatterMinute = new Intl.DateTimeFormat("en-US", { minute: "2-digit", timeZone });

    const currentHour = formatterHour.format(now).padStart(2, "0");
    const formattedHour = currentHour === "24" ? "00" : currentHour;

    const currentMinute = formatterMinute.format(now).padStart(2, "0");
    const currentTime = `${formattedHour}:${currentMinute}`;

    const dayMap = ["U", "M", "T", "W", "R", "F", "S"];
    const currentDay = dayMap[now.getDay()];

    logger.info(`Current time in ${timeZone}: ${currentTime}, Day: ${currentDay}`);

    try {
      const feedersSnapshot = await firestore.collection("feeders").get();
      if (feedersSnapshot.empty) {
        logger.info("No feeders found.");
        return;
      }

      const promises: Promise<any>[] = [];
      const notificationsToSend: ExpoPushMessage[] = [];

      for (const feederDoc of feedersSnapshot.docs) {
        const feederId = feederDoc.id;
        const feederData = feederDoc.data();
        const isSmartMode = feederData.isSmartMode || false;
        const pushToken = feederData.expoPushToken;

        const schedulesRef = feederDoc.ref.collection("schedules");
        const q = schedulesRef.where("isEnabled", "==", true);

        const promise = q.get().then(async (scheduleSnapshot) => {
          if (scheduleSnapshot.empty) {
            return;
          }

          for (const scheduleDoc of scheduleSnapshot.docs) {
            const schedule = scheduleDoc.data();

            if (schedule.time === currentTime && schedule.repeatDays && schedule.repeatDays.includes(currentDay)) {
              logger.info(`MATCH FOUND: Schedule ${scheduleDoc.id} for feeder ${feederId}`);

              if (isSmartMode) {
                // --- SMART SCHEDULING MODE ---
                logger.info(`SMART MODE: Creating pending feed for ${schedule.petName}`);
                
                let recommendedPortion = 0;
                try {
                  const petRef = firestore.doc(`feeders/${feederId}/pets/${schedule.petId}`);
                  const petSnap = await petRef.get();
                  if (petSnap.exists) {
                    recommendedPortion = petSnap.data()?.recommendedPortion || 0;
                  }
                } catch (petError) {
                   logger.error(`Could not fetch pet ${schedule.petId} for info.`, petError);
                }

                const pendingFeedRef = feederDoc.ref.collection("pendingFeeds").doc(); // Create with a new ID
                const pendingFeedId = pendingFeedRef.id;

                await pendingFeedRef.set({
                  feederId: feederId,
                  scheduleId: scheduleDoc.id,
                  petId: schedule.petId,
                  petName: schedule.petName,
                  bowlNumber: schedule.bowlNumber,
                  portionGrams: schedule.portionGrams,
                  recommendedPortion: recommendedPortion,
                  status: "pending",
                  createdAt: Timestamp.now(),
                  expiresAt: Timestamp.fromMillis(Timestamp.now().toMillis() + 3600 * 1000), // 1 hour from now
                });
                
                // --- Send "Smart" Notification ---
                if (pushToken && Expo.isExpoPushToken(pushToken)) {
                  notificationsToSend.push({
                    to: pushToken,
                    sound: "default",
                    title: `Time to feed ${schedule.petName}!`,
                    body: `Waiting for ${schedule.petName} to arrive.`,
                    data: {
                      type: "smartFeed",
                      feederId: feederId,
                      pendingFeedId: pendingFeedId,
                    },
                    // Set category for "Feed Now" action
                    categoryId: "smartFeedAction",
                  });
                }
                
              } else {
                // --- SIMPLE SCHEDULING MODE ---
                logger.info(`SIMPLE MODE: Sending 'feed' command for ${schedule.petName}`);
                
                const command = {
                  command: "feed",
                  bowl: schedule.bowlNumber,
                  amount: schedule.portionGrams,
                  timestamp: ServerValue.TIMESTAMP,
                };
                const commandRef = rtdb.ref(`commands/${feederId}`);
                await commandRef.set(command);

                await feederDoc.ref.collection("feedHistory").add({
                  petName: schedule.petName,
                  portionGrams: schedule.portionGrams,
                  status: "success",
                  createdAt: Timestamp.now(),
                });

                // --- Send "Simple" Notification ---
                if (pushToken && Expo.isExpoPushToken(pushToken)) {
                  notificationsToSend.push({
                    to: pushToken,
                    sound: "default",
                    title: "Feeding Dispensed 🐾",
                    body: `${schedule.petName} is being fed ${schedule.portionGrams}g.`,
                    data: { type: "simpleFeed" },
                  });
                }
              }
            }
          }
        }).catch((err) => {
          logger.error(`Error querying schedules for feeder ${feederId}:`, err);
        });
        promises.push(promise);
      }

      await Promise.all(promises);

      // Send all collected notifications in chunks
      if (notificationsToSend.length > 0) {
        logger.info(`Sending ${notificationsToSend.length} notifications...`);
        const chunks = expo.chunkPushNotifications(notificationsToSend);
        const tickets = [];
        for (const chunk of chunks) {
          try {
            const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            tickets.push(...ticketChunk);
            // NOTE: You can add logic here to check for errors
          } catch (error) {
            logger.error("Error sending push notification chunk:", error);
          }
        }
      }

      logger.info("Scheduled feed checker finished.");
    } catch (error) {
      logger.error("Error running scheduled feed checker:", error);
    }
  }
);

/**
 * Runs every 5 minutes to check for expired pending feeds.
 */
export const checkPendingFeeds = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "Asia/Singapore",
    region: "asia-southeast1",
  },
  async (event) => {
    logger.info("Running checkPendingFeeds...");
    const now = Timestamp.now();

    const q = firestore.collectionGroup("pendingFeeds").where("expiresAt", "<=", now);
    const expiredFeedsSnap = await q.get();

    if (expiredFeedsSnap.empty) {
      logger.info("No expired feeds found.");
      return;
    }

    const recalculationPromises: Promise<any>[] = [];

    for (const feedDoc of expiredFeedsSnap.docs) {
      const pendingFeed = feedDoc.data();
      const { feederId, scheduleId, petId, recommendedPortion, petName } = pendingFeed;
      
      logger.warn(`Feed ${feedDoc.id} for pet ${petId} has EXPIRED. Recalculating portions.`);
      
      const promise = (async () => {
        const batch = firestore.batch();
        
        batch.delete(feedDoc.ref);
        
        const scheduleRef = firestore.doc(`feeders/${feederId}/schedules/${scheduleId}`);
        batch.update(scheduleRef, { isEnabled: false, portionGrams: 0 });

        const schedulesRef = firestore.collection("feeders").doc(feederId).collection("schedules");
        const qSchedules = schedulesRef
          .where("petId", "==", petId)
          .where("isEnabled", "==", true);
          
        const enabledSchedulesSnap = await qSchedules.get();
        
        const remainingEnabledDocs = enabledSchedulesSnap.docs.filter(doc => doc.id !== scheduleId);
        const newEnabledCount = remainingEnabledDocs.length;

        const newPortion = newEnabledCount > 0 ? Math.round(recommendedPortion / newEnabledCount) : 0;

        remainingEnabledDocs.forEach(scheduleDoc => {
          batch.update(scheduleDoc.ref, { portionGrams: newPortion });
        });
        
        await batch.commit();
        logger.info(`Successfully recalculated portions for pet ${petId} after missed feed.`);

        // --- Send "Missed Feed" Notification ---
        const feederDoc = await firestore.doc(`feeders/${feederId}`).get();
        const pushToken = feederDoc.data()?.expoPushToken;
        if (pushToken && Expo.isExpoPushToken(pushToken)) {
          await expo.sendPushNotificationsAsync([{
            to: pushToken,
            sound: "default",
            title: "Missed Feeding 😿",
            body: `${petName} missed a meal. Portions have been recalculated for the day.`,
            data: { type: "missedFeed" },
          }]);
        }
        
      })();
      
      recalculationPromises.push(promise.catch(err => {
         logger.error(`Failed to recalculate portions for pet ${petId}`, err);
      }));
    }

    await Promise.all(recalculationPromises);
    logger.info("checkPendingFeeds finished.");
  }
);


/**
 * Triggers when a pendingFeed doc is updated (i.e., user presses "Feed" button).
 */
export const onPendingFeedTrigger = onDocumentUpdated(
  {
    document: "feeders/{feederId}/pendingFeeds/{pendingFeedId}",
    region: "asia-southeast1",
  },
  async (event) => {
    if (!event.data) return;

    const before = event.data.before.data();
    const after = event.data.after.data();

    // Check if status changed from 'pending' to 'triggered'
    if (before.status === "pending" && after.status === "triggered") {
      const { feederId } = event.params;
      const { bowlNumber, portionGrams, petName } = after;
      
      logger.info(`MANUAL TRIGGER: Sending 'feed' command for ${petName}`);

      try {
        const command = {
          command: "feed",
          bowl: bowlNumber,
          amount: portionGrams,
          timestamp: ServerValue.TIMESTAMP,
        };
        const commandRef = rtdb.ref(`commands/${feederId}`);
        await commandRef.set(command);

        const historyRef = event.data.after.ref.parent.parent?.collection("feedHistory");
        if (historyRef) {
           await historyRef.add({
             petName: petName,
             portionGrams: portionGrams,
             status: "success",
             createdAt: Timestamp.now(),
           });
        }
       
        await event.data.after.ref.delete();
        
      } catch (error) {
         logger.error(`Error triggering manual feed for ${feederId}:`, error);
      }
    }
  }
);

/**
 * Runs once every day at midnight (Singapore Time) to re-enable schedules.
 */
export const resetDailySchedules = onSchedule(
  {
    schedule: "0 0 * * *", // 00:00 every day
    timeZone: "Asia/Singapore",
    region: "asia-southeast1",
  },
  async (event) => {
    logger.info("Running resetDailySchedules...");
    
    // Find all schedules that were disabled (presumably from a missed feed)
    const q = firestore.collectionGroup("schedules").where("isEnabled", "==", false);
    const disabledSchedulesSnap = await q.get();

    if (disabledSchedulesSnap.empty) {
      logger.info("No disabled schedules to re-enable.");
      return;
    }

    // Use a map to group schedules by petId to perform recalculations
    const petsToRecalculate = new Map<string, { feederId: string; recommendedPortion: number }>();
    const batch = firestore.batch();

    for (const scheduleDoc of disabledSchedulesSnap.docs) {
      const schedule = scheduleDoc.data();
      const { petId, feederId } = schedule;

      // Re-enable the schedule
      batch.update(scheduleDoc.ref, { isEnabled: true });
      
      if (petId && !petsToRecalculate.has(petId)) {
        // Get pet info for recalculation
        try {
          const petSnap = await firestore.doc(`feeders/${feederId}/pets/${petId}`).get();
          if (petSnap.exists) {
            petsToRecalculate.set(petId, {
              feederId: feederId,
              recommendedPortion: petSnap.data()?.recommendedPortion || 0,
            });
          }
        } catch (e) {
          logger.error(`Could not fetch pet ${petId} for recalculation.`);
        }
      }
    }
    
    // Commit the re-enabling first
    await batch.commit();
    logger.info(`Re-enabled ${disabledSchedulesSnap.size} schedules.`);

    // --- Now, recalculate portions for all affected pets ---
    // We must do this *after* enabling them to get the correct count.
    
    const recalcBatch = firestore.batch();
    
    for (const [petId, petInfo] of petsToRecalculate.entries()) {
      const { feederId, recommendedPortion } = petInfo;

      const schedulesRef = firestore.collection(`feeders/${feederId}/schedules`);
      const qPetSchedules = schedulesRef.where("petId", "==", petId);
      
      const petSchedulesSnap = await qPetSchedules.get();
      
      const allPetSchedules = petSchedulesSnap.docs.map(doc => doc.data());
      // We are now calculating based on the newly re-enabled state
      const enabledCount = allPetSchedules.filter(s => s.isEnabled).length;
      
      const newPortion = enabledCount > 0 ? Math.round(recommendedPortion / enabledCount) : 0;
      
      // Update all schedules for this pet with the new portion
      petSchedulesSnap.docs.forEach(doc => {
        recalcBatch.update(doc.ref, {
          portionGrams: doc.data().isEnabled ? newPortion : 0,
        });
      });
      logger.info(`Recalculating portions for pet ${petId}. New portion: ${newPortion}g`);
    }

    await recalcBatch.commit();
    logger.info("resetDailySchedules finished.");
  }
);