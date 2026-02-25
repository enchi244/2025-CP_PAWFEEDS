import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import { recalculatePortionsForPet } from '../../utils/portionLogic';

const COLORS = {
  primary: '#6D4C41',
  secondary: '#8D6E63',
  accent: '#FFB300',
  background: '#FAFAFA',
  card: '#FFFFFF',
  text: '#2D2D2D',
  subText: '#757575',
  border: '#EEEEEE',
  danger: '#D32F2F',
  overlay: 'rgba(0,0,0,0.5)',
};

const DISPLAY_DAYS = ['S', 'M', 'T', 'W', 'TH', 'F', 'S'];
const STORAGE_DAYS = ['U', 'M', 'T', 'W', 'R', 'F', 'S'];

const parseTimeString = (timeString: string | undefined): Date => {
  const now = new Date();
  if (!timeString) return now;
  const [hours, minutes] = timeString.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return now;
  now.setHours(hours, minutes, 0, 0);
  return now;
};

export default function ScheduleProfileScreen() {
  const router = useRouter();
  const { id, clickedDay } = useLocalSearchParams<{ id: string; clickedDay?: string }>();
  const isEditing = id !== 'new';
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [originalRepeatDays, setOriginalRepeatDays] = useState<string[]>([]);
  
  // Custom Addon State
  const [customAddon, setCustomAddon] = useState('');

  const [existingData, setExistingData] = useState<any>(null);
  const [pets, setPets] = useState<{ id: string, name: string, recommendedPortion: number, bowlNumber: number }[]>([]);
  const [selectedPet, setSelectedPet] = useState<{ id: string, name: string, recommendedPortion: number } | null>(null);
  const [selectedBowl, setSelectedBowl] = useState<number | null>(null);

  const [isPetModalVisible, setPetModalVisible] = useState(false);
  const [isBowlModalVisible, setBowlModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [feederId, setFeederId] = useState<string | null>(null);

  const bowls = useMemo(() => [{ id: 1, name: 'Bowl 1 (Left)' }, { id: 2, name: 'Bowl 2 (Right)' }], []);

  useEffect(() => {
    const fetch = async () => {
      if (!user) return;
      try {
        const feedersRef = collection(db, 'feeders');
        const q = query(feedersRef, where('owner_uid', '==', user.uid));
        const snap = await getDocs(q);
        if (snap.empty) { Alert.alert('Error', 'No feeder found.'); return; }

        const fId = snap.docs[0].id;
        setFeederId(fId);

        const petsRef = collection(db, 'feeders', fId, 'pets');
        const petSnap = await getDocs(query(petsRef));
        const petsData = petSnap.docs.map(d => ({ id: d.id, name: d.data().name, recommendedPortion: d.data().recommendedPortion || 0, bowlNumber: d.data().bowlNumber || 1 }));
        setPets(petsData);

        if (isEditing && id) {
          const docSnap = await getDoc(doc(db, 'feeders', fId, 'schedules', id));
          if (docSnap.exists()) {
            const data = docSnap.data();
            setExistingData(data);

            setName(data.name || '');
            setDate(parseTimeString(data.time));
            
            // Load custom grams
            setCustomAddon(data.customAddon ? data.customAddon.toString() : '');

            const dbDays = Array.isArray(data.repeatDays) ? data.repeatDays : [];
            setOriginalRepeatDays(dbDays);

            if (clickedDay && dbDays.includes(clickedDay)) {
              const idx = STORAGE_DAYS.indexOf(clickedDay);
              if (idx !== -1) setSelectedDays([idx]);
            } else {
              setSelectedDays(dbDays.map((l: string) => STORAGE_DAYS.indexOf(l)).filter((i: number) => i !== -1));
            }

            const p = petsData.find(pet => pet.id === data.petId);
            setSelectedPet(p || null);
            setSelectedBowl(data.bowlNumber || null);
          }
        }
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
    };
    fetch();
  }, [id, user]);

  const handleSave = async () => {
    if (!name || !selectedPet || !selectedBowl || selectedDays.length === 0 || !feederId) {
      Alert.alert('Incomplete', 'Please fill all fields and select at least one day.');
      return;
    }
    setIsLoading(true);
    const timeString = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    const daysToCheck = selectedDays.map(index => STORAGE_DAYS[index]);

    try {
      // Conflict Check
      const qConflict = query(collection(db, 'feeders', feederId, 'schedules'), where('time', '==', timeString));
      const conflictSnap = await getDocs(qConflict);
      for (const d of conflictSnap.docs) {
        if (d.id === id) continue;
        const sData = d.data() as any;
        if (sData.repeatDays?.some((day: string) => daysToCheck.includes(day))) {
          if (sData.petId === selectedPet.id) { Alert.alert("Conflict", "Pet already eats then."); setIsLoading(false); return; }
          if (sData.bowlNumber === selectedBowl) { Alert.alert("Conflict", "Bowl is busy then."); setIsLoading(false); return; }
        }
      }

      const data: any = {
        name,
        time: timeString,
        repeatDays: daysToCheck.sort((a, b) => STORAGE_DAYS.indexOf(a) - STORAGE_DAYS.indexOf(b)),
        petId: selectedPet.id,
        petName: selectedPet.name,
        bowlNumber: selectedBowl,
        isEnabled: existingData?.isEnabled ?? true,
        skippedDays: existingData?.skippedDays ?? [],
        // Save customAddon
        customAddon: customAddon ? parseInt(customAddon) : 0,
        portionGrams: existingData?.portionGrams ?? 0, 
      };

      const shouldSplit = isEditing && clickedDay && originalRepeatDays.length > 1 && originalRepeatDays.includes(clickedDay);

      if (shouldSplit) {
        const batch = writeBatch(db);
        const newOriginalDays = originalRepeatDays.filter(d => d !== clickedDay);
        batch.update(doc(db, 'feeders', feederId, 'schedules', id), { repeatDays: newOriginalDays });

        const newRef = doc(collection(db, 'feeders', feederId, 'schedules'));
        // Copy customAddon to split schedule
        const splitData = { ...data, skippedDays: [], isEnabled: true }; 
        batch.set(newRef, splitData);
        await batch.commit();
      } else if (isEditing && id) {
        await updateDoc(doc(db, 'feeders', feederId, 'schedules', id), data);
      } else {
        const newData = { ...data, skippedDays: [], isEnabled: true };
        await addDoc(collection(db, 'feeders', feederId, 'schedules'), newData);
      }

      await recalculatePortionsForPet(feederId, selectedPet.id, selectedPet.recommendedPortion);
      router.back();
    } catch (e) { Alert.alert("Error", "Could not save."); } finally { setIsLoading(false); }
  };

  const handleDelete = () => {
    Alert.alert("Delete", "Remove this schedule?", [
      { text: "Cancel", style: 'cancel' },
      {
        text: "Delete", style: 'destructive', onPress: async () => {
          if (!feederId || !id || !selectedPet) return;
          setIsLoading(true);
          try {
            const days = originalRepeatDays.length > 0 ? originalRepeatDays : selectedDays.map(i => STORAGE_DAYS[i]);
            if (clickedDay && days.length > 1 && days.includes(clickedDay)) {
              await updateDoc(doc(db, 'feeders', feederId, 'schedules', id), { repeatDays: days.filter(d => d !== clickedDay) });
            } else {
              await deleteDoc(doc(db, 'feeders', feederId, 'schedules', id));
            }
            await recalculatePortionsForPet(feederId, selectedPet.id);
            router.back();
          } catch (e) { Alert.alert("Error", "Delete failed"); } finally { setIsLoading(false); }
        }
      }
    ]);
  };

  if (isLoading) return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={28} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? 'Edit Meal' : 'New Meal'}</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        <TouchableOpacity style={styles.heroTime} onPress={() => setShowTimePicker(true)}>
          <Text style={styles.heroTimeText}>
            {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
          </Text>
          <Text style={styles.heroLabel}>Tap to change time</Text>
        </TouchableOpacity>

        {Platform.OS === 'android' && showTimePicker && <DateTimePicker value={date} mode="time" onChange={(e, d) => { setShowTimePicker(false); if (d) setDate(d); }} />}
        {Platform.OS === 'ios' && (
          <Modal visible={showTimePicker} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <DateTimePicker value={date} mode="time" display="spinner" onChange={(e, d) => d && setDate(d)} />
                <TouchableOpacity style={styles.modalBtn} onPress={() => setShowTimePicker(false)}><Text style={styles.modalBtnText}>Done</Text></TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}

        <View style={styles.section}>
          <Text style={styles.label}>Schedule Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Breakfast, Dinner, etc." placeholderTextColor="#AAA" />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Repeats On</Text>
          <View style={styles.dayContainer}>
            {DISPLAY_DAYS.map((d, i) => {
              const isSelected = selectedDays.includes(i);
              return (
                <TouchableOpacity key={i} style={[styles.dayBubble, isSelected && styles.dayBubbleActive]} onPress={() => {
                  if (isSelected) setSelectedDays(p => p.filter(x => x !== i));
                  else setSelectedDays(p => [...p, i]);
                }}>
                  <Text style={[styles.dayText, isSelected && styles.dayTextActive]}>{d}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* --- EXTRA PORTION INPUT --- */}
        <View style={styles.section}>
            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
                <Text style={styles.label}>Extra Portion (Optional)</Text>
                <Text style={{fontSize:12, color:COLORS.accent}}>+ {customAddon || 0}g</Text>
            </View>
            <View style={styles.inputWithUnit}>
                <TextInput 
                    style={[styles.input, {flex:1}]} 
                    value={customAddon} 
                    onChangeText={(t) => setCustomAddon(t.replace(/[^0-9]/g, ''))} // Only numbers
                    placeholder="0" 
                    placeholderTextColor="#AAA" 
                    keyboardType="numeric"
                />
                <Text style={styles.unitText}>grams</Text>
            </View>
            <Text style={styles.helperText}>Added on top of the calculated daily split.</Text>
        </View>

        <View style={styles.rowSection}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.label}>Pet</Text>
            <TouchableOpacity style={styles.selectBox} onPress={() => setPetModalVisible(true)}>
              <Text style={styles.selectText}>{selectedPet?.name || 'Select'}</Text>
              <Ionicons name="chevron-down" size={20} color={COLORS.subText} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.label}>Bowl</Text>
            <TouchableOpacity style={styles.selectBox} onPress={() => setBowlModalVisible(true)}>
              <Text style={styles.selectText}>{selectedBowl ? `Bowl ${selectedBowl}` : 'Select'}</Text>
              <Ionicons name="chevron-down" size={20} color={COLORS.subText} />
            </TouchableOpacity>
          </View>
        </View>

        {isEditing && (
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
            <Text style={styles.deleteText}>Delete Schedule</Text>
          </TouchableOpacity>
        )}

      </ScrollView>

      {[
        { visible: isPetModalVisible, close: () => setPetModalVisible(false), data: pets, onSelect: (i: any) => { setSelectedPet(i); setSelectedBowl(i.bowlNumber); setPetModalVisible(false); } },
        { visible: isBowlModalVisible, close: () => setBowlModalVisible(false), data: bowls, onSelect: (i: any) => { setSelectedBowl(i.id); setBowlModalVisible(false); } }
      ].map((m, idx) => (
        <Modal key={idx} visible={m.visible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.selectionCard}>
              <Text style={styles.modalTitle}>Select Option</Text>
              <FlatList data={m.data} keyExtractor={(item: any) => item.id.toString()} renderItem={({ item }) => (
                <TouchableOpacity style={styles.optionRow} onPress={() => m.onSelect(item)}>
                  <Text style={styles.optionText}>{item.name}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#CCC" />
                </TouchableOpacity>
              )} />
              <TouchableOpacity style={styles.closeModalBtn} onPress={m.close}><Text style={styles.closeText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
      ))}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  backBtn: { padding: 4 },
  saveBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  saveBtnText: { color: '#FFF', fontWeight: '600' },

  content: { padding: 24 },

  heroTime: { alignItems: 'center', marginBottom: 32 },
  heroTimeText: { fontSize: 54, fontWeight: '800', color: COLORS.primary, letterSpacing: -1 },
  heroLabel: { fontSize: 14, color: COLORS.subText, marginTop: -4 },

  section: { marginBottom: 24 },
  rowSection: { flexDirection: 'row', marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.subText, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 },
  input: { backgroundColor: COLORS.card, padding: 16, borderRadius: 16, fontSize: 16, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text },
  
  // Styles for Unit Input
  inputWithUnit: { flexDirection: 'row', alignItems: 'center' },
  unitText: { position: 'absolute', right: 16, color: COLORS.subText, fontSize: 16, fontWeight: '600' },
  helperText: { fontSize: 12, color: COLORS.subText, marginTop: 6, fontStyle: 'italic' },

  dayContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  dayBubble: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  dayBubbleActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dayText: { fontSize: 14, fontWeight: '700', color: COLORS.subText },
  dayTextActive: { color: '#FFF' },

  selectBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.card, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border },
  selectText: { fontSize: 16, color: COLORS.text, fontWeight: '500' },

  deleteBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20, padding: 16 },
  deleteText: { color: COLORS.danger, fontWeight: '600', fontSize: 16, marginLeft: 8 },

  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFF', padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalBtn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 16 },
  modalBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },

  selectionCard: { backgroundColor: '#FFF', padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '60%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: COLORS.text },
  optionRow: { paddingVertical: 16, borderBottomWidth: 1, borderColor: COLORS.border, flexDirection: 'row', justifyContent: 'space-between' },
  optionText: { fontSize: 16, color: COLORS.text },
  closeModalBtn: { marginTop: 24, alignItems: 'center' },
  closeText: { color: COLORS.danger, fontSize: 16, fontWeight: '600' },
});