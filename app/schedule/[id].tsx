import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, deleteDoc, doc, DocumentData, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
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
  useColorScheme,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import { recalculatePortionsForPet } from '../../utils/portionLogic'; // 1. Import our utility function

const COLORS = {
  primary: '#8C6E63',
  accent: '#FFC107',
  background: '#F5F5F5',
  text: '#333333',
  lightGray: '#E0E0E0',
  white: '#FFFFFF',
  danger: '#D32F2F',
  overlay: 'rgba(0, 0, 0, 0.4)',
};

const DISPLAY_DAYS = ['S', 'M', 'T', 'W', 'TH', 'F', 'S']; // For UI Buttons
const STORAGE_DAYS = ['U', 'M', 'T', 'W', 'R', 'F', 'S']; // For Firestore

interface Pet {
  id: string;
  name: string;
  recommendedPortion: number;
  bowlNumber: number; // <-- 1. EDITED INTERFACE
}

const parseTimeString = (timeString: string | undefined): Date => {
  const now = new Date();
  if (!timeString) {
    return now;
  }
  const [hours, minutes] = timeString.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) {
    return now;
  }
  now.setHours(hours, minutes, 0, 0);
  return now;
};

export default function ScheduleProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isEditing = id !== 'new';
  const colorScheme = useColorScheme();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [selectedBowl, setSelectedBowl] = useState<number | null>(null);

  const [isPetModalVisible, setPetModalVisible] = useState(false);
  const [isBowlModalVisible, setBowlModalVisible] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  
  const [feederId, setFeederId] = useState<string | null>(null);

  const bowls = useMemo(() => [{ id: 1, name: 'Bowl 1' }, { id: 2, name: 'Bowl 2' }], []);

  useEffect(() => {
    const fetchFeederId = async () => {
      if (!user) {
        Alert.alert('Error', 'You must be logged in to manage schedules.');
        router.back();
        return;
      }
      const feedersRef = collection(db, 'feeders');
      const q = query(feedersRef, where('owner_uid', '==', user.uid));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setFeederId(querySnapshot.docs[0].id);
      } else {
        Alert.alert('No Feeder Found', 'Could not find a feeder associated with your account.');
        router.back();
      }
    };
    fetchFeederId();
  }, [user, router]);

  useEffect(() => {
    const fetchInitialData = async () => {
      
      if (!feederId) {
        setIsLoading(false); // Ensure loading stops if there's no feederId
        return;
      }

      try {
        const petsCollectionRef = collection(db, 'feeders', feederId, 'pets');
        const q = query(petsCollectionRef);
        const querySnapshot = await getDocs(q);
        const petsData: Pet[] = [];
        
        // --- 2. EDITED FETCH LOGIC ---
        querySnapshot.forEach((doc: DocumentData) => {
          const data = doc.data();
          petsData.push({
            id: doc.id,
            name: data.name,
            recommendedPortion: data.recommendedPortion || 0,
            bowlNumber: data.bowlNumber || 1, // Read the bowl number here
          } as Pet);
        });
        setPets(petsData);

        if (isEditing && id && feederId) { // Only fetch if feederId is available
          const scheduleDocRef = doc(db, 'feeders', feederId, 'schedules', id);
          const docSnap = await getDoc(scheduleDocRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setName(data.name || '');
            setDate(parseTimeString(data.time));

            if (data.repeatDays && Array.isArray(data.repeatDays)) {
                const dayIndices = data.repeatDays.map((dayLetter: string) => STORAGE_DAYS.indexOf(dayLetter)).filter((index: number) => index !== -1);
                setSelectedDays(dayIndices);
            }
            
            // Use the more reliable petId to find the selected pet
            const pet = petsData.find(p => p.id === data.petId);
            setSelectedPet(pet || null);
            setSelectedBowl(data.bowlNumber || null);
          }
        }
      } catch (error) {
        console.error("Failed to fetch initial data:", error);
        Alert.alert("Error", "Could not load data. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchInitialData();
  }, [id, isEditing, feederId]); // Depend on feederId


  const onTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (event.type === 'set' && selectedDate) {
      const newDate = new Date();
      newDate.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
      setDate(newDate);
    }
  };

  const formatTime = (dateToFormat: Date) => {
    if (isNaN(dateToFormat.getTime())) {
      // This case should ideally not be hit with the new logic
      return 'Select a time';
    }
    return dateToFormat.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };
  
  const handleDayPress = (dayIndex: number) => {
    setSelectedDays(prevDays => 
      prevDays.includes(dayIndex) 
        ? prevDays.filter(d => d !== dayIndex) 
        : [...prevDays, dayIndex]
    );
  };

  const handleSave = async () => {
    if (!name || !selectedPet || !selectedBowl) {
      Alert.alert('Missing Information', 'Please provide a name, select a pet, and choose a bowl.');
      return;
    }
    if (!feederId) {
      Alert.alert('Error', 'Feeder ID not found. Cannot save schedule.');
      return;
    }
    
    setIsLoading(true);

    const pad = (num: number) => num.toString().padStart(2, '0');
    const timeString = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

    const scheduleData = {
      name,
      time: timeString,
      repeatDays: selectedDays.sort((a, b) => a - b).map(index => STORAGE_DAYS[index]),
      petId: selectedPet.id,
      petName: selectedPet.name,
      bowlNumber: selectedBowl,
      isEnabled: true,
      portionGrams: 0, // This will be set in the batch update
    };

    try {
      const batch = writeBatch(db);
      const schedulesRef = collection(db, 'feeders', feederId, 'schedules');

      // Get all existing enabled schedules for the pet
      const q = query(schedulesRef, where('petId', '==', selectedPet.id), where('isEnabled', '==', true));
      const querySnapshot = await getDocs(q);
      
      // Filter out the current schedule if we are editing it, as it will be replaced
      const existingSchedules = querySnapshot.docs.filter(doc => doc.id !== id);
      const totalSchedules = existingSchedules.length + 1; // +1 for the one we are saving
      const newPortion = Math.round((selectedPet.recommendedPortion || 0) / totalSchedules);

      // Update all existing schedules with the new portion
      existingSchedules.forEach(scheduleDoc => {
        batch.update(scheduleDoc.ref, { portionGrams: newPortion });
      });

      // Set the new portion for the schedule being saved
      scheduleData.portionGrams = newPortion;

      if (isEditing && id) {
        const scheduleDocRef = doc(db, 'feeders', feederId, 'schedules', id);
        batch.update(scheduleDocRef, scheduleData);
      } else {
        const newScheduleRef = doc(collection(db, 'feeders', feederId, 'schedules'));
        batch.set(newScheduleRef, scheduleData);
      }
      
      await batch.commit();
      Alert.alert(isEditing ? 'Schedule Updated' : 'Schedule Saved', 'All related feeding portions have been recalculated.');
      router.back();
    } catch (error) {
      console.error("Error saving schedule: ", error);
      Alert.alert('Error', 'Could not save the schedule.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Schedule',
      `Are you sure you want to delete the "${name}" schedule?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            if (isEditing && id && selectedPet && feederId) { // Ensure we have a pet and feederId to update
              setIsLoading(true); // <-- This is the line (262) that had the typo
              try {
                const scheduleDocRef = doc(db, 'feeders', feederId, 'schedules', id);
                await deleteDoc(scheduleDocRef);
                
                // 5. Trigger portion recalculation after deleting
                await recalculatePortionsForPet(selectedPet.id);

                Alert.alert('Schedule Deleted');
                router.back();
              } catch (error) {
                console.error("Error deleting schedule: ", error);
                Alert.alert('Error', 'Could not delete the schedule.');
              } finally {
                setIsLoading(false);
              }
            }
          }
        },
      ]
    );
  };

  if (isLoading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={28} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? 'Edit Schedule' : 'Add Schedule'}</Text>
        <View style={{ width: 28 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.label}>Schedule Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g., Breakfast" />

        <Text style={styles.label}>Time</Text>
        <TouchableOpacity style={styles.input} onPress={() => setShowTimePicker(true)}>
            <Text style={styles.timeText}>{formatTime(date)}</Text>
        </TouchableOpacity>
        
        {Platform.OS === 'android' && showTimePicker && (
          <DateTimePicker value={date} mode="time" is24Hour={false} display="default" onChange={onTimeChange} />
        )}

        {Platform.OS === 'ios' && (
            <Modal visible={showTimePicker} transparent={true} animationType="fade">
                <View style={styles.modalBackdrop}>
                    <View style={[styles.modalContent, { backgroundColor: colorScheme === 'dark' ? '#333' : COLORS.background }]}>
                        <DateTimePicker 
                            value={date} 
                            mode="time" 
                            is24Hour={false} 
                            display="spinner" 
                            onChange={onTimeChange} 
                            textColor={colorScheme === 'dark' ? COLORS.white : COLORS.text}
                            themeVariant={colorScheme ?? 'light'}
                        />
                        <TouchableOpacity style={styles.doneButton} onPress={() => setShowTimePicker(false)}>
                            <Text style={styles.doneButtonText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        )}
        
        <Text style={styles.label}>Repeat on Days</Text>
        <View style={styles.daySelectorContainer}>
          {DISPLAY_DAYS.map((day, index) => (
            <TouchableOpacity 
              key={index}
              style={[styles.dayButton, selectedDays.includes(index) && styles.dayButtonSelected]}
              onPress={() => handleDayPress(index)}
            >
              <Text style={[styles.dayButtonText, selectedDays.includes(index) && styles.dayButtonTextSelected]}>{day}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Pet to Feed</Text>
        <TouchableOpacity style={styles.input} onPress={() => setPetModalVisible(true)}>
            <Text style={[styles.timeText, !selectedPet && { color: '#999' }]}>
                {selectedPet ? selectedPet.name : 'Select a pet...'}
            </Text>
        </TouchableOpacity>

        <Text style={styles.label}>Dispense from</Text>
        <TouchableOpacity style={styles.input} onPress={() => setBowlModalVisible(true)}>
            <Text style={[styles.timeText, !selectedBowl && { color: '#999' }]}>
                {selectedBowl ? `Bowl ${selectedBowl}` : 'Select a bowl...'}
            </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>{isEditing ? 'Update Schedule' : 'Save Schedule'}</Text>
        </TouchableOpacity>
        
        {isEditing && (
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Delete Schedule</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal visible={isPetModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalBackdrop}>
            <View style={styles.selectionModalContent}>
                <Text style={styles.modalTitle}>Select a Pet</Text>
                <FlatList
                    data={pets}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        // --- 3. EDITED ONPRESS HANDLER ---
                        <TouchableOpacity style={styles.selectionItem} onPress={() => {
                          setSelectedPet(item);
                          setSelectedBowl(item.bowlNumber); // This auto-selects the bowl
                          setPetModalVisible(false);
                        }}>
                            <Text style={styles.selectionItemText}>{item.name}</Text>
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={styles.emptyListText}>No pets found. Add a pet first!</Text>}
                />
                <TouchableOpacity style={styles.cancelButton} onPress={() => setPetModalVisible(false)}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>

        <Modal visible={isBowlModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalBackdrop}>
            <View style={styles.selectionModalContent}>
                <Text style={styles.modalTitle}>Select a Bowl</Text>
                <FlatList
                    data={bowls}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.selectionItem} onPress={() => { setSelectedBowl(item.id); setBowlModalVisible(false); }}>
                            <Text style={styles.selectionItemText}>{item.name}</Text>
                        </TouchableOpacity>
                    )}
                />
                <TouchableOpacity style={styles.cancelButton} onPress={() => setBowlModalVisible(false)}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary },
    scrollContent: { padding: 20, paddingBottom: 40 },
    label: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 8, marginTop: 16 },
    input: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.lightGray, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: COLORS.text, justifyContent: 'center' },
    timeText: { fontSize: 16, color: COLORS.text },
    daySelectorContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    dayButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.lightGray, justifyContent: 'center', alignItems: 'center' },
    dayButtonSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
    dayButtonText: { fontWeight: 'bold', color: COLORS.primary },
    dayButtonTextSelected: { color: COLORS.white },
    saveButton: { backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 32 },
    saveButtonText: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
    deleteButton: { paddingVertical: 16, alignItems: 'center', marginTop: 16 },
    deleteButtonText: { fontSize: 16, fontWeight: 'bold', color: COLORS.danger },
    modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.overlay },
    modalContent: { backgroundColor: COLORS.background, borderRadius: 20, padding: 20, width: '80%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
    doneButton: { backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 30, marginTop: 20 },
    doneButtonText: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
    selectionModalContent: { backgroundColor: COLORS.white, borderRadius: 12, padding: 20, width: '85%', maxHeight: '60%' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary, marginBottom: 16, textAlign: 'center' },
    selectionItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
    selectionItemText: { fontSize: 18, color: COLORS.text, textAlign: 'center' },
    emptyListText: { textAlign: 'center', color: '#999', marginVertical: 20 },
    cancelButton: { paddingTop: 16, alignItems: 'center', },
    cancelButtonText: { fontSize: 16, fontWeight: '600', color: COLORS.danger },
});