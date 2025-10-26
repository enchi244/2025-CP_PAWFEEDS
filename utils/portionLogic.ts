// 1. Import native firestore types
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
// 2. Import native db instance
import { db } from '../firebaseConfig';

// Define the shape of our schedule documents
interface Schedule {
  id: string;
  isEnabled: boolean;
  [key: string]: any; // Allow other properties
}

// IMPORTANT: Replace this with your actual feeder ID or implement dynamic fetching
// TODO: Fetch this dynamically instead of hardcoding
const feederId = "eNFJODJ5YP1t3lw77WJG";

/**
 * Recalculates the portion size for all active schedules of a given pet and updates them in Firestore.
 * @param petId The ID of the pet whose schedule portions need recalculating.
 */
export const recalculatePortionsForPet = async (petId: string) => {
  if (!petId) {
    console.error("recalculatePortionsForPet called with no petId.");
    return;
  }
  if (!feederId) {
    console.error("recalculatePortionsForPet called with no feederId.");
    return; // Cannot proceed without feederId
  }

  try {
    // 3. Use native firestore syntax
    const petDocRef = db.collection('feeders').doc(feederId).collection('pets').doc(petId);
    // 4. Use native get() and explicitly type snapshot
    const petSnap: FirebaseFirestoreTypes.DocumentSnapshot = await petDocRef.get();

    // 5. Use exists() method to satisfy linter
    if (!petSnap.exists() || !petSnap.data()?.recommendedPortion) {
      console.log(`Pet ${petId} not found or has no recommendedPortion. Skipping calculation.`);
      return;
    }
    const dailyPortion = petSnap.data()?.recommendedPortion as number;

    // 6. Use native firestore syntax
    const schedulesCollectionRef = db.collection('feeders').doc(feederId).collection('schedules');
    const q = schedulesCollectionRef.where('petId', '==', petId);
    // 7. Use native get()
    const scheduleSnapshot = await q.get();

    // Cast the documents to our Schedule type more safely
    const allSchedules = scheduleSnapshot.docs.map(doc => {
      const data = doc.data() as Partial<Schedule>;
      return {
        id: doc.id,
        isEnabled: data.isEnabled ?? false, // Default to false if isEnabled is missing
        ...data,
      };
    }) as Schedule[];

    const activeSchedules = allSchedules.filter(s => s.isEnabled);
    const activeScheduleCount = activeSchedules.length;

    // Calculate the new per-meal portion
    const perMealPortion = activeScheduleCount > 0 ? Math.round(dailyPortion / activeScheduleCount) : 0;

    // 8. Use native firestore batch
    const batch = db.batch();

    allSchedules.forEach(schedule => {
      // 9. Use native firestore syntax
      const scheduleDocRef = db.collection('feeders').doc(feederId).collection('schedules').doc(schedule.id);
      // Update active schedules with the new portion, and inactive ones with 0
      const newPortion = schedule.isEnabled ? perMealPortion : 0;
      // 10. Use native batch update syntax
      batch.update(scheduleDocRef, { portionGrams: newPortion });
    });

    await batch.commit();
    console.log(`Successfully recalculated portions for pet ${petId}. New per-meal portion: ${perMealPortion}g`);

  } catch (error) {
    console.error("Error recalculating portions: ", error);
  }
};