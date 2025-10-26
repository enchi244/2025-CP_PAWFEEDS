import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
// 1. Import native firestore types
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ListRenderItem,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
// 2. Import native db instance
import { db } from '../../firebaseConfig';

const COLORS = {
  primary: '#8C6E63',
  accent: '#FFC107',
  background: '#F5F5F5',
  text: '#333333',
  lightGray: '#E0E0E0',
  white: '#FFFFFF',
  darkGray: '#757575',
};

interface Schedule {
  id: string;
  name: string;
  time: string;
  petId: string; // Add petId
  petName: string;
  bowlNumber: number;
  isEnabled: boolean;
  repeatDays: string[];
  portionGrams?: number; // Add optional portionGrams
}

// 3. Define the Unsubscribe type
type Unsubscribe = () => void;

const formatScheduleTime = (timeString: string): string => {
    if (!timeString) return 'Invalid Time';
    const [hours, minutes] = timeString.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return 'Invalid Time';

    const date = new Date();
    date.setHours(hours, minutes);

    return date.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: true
    });
};

export default function SchedulesScreen() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const [activeFilter, setActiveFilter] = useState('All');
  const [feederId, setFeederId] = useState<string | null>(null);

  // --- New State for Smart Scheduling ---
  const [isSmartMode, setIsSmartMode] = useState(false);
  const [isFeederLoading, setIsFeederLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setIsFeederLoading(false);
      return;
    }

    let unsubscribeSchedules: Unsubscribe = () => {};
    let unsubscribeFeeder: Unsubscribe = () => {};

    const fetchFeederAndSchedules = async () => {
      try {
        // 4. Use native firestore syntax
        const feedersRef = db.collection('feeders');
        const qFeeder = feedersRef.where('owner_uid', '==', user.uid);
        const querySnapshot = await qFeeder.get();

        if (!querySnapshot.empty) {
          const feederDoc = querySnapshot.docs[0];
          const currentFeederId = feederDoc.id;
          setFeederId(currentFeederId);

          // --- Listen to Feeder Doc for Smart Mode ---
          // 5. Use native firestore onSnapshot syntax
          unsubscribeFeeder = feederDoc.ref.onSnapshot(
            (doc: FirebaseFirestoreTypes.DocumentSnapshot) => { // Explicit type
              setIsSmartMode(doc.data()?.isSmartMode || false);
              setIsFeederLoading(false);
            },
            (error) => { // Error handler
              console.error("Feeder onSnapshot error:", error);
              setIsFeederLoading(false);
            }
          );

          // 6. Use native firestore syntax
          const schedulesCollectionRef = db.collection('feeders').doc(currentFeederId).collection('schedules');
          const qSchedules = schedulesCollectionRef; // Query stays the same, just using native ref

          // 7. Use native firestore onSnapshot syntax
          unsubscribeSchedules = qSchedules.onSnapshot(
            (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => { // Explicit type
              const schedulesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule));
              setSchedules(schedulesData);
              setLoading(false);
            }, (error) => { // Error handler
                console.error("Error fetching schedules: ", error);
                Alert.alert("Error", "Could not fetch schedules from the database.");
                setLoading(false);
            }
          );
        } else {
          setSchedules([]);
          Alert.alert('No Feeder Found', 'Could not find a feeder associated with your account. Please provision one.');
          setLoading(false);
          setIsFeederLoading(false);
        }
      } catch (error) {
        console.error("Error fetching feeder or schedules:", error);
        Alert.alert("Error", "Could not load schedules. Please try again.");
        setLoading(false);
        setIsFeederLoading(false);
      }
    };

    fetchFeederAndSchedules();
    return () => {
      unsubscribeSchedules();
      unsubscribeFeeder(); // Cleanup both listeners
    };
  }, [user]);

  const petFilters = ['All', ...Array.from(new Set(schedules.map(s => s.petName).filter(Boolean)))];

  const handleAddSchedule = () => {
    router.push({ pathname: "/schedule/[id]", params: { id: 'new' } });
  };

  const handleEditSchedule = (scheduleId: string) => {
    router.push({ pathname: "/schedule/[id]", params: { id: scheduleId } });
  };

  // --- New Handler for Smart Mode Toggle ---
  const onToggleSmartMode = async (newValue: boolean) => {
    if (!feederId) return;
    setIsSmartMode(newValue); // Optimistic update
    try {
      // 8. Use native firestore syntax
      const feederRef = db.collection('feeders').doc(feederId);
      await feederRef.update({ isSmartMode: newValue });
    } catch (error) {
      console.error('Error updating smart mode: ', error);
      Alert.alert('Error', 'Could not update smart mode setting.');
      setIsSmartMode(!newValue); // Revert on error
    }
  };

  const toggleSwitch = async (id: string, petId: string, currentValue: boolean) => {
    if (!feederId) {
      Alert.alert('Error', 'Feeder ID not found. Cannot update schedule.');
      return;
    }
    if (!petId) {
        Alert.alert("Error", "This schedule is not linked to a pet.");
        return;
    }

    try {
      // 9. Use native firestore batch
      const batch = db.batch();
      const schedulesRef = db.collection('feeders').doc(feederId).collection('schedules');
      const petRef = db.collection('feeders').doc(feederId).collection('pets').doc(petId);

      // 1. Get the pet's total recommended portion
      const petSnap = await petRef.get();
      if (!petSnap.exists) {
        throw new Error("Pet not found for recalculation.");
      }
      const recommendedPortion = petSnap.data()?.recommendedPortion || 0;

      // 2. Get all schedules for the pet to determine the new count of enabled schedules
      const q = schedulesRef.where('petId', '==', petId);
      const querySnapshot = await q.get();

      // The new state is `!currentValue`. We count how many schedules will be enabled *after* this toggle.
      const newEnabledCount = querySnapshot.docs.filter(doc => {
        return doc.id === id ? !currentValue : doc.data().isEnabled;
      }).length;

      const newPortion = newEnabledCount > 0 ? Math.round(recommendedPortion / newEnabledCount) : 0;

      // 3. Update all schedules for this pet
      querySnapshot.forEach(scheduleDoc => {
        const isCurrentDoc = scheduleDoc.id === id;
        const willBeEnabled = isCurrentDoc ? !currentValue : scheduleDoc.data().isEnabled;
        // Use native batch update syntax
        batch.update(scheduleDoc.ref, { isEnabled: willBeEnabled, portionGrams: willBeEnabled ? newPortion : 0 });
      });

      // 4. Commit all changes at once
      await batch.commit();
    } catch (error) {
      console.error("Error updating schedule status: ", error);
      Alert.alert("Error", "Could not update the schedule's status.");
    }
  };

  const filteredSchedules = schedules.filter(schedule => {
    if (activeFilter === 'All') return true;
    return schedule.petName === activeFilter;
  });

  const renderScheduleItem: ListRenderItem<Schedule> = ({ item }) => (
    <TouchableOpacity style={styles.scheduleItem} onPress={() => handleEditSchedule(item.id)}>
      <View style={styles.detailsContainer}>
        <Text style={styles.scheduleTime}>{formatScheduleTime(item.time)}</Text>
        <Text style={styles.scheduleName}>{`${item.name} for ${item.petName}`}</Text>
        <Text style={styles.scheduleDays}>{item.repeatDays?.join(', ') || 'No repeat'}</Text>
      </View>
      <View style={styles.controlsContainer}>
        {item.isEnabled && item.portionGrams !== undefined && (
          <Text style={styles.portionText}>{item.portionGrams}g</Text>
        )}
        <Switch
          trackColor={{ false: COLORS.lightGray, true: COLORS.accent }}
          thumbColor={COLORS.white}
          ios_backgroundColor={COLORS.lightGray}
          onValueChange={() => toggleSwitch(item.id, item.petId, item.isEnabled)}
          value={item.isEnabled}
        />
      </View>
    </TouchableOpacity>
  );

  // --- Header component including the new Switch ---
  const renderListHeader = () => (
    <View style={styles.smartModeContainer}>
      <View style={styles.smartModeTextContainer}>
        <Text style={styles.smartModeLabel}>Enable Smart Scheduling</Text>
        <Text style={styles.smartModeInfo}>
          Notify and wait for confirmation before feeding.
        </Text>
      </View>
      <Switch
        trackColor={{ false: COLORS.lightGray, true: COLORS.accent }}
        thumbColor={COLORS.white}
        ios_backgroundColor={COLORS.lightGray}
        onValueChange={onToggleSmartMode}
        value={isSmartMode}
        disabled={isFeederLoading}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Feeding Schedules</Text>
      </View>

      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {petFilters.map(petName => (
            <TouchableOpacity
              key={petName}
              style={[styles.filterButton, activeFilter === petName && styles.filterButtonActive]}
              onPress={() => setActiveFilter(petName)}>
              <Text style={[styles.filterButtonText, activeFilter === petName && styles.filterButtonTextActive]}>{petName}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={filteredSchedules}
          renderItem={renderScheduleItem}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderListHeader} // Add the header here
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="clock-outline" size={80} color={COLORS.lightGray} />
              <Text style={styles.emptyText}>No Schedules Found</Text>
              <Text style={styles.emptySubText}>Try adjusting your filters or adding a new schedule.</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={handleAddSchedule}>
        <MaterialCommunityIcons name="plus" size={32} color={COLORS.text} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray, alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.primary },
  filterBar: { paddingVertical: 12, paddingHorizontal: 12, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  filterButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: COLORS.lightGray, backgroundColor: COLORS.white, marginHorizontal: 4 },
  filterButtonActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterButtonText: { fontWeight: '600', color: COLORS.primary },
  filterButtonTextActive: { color: COLORS.white },
  listContainer: { padding: 20, flexGrow: 1 },
  // Styles for the new smart mode switch
  smartModeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  smartModeTextContainer: {
    flex: 1,
    marginRight: 10,
  },
  smartModeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text
  },
  smartModeInfo: {
    fontSize: 13,
    color: COLORS.darkGray,
    marginTop: 2,
  },
  // Original schedule item styles
  scheduleItem: { backgroundColor: COLORS.white, borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  detailsContainer: { flex: 1, marginRight: 10 },
  scheduleTime: { fontSize: 22, fontWeight: 'bold', color: COLORS.text },
  scheduleName: { fontSize: 16, color: '#555', marginTop: 4 },
  scheduleDays: { fontSize: 14, color: '#999', marginTop: 4 },
  controlsContainer: { flexDirection: 'row', alignItems: 'center' },
  portionText: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary, marginRight: 12 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, marginTop: 50 },
  emptyText: { fontSize: 20, fontWeight: 'bold', color: '#aaa', marginTop: 16 },
  emptySubText: { fontSize: 16, color: '#bbb', marginTop: 8, textAlign: 'center' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 6 },
});