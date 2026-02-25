import { collection, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface Schedule {
  id: string;
  isEnabled: boolean;
  repeatDays?: string[];
  skippedDays?: string[];
  customAddon?: number; // Added support for custom addon
  [key: string]: any;
}

interface ScheduleUpdate {
  id: string;
  changes: Partial<Schedule>;
}

const DAY_CODES = ['M', 'T', 'W', 'R', 'F', 'S', 'U'];

export const recalculatePortionsForPet = async (
  feederId: string, 
  petId: string, 
  knownDailyPortion?: number,
  pendingUpdate?: ScheduleUpdate
) => {
  if (!feederId || !petId) return;

  try {
    let dailyPortion = knownDailyPortion;

    // 1. Fetch Daily Goal
    if (dailyPortion === undefined) {
        const petDocRef = doc(db, 'feeders', feederId, 'pets', petId);
        const petSnap = await getDoc(petDocRef);
        if (!petSnap.exists() || !petSnap.data().recommendedPortion) return;
        dailyPortion = petSnap.data().recommendedPortion as number;
    }

    // 2. Fetch all schedules
    const schedulesRef = collection(db, 'feeders', feederId, 'schedules');
    const q = query(schedulesRef, where('petId', '==', petId));
    const snapshot = await getDocs(q);

    // 3. Prepare In-Memory State (Apply Optimistic Updates)
    let schedules = snapshot.docs.map(d => ({
      id: d.id,
      isEnabled: d.data().isEnabled !== false,
      repeatDays: d.data().repeatDays || [],
      skippedDays: d.data().skippedDays || [],
      customAddon: d.data().customAddon || 0, // Ensure we read the addon
      ...d.data()
    })) as Schedule[];

    if (pendingUpdate) {
      schedules = schedules.map(s => 
        s.id === pendingUpdate.id ? { ...s, ...pendingUpdate.changes } : s
      );
    }

    // --- STEP 4: Calculate Meal Counts Per Day ---
    const dayCounts: Record<string, number> = {
      'M': 0, 'T': 0, 'W': 0, 'R': 0, 'F': 0, 'S': 0, 'U': 0
    };

    const activeSchedules = schedules.filter(s => s.isEnabled);

    activeSchedules.forEach(schedule => {
        const repeats = schedule.repeatDays || [];
        const skips = (pendingUpdate && schedule.id === pendingUpdate.id && pendingUpdate.changes.skippedDays) 
            ? pendingUpdate.changes.skippedDays 
            : (schedule.skippedDays || []);
        
        repeats.forEach(day => {
            if (DAY_CODES.includes(day) && !skips.includes(day)) {
                dayCounts[day]++;
            }
        });
    });

    // --- STEP 5: Calculate Ideal Base Portion Per Day ---
    const dayIdealPortions: Record<string, number> = {};
    DAY_CODES.forEach(day => {
        const count = dayCounts[day];
        dayIdealPortions[day] = count > 0 ? (dailyPortion || 0) / count : 0;
    });

    // --- STEP 6: Detect Conflicts, Split, & Apply Add-ons ---
    const batch = writeBatch(db);

    for (const schedule of schedules) {
      const originalRef = doc(db, 'feeders', feederId, 'schedules', schedule.id);
      
      // Merge pending changes
      const skips = (pendingUpdate && schedule.id === pendingUpdate.id && pendingUpdate.changes.skippedDays) 
          ? pendingUpdate.changes.skippedDays 
          : (schedule.skippedDays || []);
      const repeats = (pendingUpdate && schedule.id === pendingUpdate.id && pendingUpdate.changes.repeatDays)
          ? pendingUpdate.changes.repeatDays
          : (schedule.repeatDays || []);
      
      // Capture the custom addon for this schedule
      const addon = schedule.customAddon || 0;

      if (!schedule.isEnabled) {
          batch.update(originalRef, { portionGrams: 0 });
          continue;
      }

      const activeDays = (repeats as string[]).filter(day => !skips.includes(day));

      if (activeDays.length === 0) {
          batch.update(originalRef, { portionGrams: 0 });
          continue;
      }

      // Group days by their Ideal Base Portion
      const portionGroups: Record<number, string[]> = {};
      
      activeDays.forEach(day => {
          const portion = Math.round(dayIdealPortions[day]);
          if (!portionGroups[portion]) portionGroups[portion] = [];
          portionGroups[portion].push(day);
      });

      const uniquePortions = Object.keys(portionGroups).map(Number);

      // CASE A: Perfect Match
      if (uniquePortions.length === 1) {
          const basePortion = uniquePortions[0];
          // APPLY ADDON HERE
          const finalGrams = basePortion + addon;

          const updates: any = { portionGrams: finalGrams };
          if (pendingUpdate && schedule.id === pendingUpdate.id) {
             Object.assign(updates, pendingUpdate.changes);
          }
          batch.update(originalRef, updates);
      } 
      // CASE B: Conflict Detected -> SPLIT IT
      else if (uniquePortions.length > 1) {
          console.log(`[PortionLogic] Auto-splitting schedule due to portion mismatch.`);
          
          uniquePortions.sort((a, b) => portionGroups[b].length - portionGroups[a].length);
          
          const primaryBase = uniquePortions[0];
          const primaryDays = portionGroups[primaryBase];

          // 1. Update ORIGINAL schedule
          batch.update(originalRef, {
              repeatDays: primaryDays,
              skippedDays: [],
              portionGrams: primaryBase + addon // Apply addon to primary
          });

          // 2. Create NEW schedules for the other groups
          for (let i = 1; i < uniquePortions.length; i++) {
              const base = uniquePortions[i];
              const days = portionGroups[base];
              
              const newScheduleRef = doc(collection(db, 'feeders', feederId, 'schedules'));
              batch.set(newScheduleRef, {
                  ...schedule,
                  id: newScheduleRef.id,
                  repeatDays: days,
                  skippedDays: [],
                  portionGrams: base + addon, // Apply addon to new split
                  customAddon: addon, // Preserve the addon setting
                  isEnabled: true
              });
          }
      }
    }

    await batch.commit();

  } catch (error) {
    console.error("Error in atomic recalculation:", error);
  }
};