import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, onSnapshot, query, Unsubscribe, where, writeBatch } from 'firebase/firestore';
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
import { db } from '../../firebaseConfig';

const COLORS = {
  primary: '#8C6E63',
  accent: '#FFC107',
  background: '#F5F5F5',
  text: '#333333',
  lightGray: '#E0E0E0',
  white: '#FFFFFF',
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

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let unsubscribe: Unsubscribe = () => {};

    const fetchFeederAndSchedules = async () => {
      try {
        const feedersRef = collection(db, 'feeders');
        const qFeeder = query(feedersRef, where('owner_uid', '==', user.uid));
        const querySnapshot = await getDocs(qFeeder);

        if (!querySnapshot.empty) {
          const feederDoc = querySnapshot.docs[0];
          const currentFeederId = feederDoc.id;
          setFeederId(currentFeederId);

          const schedulesCollectionRef = collection(db, 'feeders', currentFeederId, 'schedules');
          const qSchedules = query(schedulesCollectionRef);

          unsubscribe = onSnapshot(qSchedules, (snapshot) => {
            const schedulesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule));
            setSchedules(schedulesData);
            setLoading(false);
          }, (error) => {
              console.error("Error fetching schedules: ", error);
              Alert.alert("Error", "Could not fetch schedules from the database.");
              setLoading(false);
          });
        } else {
          setSchedules([]);
          Alert.alert('No Feeder Found', 'Could not find a feeder associated with your account. Please provision one.');
          setLoading(false);
        }
      } catch (error) {
        console.error("Error fetching feeder or schedules:", error);
        Alert.alert("Error", "Could not load schedules. Please try again.");
        setLoading(false);
      }
    };

    fetchFeederAndSchedules();
    return () => unsubscribe(); // Cleanup the listener
  }, [user]);

  const petFilters = ['All', ...Array.from(new Set(schedules.map(s => s.petName).filter(Boolean)))];


  const handleAddSchedule = () => {
    router.push({ pathname: "/schedule/[id]", params: { id: 'new' } });
  };

  const handleEditSchedule = (scheduleId: string) => {
    router.push({ pathname: "/schedule/[id]", params: { id: scheduleId } });
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
      const batch = writeBatch(db);
      const schedulesRef = collection(db, 'feeders', feederId, 'schedules');
      const petRef = doc(db, 'feeders', feederId, 'pets', petId);

      // 1. Get the pet's total recommended portion
      const petSnap = await getDoc(petRef);
      if (!petSnap.exists()) {
        throw new Error("Pet not found for recalculation.");
      }
      const recommendedPortion = petSnap.data().recommendedPortion || 0;

      // 2. Get all schedules for the pet to determine the new count of enabled schedules
      const q = query(schedulesRef, where('petId', '==', petId));
      const querySnapshot = await getDocs(q);

      // The new state is `!currentValue`. We count how many schedules will be enabled *after* this toggle.
      const newEnabledCount = querySnapshot.docs.filter(doc => {
        return doc.id === id ? !currentValue : doc.data().isEnabled;
      }).length;

      const newPortion = newEnabledCount > 0 ? Math.round(recommendedPortion / newEnabledCount) : 0;

      // 3. Update all schedules for this pet
      querySnapshot.forEach(scheduleDoc => {
        const isCurrentDoc = scheduleDoc.id === id;
        const willBeEnabled = isCurrentDoc ? !currentValue : scheduleDoc.data().isEnabled;
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