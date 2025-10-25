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

      for (const feederDoc of feedersSnapshot.docs) {
        const feederId = feederDoc.id;
        const feederData = feederDoc.data();
        const isSmartMode = feederData.isSmartMode || false;

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
                
                // Get pet's recommended portion for recalculation logic
                let recommendedPortion = 0;
                try {
                  const petRef = firestore.doc(`feeders/${feederId}/pets/${schedule.petId}`);
                  const petSnap = await petRef.get();

                  // --- FIX 1: ---
                  // In the Admin SDK, .exists is a boolean property, not a function.
                  if (petSnap.exists) {
                    recommendedPortion = petSnap.data()?.recommendedPortion || 0;
                  }
                } catch (petError) {
                   logger.error(`Could not fetch pet ${schedule.petId} for info.`, petError);
                }

                const pendingFeedRef = feederDoc.ref.collection("pendingFeeds").doc(scheduleDoc.id);
                await pendingFeedRef.set({
                  feederId: feederId,
                  scheduleId: scheduleDoc.id,
                  petId: schedule.petId,
                  petName: schedule.petName,
                  bowlNumber: schedule.bowlNumber,
                  portionGrams: schedule.portionGrams,
                  recommendedPortion: recommendedPortion, // Store for later recalculation
                  status: "pending",
                  createdAt: Timestamp.now(),
                  expiresAt: Timestamp.fromMillis(Timestamp.now().toMillis() + 3600 * 1000), // 1 hour from now
                });
                
                // TODO: Send push notification to user
                
              } else {
                // --- SIMPLE SCHEDULING MODE ---
                logger.info(`SIMPLE MODE: Sending 'feed' command for ${schedule.petName}`);
                
                // 1. Send command to RTDB
                const command = {
                  command: "feed",
                  bowl: schedule.bowlNumber,
                  amount: schedule.portionGrams,
                  timestamp: ServerValue.TIMESTAMP,
                };
                const commandRef = rtdb.ref(`commands/${feederId}`);
                await commandRef.set(command);

                // 2. Log to feedHistory
                await feederDoc.ref.collection("feedHistory").add({
                  petName: schedule.petName,
                  portionGrams: schedule.portionGrams,
                  status: "success",
                  createdAt: Timestamp.now(),
                });
              }
            }
          }
        }).catch((err) => {
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

    // Query all pendingFeeds across all feeders that have expired
    const q = firestore.collectionGroup("pendingFeeds").where("expiresAt", "<=", now);
    const expiredFeedsSnap = await q.get();

    if (expiredFeedsSnap.empty) {
      logger.info("No expired feeds found.");
      return;
    }

    const recalculationPromises: Promise<any>[] = [];

    for (const feedDoc of expiredFeedsSnap.docs) {
      const pendingFeed = feedDoc.data();
      const { feederId, scheduleId, petId, recommendedPortion } = pendingFeed;
      
      logger.warn(`Feed ${feedDoc.id} for pet ${petId} has EXPIRED. Recalculating portions.`);
      
      // This promise will handle the recalculation for one missed feed
      const promise = (async () => {
        const batch = firestore.batch();
        
        // 1. Delete the pending feed request
        batch.delete(feedDoc.ref);
        
        // 2. Disable the missed schedule
        const scheduleRef = firestore.doc(`feeders/${feederId}/schedules/${scheduleId}`);
        batch.update(scheduleRef, { isEnabled: false, portionGrams: 0 });

        // 3. Get all *other* enabled schedules for this pet
        
        // --- FIX 2: ---
        // In the Admin SDK, you must get the doc ref first, then the collection.
        const schedulesRef = firestore.collection("feeders").doc(feederId).collection("schedules");
        const qSchedules = schedulesRef
          .where("petId", "==", petId)
          .where("isEnabled", "==", true);
          
        const enabledSchedulesSnap = await qSchedules.get();
        
        // This count is correct because the missed schedule is not yet committed as disabled.
        // We filter it out manually.
        const remainingEnabledDocs = enabledSchedulesSnap.docs.filter(doc => doc.id !== scheduleId);
        const newEnabledCount = remainingEnabledDocs.length;

        const newPortion = newEnabledCount > 0 ? Math.round(recommendedPortion / newEnabledCount) : 0;

        // 4. Update all *remaining* enabled schedules with the new portion
        remainingEnabledDocs.forEach(scheduleDoc => {
          batch.update(scheduleDoc.ref, { portionGrams: newPortion });
        });
        
        // 5. Commit all changes
        await batch.commit();
        logger.info(`Successfully recalculated portions for pet ${petId} after missed feed.`);
        
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
        // 1. Send command to RTDB
        const command = {
          command: "feed",
          bowl: bowlNumber,
          amount: portionGrams,
          timestamp: ServerValue.TIMESTAMP,
        };
        const commandRef = rtdb.ref(`commands/${feederId}`);
        await commandRef.set(command);

        // 2. Log to feedHistory
        const historyRef = event.data.after.ref.parent.parent?.collection("feedHistory");
        if (historyRef) {
           await historyRef.add({
             petName: petName,
             portionGrams: portionGrams,
             status: "success",
             createdAt: Timestamp.now(),
           });
        }
       
        // 3. Delete the pendingFeed document
        await event.data.after.ref.delete();
        
      } catch (error) {
         logger.error(`Error triggering manual feed for ${feederId}:`, error);
      }
    }
  }
);