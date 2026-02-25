import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, doc, getDocs, onSnapshot, query, Unsubscribe, updateDoc, where, writeBatch } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SectionList,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import { recalculatePortionsForPet } from '../../utils/portionLogic';

// Modern Color Palette
const COLORS = {
  primary: '#6D4C41',
  secondary: '#8D6E63',
  accent: '#FFB300',
  background: '#FAFAFA',
  cardBg: '#FFFFFF',
  text: '#2D2D2D',
  subText: '#757575',
  border: '#EEEEEE',
  danger: '#E53935',
  selection: '#007AFF',
  success: '#43A047',
};

interface Schedule {
  id: string;
  name: string;
  time: string;
  petId: string;
  petName: string;
  bowlNumber: number;
  isEnabled: boolean;
  repeatDays: string[];
  skippedDays?: string[];
  portionGrams?: number;
}

interface ScheduleRow extends Schedule {
  dayCode: string;
}

const DAY_MAPPING = [
  { full: 'Monday', code: 'M' },
  { full: 'Tuesday', code: 'T' },
  { full: 'Wednesday', code: 'W' },
  { full: 'Thursday', code: 'R' },
  { full: 'Friday', code: 'F' },
  { full: 'Saturday', code: 'S' },
  { full: 'Sunday', code: 'U' },
];

const formatScheduleTime = (timeString: string): string => {
  if (!timeString) return '--:--';
  const [hours, minutes] = timeString.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return '--:--';
  const date = new Date();
  date.setHours(hours, minutes);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

export default function SchedulesScreen() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const [activeFilter, setActiveFilter] = useState('All');
  const [feederId, setFeederId] = useState<string | null>(null);

  const [isSelectionMode, setSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let unsubscribe: Unsubscribe = () => { };

    const fetch = async () => {
      try {
        const feedersRef = collection(db, 'feeders');
        const qFeeder = query(feedersRef, where('owner_uid', '==', user.uid));
        const snap = await getDocs(qFeeder);
        if (!snap.empty) {
          const currentFeederId = snap.docs[0].id;
          setFeederId(currentFeederId);
          unsubscribe = onSnapshot(collection(db, 'feeders', currentFeederId, 'schedules'), (s) => {
            const data = s.docs.map(d => ({
              id: d.id,
              ...d.data(),
              isEnabled: d.data().isEnabled !== false,
              skippedDays: d.data().skippedDays || []
            } as Schedule));
            setSchedules(data);
            setLoading(false);
          });
        } else {
          setLoading(false);
        }
      } catch (e) { console.error(e); setLoading(false); }
    };
    fetch();
    return () => unsubscribe();
  }, [user]);

  const petFilters = ['All', ...Array.from(new Set(schedules.map(s => s.petName).filter(Boolean)))];

  // ---------------------------------------------------------
  // FIXED FUNCTION: toggleScheduleDay
  // ---------------------------------------------------------
  const toggleScheduleDay = async (targetId: string, dayCode: string, targetPetId: string) => {
    if (!feederId || !targetPetId) return;

    // 1. Get LATEST state from the live list
    const currentSchedule = schedules.find(s => s.id === targetId);
    if (!currentSchedule) return;

    const currentSkips = currentSchedule.skippedDays || [];
    const isDayCurrentlyActive = currentSchedule.isEnabled && !currentSkips.includes(dayCode);
    const newDayState = !isDayCurrentlyActive; // Logic flip

    // 2. Calculate new Skip List
    let newSkips;
    if (newDayState) {
        // Turning ON: Remove from skip list
        newSkips = currentSkips.filter(d => d !== dayCode);
    } else {
        // Turning OFF: Add to skip list (Unique)
        newSkips = Array.from(new Set([...currentSkips, dayCode]));
    }

    // 3. Optimistic UI Update (Immediate visual feedback)
    setSchedules(prev => prev.map(s => 
        s.id === targetId 
            ? { ...s, skippedDays: newSkips, isEnabled: true } 
            : s
    ));

    try {
      // 4. DIRECT DB UPDATE (The Fix)
      // We force update the skippedDays first to ensure the switch stays OFF
      const scheduleRef = doc(db, 'feeders', feederId, 'schedules', targetId);
      await updateDoc(scheduleRef, {
          skippedDays: newSkips,
          isEnabled: true // Ensure master switch is true so individual days work
      });

      // 5. THEN recalculate portions
      // This will update the grams in the background
      await recalculatePortionsForPet(feederId, targetPetId);

    } catch (error) {
      console.error("Toggle error:", error);
      // Revert UI if DB write fails
      setSchedules(prev => prev.map(s => s.id === targetId ? currentSchedule : s));
      Alert.alert("Error", "Failed to update schedule.");
    }
  };

  const toggleSelection = (id: string, dayCode: string) => {
    const key = `${id}_${dayCode}`;
    setSelectedKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) newSet.delete(key);
      else newSet.add(key);
      return newSet;
    });
  };

  const handleBulkDelete = () => {
    if (selectedKeys.size === 0) return;
    Alert.alert(
      "Delete Selected?",
      `This will remove ${selectedKeys.size} schedule items.`,
      [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: performBulkDelete }]
    );
  };

  const performBulkDelete = async () => {
    if (!feederId) return;
    setLoading(true);
    try {
      const deletions = new Map<string, string[]>();
      selectedKeys.forEach(key => {
        const [id, dayCode] = key.split('_');
        if (!deletions.has(id)) deletions.set(id, []);
        deletions.get(id)?.push(dayCode);
      });

      const affectedPetIds = new Set<string>();
      const batch = writeBatch(db);

      for (const [id, daysToRemove] of deletions.entries()) {
        const schedule = schedules.find(s => s.id === id);
        if (!schedule) continue;
        affectedPetIds.add(schedule.petId);
        const newDays = (schedule.repeatDays || []).filter(d => !daysToRemove.includes(d));
        const ref = doc(db, 'feeders', feederId, 'schedules', id);

        if (newDays.length === 0) batch.delete(ref);
        else batch.update(ref, { repeatDays: newDays });
      }
      await batch.commit();
      for (const petId of Array.from(affectedPetIds)) await recalculatePortionsForPet(feederId, petId);

      setSelectionMode(false);
      setSelectedKeys(new Set());
    } catch (error) {
      Alert.alert("Error", "Bulk delete failed.");
    } finally {
      setLoading(false);
    }
  };

  const sections = DAY_MAPPING.map(day => {
    const filtered = schedules.filter(s => activeFilter === 'All' || s.petName === activeFilter);
    const daysSchedules = filtered.filter(s => s.repeatDays?.includes(day.code));
    daysSchedules.sort((a, b) => a.time.localeCompare(b.time));
    return { title: day.full, data: daysSchedules.map(s => ({ ...s, dayCode: day.code })) };
  }).filter(s => s.data.length > 0);

  const renderItem = ({ item }: { item: ScheduleRow }) => {
    // Logic: Active if schedule is Enabled AND Day is NOT in skipped list
    const isDayActive = item.isEnabled && !(item.skippedDays || []).includes(item.dayCode);
    
    const selectionKey = `${item.id}_${item.dayCode}`;
    const isSelected = selectedKeys.has(selectionKey);

    return (
      <TouchableOpacity
        style={[
          styles.card,
          isSelectionMode && styles.cardSelectionMode,
          isSelectionMode && isSelected && styles.cardSelected
        ]}
        onPress={() => isSelectionMode ? toggleSelection(item.id, item.dayCode) : router.push({ pathname: "/schedule/[id]", params: { id: item.id, clickedDay: item.dayCode } })}
        activeOpacity={0.8}
        disabled={isSelectionMode && !isSelectionMode} 
      >
        <View style={styles.cardContent}>
          {isSelectionMode && (
            <View style={styles.selectionCheck}>
              <Ionicons name={isSelected ? "checkmark-circle" : "ellipse-outline"} size={24} color={isSelected ? COLORS.selection : "#CCC"} />
            </View>
          )}

          <View style={styles.timeContainer}>
            <Text style={[styles.timeText, (!isDayActive && !isSelectionMode) && styles.textDisabled]}>
              {formatScheduleTime(item.time)}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.scheduleName}>{item.name}</Text>
              {activeFilter === 'All' && (
                <>
                  <Text style={styles.dotSeparator}>•</Text>
                  <Text style={styles.petName}>{item.petName}</Text>
                </>
              )}
            </View>
          </View>

          {!isSelectionMode && (
            <View style={styles.actionContainer}>
              <View style={[styles.gramBadge, !isDayActive && styles.gramBadgeDisabled]}>
                <Text style={[styles.gramText, !isDayActive && styles.gramTextDisabled]}>
                  {isDayActive ? `${item.portionGrams || 0}g` : 'OFF'}
                </Text>
              </View>
              <Switch
                trackColor={{ false: '#E0E0E0', true: COLORS.accent }}
                thumbColor={'#FFF'}
                ios_backgroundColor="#E0E0E0"
                // Pass IDs to function to prevent stale closures
                onValueChange={() => toggleScheduleDay(item.id, item.dayCode, item.petId)}
                value={isDayActive}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Feeding Schedule</Text>
        <TouchableOpacity style={styles.selectBtn} onPress={() => { setSelectionMode(!isSelectionMode); setSelectedKeys(new Set()); }}>
          <Text style={styles.selectBtnText}>{isSelectionMode ? 'Done' : 'Select'}</Text>
        </TouchableOpacity>
      </View>

      {!isSelectionMode && (
        <View style={styles.filterContainer}>
          <SectionList
            horizontal
            sections={[{ title: 'Filters', data: petFilters }]}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.filterPill, activeFilter === item && styles.filterPillActive]}
                onPress={() => setActiveFilter(item)}
              >
                <Text style={[styles.filterText, activeFilter === item && styles.filterTextActive]}>{item}</Text>
              </TouchableOpacity>
            )}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16 }}
          />
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <SectionList
          sections={sections}
          renderItem={renderItem}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{title}</Text>
            </View>
          )}
          keyExtractor={(item, index) => item.id + item.dayCode + index}
          contentContainerStyle={[styles.listContent, isSelectionMode && { paddingBottom: 100 }]}
          stickySectionHeadersEnabled={false} 
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="clock-outline" size={64} color="#DDD" />
              <Text style={styles.emptyText}>No routines yet</Text>
              <Text style={styles.emptySub}>Tap + to start planning meals</Text>
            </View>
          }
        />
      )}

      {!isSelectionMode && (
        <TouchableOpacity style={styles.fab} onPress={() => router.push({ pathname: "/schedule/[id]", params: { id: 'new' } })}>
          <MaterialCommunityIcons name="plus" size={32} color="#FFF" />
        </TouchableOpacity>
      )}

      {isSelectionMode && (
        <View style={styles.bulkBar}>
          <TouchableOpacity
            style={[styles.bulkBtn, selectedKeys.size === 0 && styles.bulkBtnDisabled]}
            onPress={handleBulkDelete}
            disabled={selectedKeys.size === 0}
          >
            <Text style={styles.bulkBtnText}>
              Delete {selectedKeys.size > 0 ? `(${selectedKeys.size})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, backgroundColor: COLORS.background },
  headerTitle: { fontSize: 28, fontWeight: '800', color: COLORS.primary, letterSpacing: -0.5 },
  selectBtn: { padding: 8 },
  selectBtnText: { fontSize: 16, fontWeight: '600', color: COLORS.secondary },

  filterContainer: { height: 50, marginBottom: 8 },
  filterPill: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 24, backgroundColor: COLORS.cardBg, marginRight: 8, borderWidth: 1, borderColor: COLORS.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  filterPillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: 14, fontWeight: '600', color: COLORS.subText },
  filterTextActive: { color: '#FFF' },

  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  sectionHeader: { marginTop: 24, marginBottom: 12, paddingHorizontal: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: 1.2 },

  card: { backgroundColor: COLORS.cardBg, borderRadius: 20, marginBottom: 12, padding: 18, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: 'transparent' },
  cardSelectionMode: { transform: [{ scale: 0.98 }] },
  cardSelected: { borderColor: COLORS.selection, backgroundColor: '#F0F8FF' },

  cardContent: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectionCheck: { marginRight: 16 },

  timeContainer: { flex: 1 },
  timeText: { fontSize: 26, fontWeight: '700', color: COLORS.text, letterSpacing: -1 },
  textDisabled: { color: '#BDBDBD' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  scheduleName: { fontSize: 15, color: COLORS.subText, fontWeight: '500' },
  dotSeparator: { marginHorizontal: 6, color: '#CCC' },
  petName: { fontSize: 15, color: COLORS.accent, fontWeight: '600' },

  actionContainer: { alignItems: 'flex-end', gap: 6 },
  gramBadge: { backgroundColor: '#FFF8E1', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  gramBadgeDisabled: { backgroundColor: '#F5F5F5' },
  gramText: { fontSize: 13, fontWeight: '800', color: COLORS.accent },
  gramTextDisabled: { color: '#BDBDBD' },

  fab: { position: 'absolute', right: 20, bottom: 30, width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },

  bulkBar: { position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: COLORS.cardBg, borderRadius: 24, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  bulkBtn: { backgroundColor: '#FFEBEE', borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  bulkBtnDisabled: { backgroundColor: '#F5F5F5' },
  bulkBtnText: { color: COLORS.danger, fontSize: 16, fontWeight: '700' },

  emptyState: { alignItems: 'center', marginTop: 80, opacity: 0.6 },
  emptyText: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginTop: 16 },
  emptySub: { fontSize: 14, color: COLORS.subText, marginTop: 4 },
});