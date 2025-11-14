// app/pet/[id].tsx
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, Timestamp, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
// --- NEW: Import storage ---
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { getDatabase, off, onValue, ref, set as rtdbSet, serverTimestamp } from 'firebase/database';
import { db, storage } from '../../firebaseConfig';
import { recalculatePortionsForPet } from '../../utils/portionLogic';

// --- NEW: Image Picker & Storage Imports ---
import * as ImagePicker from 'expo-image-picker';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
// --- END NEW ---

const COLORS = {
  primary: '#8C6E63',
  accent: '#FFC107',
  background: '#F5F5F5',
  text: '#333333',
  lightGray: '#E0E0E0',
  white: '#FFFFFF',
  danger: '#D32F2F',
};

// --- DogBreed Interface (Unchanged) ---
interface DogBreed {
  id: string; 
  name: string;
  size: 'Small' | 'Medium' | 'Large';
  defaultWeight: number;
  defaultKcal: number;
  defaultActivity: 'Low' | 'Normal' | 'High';
  defaultNeuterStatus: 'Neutered/Spayed' | 'Intact';
}

interface SegmentedControlProps {
  options: string[];
  selected: string;
  onSelect: (option: string) => void;
}

const SegmentedControl: React.FC<SegmentedControlProps> = ({ options, selected, onSelect }) => (
  <View style={styles.segmentedControlContainer}>
    {options.map((option) => (
      <TouchableOpacity
        key={option}
        style={[
          styles.segment,
          selected === option ? styles.segmentActive : {},
        ]}
        onPress={() => onSelect(option)}>
        <Text style={[styles.segmentText, selected === option ? styles.segmentTextActive : {}]}>
          {option}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
);

export default function PetProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const isEditing = id !== 'new';

  // --- Pet Data States ---
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [kcal, setKcal] = useState('');
  const [neuterStatus, setNeuterStatus] = useState('Neutered/Spayed');
  const [activityLevel, setActivityLevel] = useState('Normal');
  const [recommendedPortion, setRecommendedPortion] = useState(0);
  const [feederId, setFeederId] = useState<string | null>(null);

  // --- Birthday States ---
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [ageInMonths, setAgeInMonths] = useState<number | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // --- Preset States ---
  const [breeds, setBreeds] = useState<DogBreed[]>([]);
  const [breedsLoading, setBreedsLoading] = useState(true);
  const [selectedBreedId, setSelectedBreedId] = useState<string | null>(null);
  
  // --- RFID/Bowl States ---
  const [rfidTagId, setRfidTagId] = useState('');
  const [assignedBowl, setAssignedBowl] = useState<number>(1);
  const [isScanning, setIsScanning] = useState(false);
  const [scanTargetBowl, setScanTargetBowl] = useState<number | null>(null);
  
  // --- NEW: Image States ---
  const [photoUrl, setPhotoUrl] = useState<string | null>(null); // From Firebase
  const [localImageUri, setLocalImageUri] = useState<string | null>(null); // Picked
  // --- END NEW ---
  
  // --- Loading State ---
  const [isLoading, setIsLoading] = useState(false); // Covers all loading
  
  // Fetch Feeder ID (Unchanged)
  useEffect(() => {
    const fetchFeederId = async () => {
      if (!user) {
        Alert.alert('Error', 'You must be logged in to manage pets.');
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

  // --- MODIFIED: Fetch Pet Data (loads photoUrl) ---
  useEffect(() => {
    const fetchPetData = async () => {
      if (isEditing && id && feederId) {
        setIsLoading(true);
        const petDocRef = doc(db, 'feeders', feederId, 'pets', id);
        const docSnap = await getDoc(petDocRef);
        if (docSnap.exists()) {
          const petData = docSnap.data();
          setName(petData.name || '');
          if (petData.birthday) {
            setBirthday(petData.birthday.toDate ? petData.birthday.toDate() : new Date(petData.birthday));
          }
          setWeight(petData.weight ? petData.weight.toString() : '');
          setKcal(petData.kcal ? petData.kcal.toString() : '');
          setNeuterStatus(petData.neuterStatus || 'Neutered/Spayed');
          setActivityLevel(petData.activityLevel || 'Normal');
          setRecommendedPortion(petData.recommendedPortion || 0);
          setRfidTagId(petData.rfidTagId || '');
          setAssignedBowl(petData.bowlNumber || 1);
          setPhotoUrl(petData.photoUrl || null); // --- NEW: Load Photo URL
        }
        setIsLoading(false);
      }
    };
    fetchPetData();
  }, [id, isEditing, feederId]);

  // Fetch Dog Breeds (Unchanged)
  useEffect(() => {
    const fetchBreeds = async () => {
      try {
        const breedsCollectionRef = collection(db, 'dogBreeds');
        const q = query(breedsCollectionRef, orderBy('name')); 
        const querySnapshot = await getDocs(q);
        const breedsData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as DogBreed));
        setBreeds(breedsData);
      } catch (error) {
        console.error("Error fetching breeds:", error);
        Alert.alert("Error", "Could not load dog breeds.");
      } finally {
        setBreedsLoading(false);
      }
    };
    fetchBreeds();
  }, []);

  // Apply Preset (Unchanged)
  useEffect(() => {
    if (!selectedBreedId || isEditing || breeds.length === 0) return; 
    const preset = breeds.find(b => b.id === selectedBreedId);
    if (preset) {
      setWeight(preset.defaultWeight.toString());
      setKcal(preset.defaultKcal.toString());
      setActivityLevel(preset.defaultActivity);
      setNeuterStatus(preset.defaultNeuterStatus);
    }
  }, [selectedBreedId, isEditing, breeds]);
  
  // Calculate ageInMonths (Unchanged)
  useEffect(() => {
    if (birthday) {
      const today = new Date();
      const birthDate = new Date(birthday);
      let months = (today.getFullYear() - birthDate.getFullYear()) * 12;
      months -= birthDate.getMonth();
      months += today.getMonth();
      if (today.getDate() < birthDate.getDate()) {
        months--;
      }
      setAgeInMonths(months <= 0 ? 0 : months);
    } else {
      setAgeInMonths(null);
    }
  }, [birthday]);

  // RTDB Listener (Unchanged)
  useEffect(() => {
    if (!isScanning || !feederId || scanTargetBowl === null) return;
    const rtdb = getDatabase();
    const commandPath = `commands/${feederId}`;
    const scanRef = ref(rtdb, `scan_pairing/${feederId}/bowl_${scanTargetBowl}`);
    const scanTimeout = setTimeout(() => {
      setIsScanning(false);
      setScanTargetBowl(null);
      Alert.alert('Scan Timed Out', 'No tag was detected in 30 seconds.');
      rtdbSet(ref(rtdb, commandPath), { command: `cancel_scan_bowl_${scanTargetBowl}`, timestamp: serverTimestamp() });
    }, 30500); 
    const onTagScanned = (snapshot: any) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        if (data.tagId) {
          clearTimeout(scanTimeout);
          setRfidTagId(data.tagId); 
          setIsScanning(false);
          setScanTargetBowl(null); 
          Alert.alert('Tag Scanned!', `Tag ID: ${data.tagId} has been assigned.`);
          rtdbSet(scanRef, null);
        }
      }
    };
    onValue(scanRef, onTagScanned);
    return () => {
      off(scanRef, 'value', onTagScanned);
      clearTimeout(scanTimeout);
      if (isScanning && feederId && scanTargetBowl) {
        rtdbSet(ref(rtdb, commandPath), { command: `cancel_scan_bowl_${scanTargetBowl}`, timestamp: serverTimestamp() });
      }
    };
  }, [isScanning, feederId, scanTargetBowl]);

  // Calculation Logic (Unchanged)
  useEffect(() => {
    const calculatePortion = () => {
      const weightKg = parseFloat(weight);
      const foodKcal = parseFloat(kcal);
      if (isNaN(weightKg) || weightKg <= 0 || isNaN(foodKcal) || foodKcal <= 0 || ageInMonths === null || ageInMonths < 0) {
        setRecommendedPortion(0);
        return;
      }
      const rer = 70 * Math.pow(weightKg, 0.75);
      let merFactor;
      if (ageInMonths < 4) merFactor = 3.0;
      else if (ageInMonths < 12) merFactor = 2.0;
      else {
        merFactor = 1.6;
        if (neuterStatus === 'Neutered/Spayed') {
          if (activityLevel === 'Low') merFactor = 1.2;
          if (activityLevel === 'High') merFactor = 1.8;
        } else {
          if (activityLevel === 'Low') merFactor = 1.4;
          if (activityLevel === 'Normal') merFactor = 1.8;
          if (activityLevel === 'High') merFactor = 3.0; 
        }
      }
      const mer = rer * merFactor;
      const dailyGrams = (mer / foodKcal) * 100;
      setRecommendedPortion(Math.round(dailyGrams));
    };
    calculatePortion();
  }, [weight, kcal, neuterStatus, activityLevel, ageInMonths]);

  // Scan Handler (Unchanged)
  const handleScanTag = async () => {
    if (!feederId) {
      Alert.alert('Error', 'Feeder not found. Cannot start scan.');
      return;
    }
    setScanTargetBowl(assignedBowl); 
    setIsScanning(true);
    Alert.alert(
      `Scanning for Bowl ${assignedBowl}...`,
      "Please scan your pet's tag near the correct reader now.",
      [{ text: 'Cancel', onPress: () => { setIsScanning(false); setScanTargetBowl(null); }, style: 'cancel' }],
      { cancelable: false } 
    );
    try {
      const rtdb = getDatabase();
      await rtdbSet(ref(rtdb, `scan_pairing/${feederId}/bowl_${assignedBowl}`), null);
      const commandPath = `commands/${feederId}`;
      const command = `scan_tag_bowl_${assignedBowl}`;
      await rtdbSet(ref(rtdb, commandPath), { command: command, timestamp: serverTimestamp() });
    } catch (error) {
      console.error(`Error sending ${`scan_tag_bowl_${assignedBowl}`} command:`, error);
      Alert.alert('Error', 'Could not send scan command to feeder.');
      setIsScanning(false);
      setScanTargetBowl(null);
    }
  };
 
  // --- NEW: Image Picker Handler ---
  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to make this work!');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1], // Square aspect ratio
      quality: 0.7, // Compress image
    });

    if (!result.canceled) {
      setLocalImageUri(result.assets[0].uri);
    }
  };
  // --- END NEW ---

  // --- NEW: Image Upload Utility ---
  const uploadImage = async (uri: string, petId: string): Promise<string | null> => {
    if (!feederId) {
      console.error("Feeder ID is null, cannot upload image.");
      return null;
    }
    
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const imageRef = storageRef(storage, `pet_photos/${feederId}/${petId}.jpg`);
      
      const snapshot = await uploadBytes(imageRef, blob);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error("Error uploading image:", error);
      Alert.alert('Upload Failed', 'Could not upload pet photo.');
      return null;
    }
  };
  // --- END NEW ---

  // --- MODIFIED: handleSave (with image upload) ---
  const handleSave = async () => {
    if (!name || !birthday || !weight || !kcal) {
      Alert.alert('Missing Information', 'Please fill out Name, Birthday, Weight, and Kcal fields.');
      return;
    }
    if (!rfidTagId) {
      Alert.alert('Missing Information', 'Please scan and assign an RFID tag to this pet.');
      return;
    }
    if (!feederId) {
      Alert.alert('Error', 'Feeder ID not found. Cannot save pet.');
      return;
    }
   
    setIsLoading(true); // Show loading spinner
    
    // This object holds all data *except* the photo URL
    const petData = {
      name,
      birthday: Timestamp.fromDate(birthday), 
      weight: parseFloat(weight),
      kcal: parseInt(kcal, 10),
      neuterStatus,
      activityLevel,
      recommendedPortion,
      rfidTagId: rfidTagId,
      bowlNumber: assignedBowl,
      breed: selectedBreedId ? breeds.find(b => b.id === selectedBreedId)?.name : 'Unknown',
    };

    try {
      if (isEditing && id) {
        // --- EDITING EXISTING PET ---
        let finalPhotoUrl = photoUrl; // Start with the existing URL
        
        // If a new local image was picked, upload it
        if (localImageUri) {
          const uploadedUrl = await uploadImage(localImageUri, id);
          if (uploadedUrl) {
            finalPhotoUrl = uploadedUrl;
          }
        }
        
        // Save all data (including new or old photo URL)
        const petDocRef = doc(db, 'feeders', feederId, 'pets', id);
        await updateDoc(petDocRef, { ...petData, photoUrl: finalPhotoUrl });
        
        await recalculatePortionsForPet(id);
        Alert.alert('Pet Updated!', `Profile for ${name} has been updated.`);
        
      } else {
        // --- CREATING NEW PET ---
        // 1. Create pet doc *without* photo URL
        const petsCollectionRef = collection(db, 'feeders', feederId, 'pets');
        const newPetRef = await addDoc(petsCollectionRef, petData);
        
        // 2. If image was picked, upload it using the new doc ID
        if (localImageUri) {
          const finalPhotoUrl = await uploadImage(localImageUri, newPetRef.id);
          
          // 3. Update the doc with the new photo URL
          if (finalPhotoUrl) {
            await updateDoc(newPetRef, { photoUrl: finalPhotoUrl });
          }
        }
        
        await recalculatePortionsForPet(newPetRef.id);
        Alert.alert('Pet Saved!', `Profile for ${name} has been created.`);
      }
      
      router.back();
      
    } catch (error) {
      console.error("Error saving pet: ", error);
      Alert.alert('Error', 'There was a problem saving the pet profile.');
    } finally {
      setIsLoading(false); // Hide loading spinner
    }
  };
  // --- END MODIFIED ---

  // Delete Handler (Unchanged)
  const handleDelete = () => {
    Alert.alert(
      'Delete Pet',
      `Are you sure you want to delete ${name}'s profile?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (isEditing && id && feederId) {
              setIsLoading(true);
              try {
                // TODO: Delete photo from Storage
                const petDocRef = doc(db, 'feeders', feederId, 'pets', id);
                await deleteDoc(petDocRef);
                Alert.alert('Pet Deleted', `${name}'s profile has been removed.`);
                router.back();
              } catch (error) {
                console.error("Error deleting pet: ", error);
                Alert.alert('Error', 'There was a problem deleting the pet profile.');
              } finally {
                setIsLoading(false);
              }
            }
          }
        },
      ]
    );
  };
  
  // Date Picker Handler (Unchanged)
  const onDateChange = (event: any, selectedDate?: Date) => {
    const currentDate = selectedDate || birthday;
    setShowDatePicker(Platform.OS === 'ios');
    if (currentDate) {
      setBirthday(currentDate);
    }
  };
 
  // --- MODIFIED: Loading check (handles all states) ---
  if (isLoading || (breedsLoading && !isEditing)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 10, color: COLORS.text }}>
          {isLoading ? "Saving Pet..." : (breedsLoading ? "Loading Breeds..." : "Loading Pet...")}
        </Text>
      </View>
    );
  }

  // --- JSX ---
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={28} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? 'Edit Pet Profile' : 'Add New Pet'}</Text>
        <View style={{ width: 28 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* --- MODIFIED: Photo Container --- */}
        <TouchableOpacity style={styles.photoContainer} onPress={handlePickImage}>
          { (localImageUri || photoUrl) ? (
            <Image 
              source={{ uri: localImageUri || photoUrl! }} 
              style={styles.petImage} 
            />
          ) : (
            <MaterialCommunityIcons name="plus" size={48} color={COLORS.lightGray} />
          )}
        </TouchableOpacity>
        {/* --- END MODIFIED --- */}

        {/* Breed Preset Picker (Unchanged) */}
        {!isEditing && (
          <>
            <Text style={styles.label}>Start with a Breed Preset (Optional)</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedBreedId}
                onValueChange={(itemValue) => setSelectedBreedId(itemValue)}
                style={styles.picker}
                enabled={!isEditing && !breedsLoading}
              >
                <Picker.Item label="-- Select a breed --" value={null} />
                {breeds.map((breed) => (
                  <Picker.Item key={breed.id} label={`${breed.name} (${breed.size})`} value={breed.id} />
                ))}
              </Picker>
            </View>
          </>
        )}

        <Text style={styles.label}>{"Pet's Name"}</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g., Buddy" />

        <View style={styles.row}>
          <View style={styles.column}>
            <Text style={styles.label}>Birthday</Text>
            <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.input}>
              <Text style={birthday ? styles.dateText : styles.datePlaceholder}>
                {birthday ? birthday.toLocaleDateString() : "Select date..."}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.column}>
            <Text style={styles.label}>Weight (kg)</Text>
            <TextInput style={styles.input} value={weight} onChangeText={setWeight} placeholder="e.g., 15" keyboardType="numeric" />
          </View>
        </View>

        {/* --- MODIFIED: DatePicker (themed) --- */}
        {showDatePicker && (
          <DateTimePicker
            testID="dateTimePicker"
            value={birthday || new Date()}
            mode="date"
            display="default"
            onChange={onDateChange}
            maximumDate={new Date()}
            accentColor={Platform.OS === 'ios' ? COLORS.primary : undefined} // Theme for iOS
          />
        )}
        {/* --- END MODIFIED --- */}

        <Text style={styles.label}>Food Calories (kcal/100g)</Text>
        <TextInput 
          style={styles.input} 
          value={kcal} 
          onChangeText={setKcal} 
          placeholder="Check your dog food bag" 
          keyboardType="numeric" 
        />

        <Text style={styles.label}>Sex / Neuter Status</Text>
        <SegmentedControl 
          options={['Neutered/Spayed', 'Intact']} 
          selected={neuterStatus} 
          onSelect={setNeuterStatus} 
        />
       
        <Text style={styles.label}>Activity Level</Text>
        <SegmentedControl 
          options={['Low', 'Normal', 'High']} 
          selected={activityLevel} 
          onSelect={setActivityLevel} 
        />

        {/* RFID/Bowl Section (Unchanged) */}
        <Text style={styles.label}>Assign to Bowl</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={assignedBowl}
            onValueChange={(itemValue: number) => setAssignedBowl(itemValue)}
            style={styles.picker}
          >
            <Picker.Item label="Bowl 1" value={1} />
            <Picker.Item label="Bowl 2" value={2} />
          </Picker>
        </View>

        <Text style={styles.label}>Assigned RFID Tag</Text>
        <TextInput
          style={[styles.input, styles.disabledInput]}
          value={rfidTagId}
          placeholder="Scan tag below"
          editable={false}
        />
        {/* --- MODIFIED: Scan Button (style points to scanButton) --- */}
        <TouchableOpacity
          style={[styles.button, isScanning ? styles.scanningButton : styles.scanButton]}
          onPress={handleScanTag}
          disabled={isScanning || isLoading} // Disable if scanning or saving
        >
          {isScanning ? (
            <>
              <ActivityIndicator color={COLORS.text} style={{ marginRight: 10 }} />
              <Text style={styles.saveButtonText}>{`Waiting for Scan (Bowl ${assignedBowl})...`}</Text>
            </>
          ) : (
            <Text style={styles.saveButtonText}>
              {rfidTagId ? `Re-Scan Tag for Bowl ${assignedBowl}` : `Scan Pet Tag for Bowl ${assignedBowl}`}
            </Text>
          )}
        </TouchableOpacity>
        {/* --- END MODIFIED --- */}

        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>Recommended Daily Portion</Text>
          <Text style={styles.resultValue}>{recommendedPortion}g</Text>
          <Text style={styles.resultSubtext}>
            {ageInMonths !== null && ageInMonths < 12 
              ? "Based on puppy growth formula." 
              : "Based on adult maintenance formula."
            }
          </Text>
        </View>

        <TouchableOpacity 
          style={styles.saveButton} 
          onPress={handleSave} 
          disabled={isLoading || isScanning} // Disable if saving or scanning
        >
          <Text style={styles.saveButtonText}>{isEditing ? 'Update Pet' : 'Save Pet'}</Text>
        </TouchableOpacity>
       
        {isEditing && (
          <TouchableOpacity 
            style={styles.deleteButton} 
            onPress={handleDelete}
            disabled={isLoading || isScanning} // Disable if saving or scanning
          >
            <Text style={styles.deleteButtonText}>Delete Pet</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// --- STYLES (Added petImage, updated scanButton) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary },
    scrollContent: { padding: 20, paddingBottom: 40 },
    photoContainer: { width: 120, height: 120, borderRadius: 12, borderWidth: 2, borderColor: COLORS.lightGray, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 24, backgroundColor: COLORS.white, overflow: 'hidden' }, // Added overflow
    // --- NEW: petImage Style ---
    petImage: {
      width: '100%',
      height: '100%',
    },
    // --- END NEW ---
    label: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 8, marginTop: 16 },
    input: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.lightGray, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: COLORS.text, justifyContent: 'center' },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
    column: { flex: 1 },
    segmentedControlContainer: { flexDirection: 'row', backgroundColor: COLORS.lightGray, borderRadius: 12, padding: 4 },
    segment: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
    segmentActive: { backgroundColor: COLORS.white },
    segmentText: { fontWeight: '600', color: '#888' },
    segmentTextActive: { color: COLORS.primary },
    resultCard: { backgroundColor: COLORS.white, borderRadius: 12, padding: 20, alignItems: 'center', marginTop: 24 },
    resultLabel: { fontSize: 16, fontWeight: '600', color: '#666' },
    resultValue: { fontSize: 48, fontWeight: 'bold', color: COLORS.primary, marginVertical: 8 },
    resultSubtext: { fontSize: 12, color: '#aaa', textAlign: 'center' },
    saveButton: { backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 32 },
    saveButtonText: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
    deleteButton: { paddingVertical: 16, alignItems: 'center', marginTop: 16 },
    deleteButtonText: { fontSize: 16, fontWeight: 'bold', color: COLORS.danger },
    pickerContainer: {
        backgroundColor: COLORS.white,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.lightGray,
        overflow: 'hidden',
    },
    picker: {
        width: '100%',
        height: 60,
    },
    disabledInput: {
        backgroundColor: '#eee',
        color: '#888',
        marginTop: 8
    },
    button: {
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
    },
    // --- MODIFIED: scanButton ---
    scanButton: {
        backgroundColor: COLORS.accent, // Changed from primary to accent
        marginTop: 10,
    },
    // --- END MODIFIED ---
    scanningButton: {
        backgroundColor: '#888',
        marginTop: 10,
    },
    datePlaceholder: {
      fontSize: 16,
      color: '#999'
    },
    dateText: {
      fontSize: 16,
      color: COLORS.text
    }
});