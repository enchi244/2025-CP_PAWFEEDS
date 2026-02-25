import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getDatabase, off, onValue, ref, set as rtdbSet, serverTimestamp } from 'firebase/database';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
  writeBatch
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db, storage } from '../../firebaseConfig';
import { recalculatePortionsForPet } from '../../utils/portionLogic';

// --- Modern Color Palette ---
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
  success: '#43A047',
  warning: '#FF9800', // Orange for warnings
  info: '#1976D2',    // Blue for info
  bowl1: '#29B6F6',
  bowl2: '#EF5350',
};

// --- Interfaces & Helpers ---
interface DogBreed {
  id: string; 
  name: string;
  size: 'Small' | 'Medium' | 'Large';
  defaultWeight: number;
  defaultKcal: number;
  defaultActivity: 'Low' | 'Normal' | 'High';
  defaultNeuterStatus: 'Neutered/Spayed' | 'Intact';
  defaultSnackPortion: number; 
}

interface OccupiedBowl {
  bowlNumber: number;
  petId: string;
  petName: string;
}

const estimatePuppyWeight = (adultWeight: number, months: number): number => {
  let factor = 1.0;
  if (months < 2) factor = 0.20;       
  else if (months < 3) factor = 0.30;  
  else if (months < 4) factor = 0.40; 
  else if (months < 5) factor = 0.50;  
  else if (months < 6) factor = 0.60;
  else if (months < 7) factor = 0.70;
  else if (months < 8) factor = 0.75;
  else if (months < 10) factor = 0.85;
  else if (months < 12) factor = 0.95; 
  return Math.round(adultWeight * factor * 10) / 10;
};

const getAgeString = (birthDate: Date | null) => {
  if (!birthDate) return null;
  const today = new Date();
  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  let days = today.getDate() - birthDate.getDate();

  if (days < 0) { months--; days += new Date(today.getFullYear(), today.getMonth(), 0).getDate(); }
  if (months < 0) { years--; months += 12; }

  if (years < 0) return "Not born yet";
  if (years > 0) return `${years}y ${months}m old`;
  return months === 0 ? `${days}d old` : `${months}m ${days}d old`;
};

export default function PetProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const isEditing = id !== 'new';

  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [kcal, setKcal] = useState('');
  const [neuterStatus, setNeuterStatus] = useState('Neutered/Spayed');
  const [activityLevel, setActivityLevel] = useState('Normal');
  const [recommendedPortion, setRecommendedPortion] = useState(0);
  const [snackPortion, setSnackPortion] = useState(0); 
  const [feederId, setFeederId] = useState<string | null>(null);
  const [idealPortion, setIdealPortion] = useState<number | null>(null);
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [ageInMonths, setAgeInMonths] = useState<number | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [breeds, setBreeds] = useState<DogBreed[]>([]);
  const [selectedBreedId, setSelectedBreedId] = useState<string | null>(null);
  const [isBreedModalVisible, setBreedModalVisible] = useState(false);
  const [breedSearch, setBreedSearch] = useState('');
  const [rfidTagId, setRfidTagId] = useState('');
  const [assignedBowl, setAssignedBowl] = useState<number>(1);
  const [initialBowl, setInitialBowl] = useState<number | null>(null); 
  const [occupiedBowls, setOccupiedBowls] = useState<OccupiedBowl[]>([]); 
  const [isScanning, setIsScanning] = useState(false);
  const [scanTargetBowl, setScanTargetBowl] = useState<number | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null); 
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false); 
  const [breedsLoading, setBreedsLoading] = useState(true);

  // --- Logic Hooks (Same as before) ---
  useEffect(() => {
    const fetchFeederId = async () => {
      if (!user) { router.back(); return; }
      const feedersRef = collection(db, 'feeders');
      const q = query(feedersRef, where('owner_uid', '==', user.uid));
      const snap = await getDocs(q);
      if (!snap.empty) setFeederId(snap.docs[0].id);
      else { Alert.alert('Error', 'No feeder found.'); router.back(); }
    };
    fetchFeederId();
  }, [user]);

  useEffect(() => {
    const fetchOccupied = async () => {
        if (!feederId) return;
        const petsRef = collection(db, 'feeders', feederId, 'pets');
        const snap = await getDocs(petsRef);
        const occupied = snap.docs
            .filter(doc => doc.id !== id)
            .map(doc => ({ petId: doc.id, petName: doc.data().name || 'Unknown', bowlNumber: doc.data().bowlNumber }))
            .filter(item => item.bowlNumber);
        setOccupiedBowls(occupied);
        if (!isEditing) {
            const taken = occupied.map(o => o.bowlNumber);
            const free = [1, 2].find(b => !taken.includes(b));
            if (free) setAssignedBowl(free);
        }
    };
    fetchOccupied();
  }, [feederId, id, isEditing]);

  useEffect(() => {
    const fetchPet = async () => {
      if (isEditing && id && feederId) {
        setIsLoading(true);
        const docSnap = await getDoc(doc(db, 'feeders', feederId, 'pets', id));
        if (docSnap.exists()) {
          const d = docSnap.data();
          setName(d.name || '');
          if (d.birthday) setBirthday(d.birthday.toDate ? d.birthday.toDate() : new Date(d.birthday));
          setWeight(d.weight ? d.weight.toString() : '');
          let k = d.kcal; if (k && k < 2000) k *= 10;
          setKcal(k ? k.toString() : '');
          setNeuterStatus(d.neuterStatus || 'Neutered/Spayed');
          setActivityLevel(d.activityLevel || 'Normal');
          setRecommendedPortion(d.recommendedPortion || 0);
          setSnackPortion(d.snackPortion || 15);
          setRfidTagId(d.rfidTagId || '');
          setAssignedBowl(d.bowlNumber || 1);
          setInitialBowl(d.bowlNumber || 1);
          setPhotoUrl(d.photoUrl || null);
        }
        setIsLoading(false);
      }
    };
    fetchPet();
  }, [id, isEditing, feederId]);

  useEffect(() => {
    const fetchBreeds = async () => {
      try {
        const q = query(collection(db, 'dogBreeds'), orderBy('name'));
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as DogBreed));
        data.sort((a,b) => a.name.localeCompare(b.name));
        setBreeds(data);
      } catch (e) { console.error(e); } 
      finally { setBreedsLoading(false); }
    };
    fetchBreeds();
  }, []);

  useEffect(() => {
    if (!selectedBreedId || isEditing || breeds.length === 0) return;
    const p = breeds.find(b => b.id === selectedBreedId);
    if (p) {
      let pk = p.defaultKcal; if (pk < 2000) pk *= 10;
      setKcal(pk.toString());
      setActivityLevel(p.defaultActivity);
      setNeuterStatus(p.defaultNeuterStatus);
      setSnackPortion(p.defaultSnackPortion || 15);
      if (ageInMonths !== null && ageInMonths < 12) setWeight(estimatePuppyWeight(p.defaultWeight, ageInMonths).toString());
      else setWeight(p.defaultWeight.toString());
    }
  }, [selectedBreedId, ageInMonths, isEditing, breeds]);

  useEffect(() => {
    if (birthday) {
      const today = new Date();
      const b = new Date(birthday);
      let m = (today.getFullYear() - b.getFullYear()) * 12;
      m -= b.getMonth(); m += today.getMonth();
      if (today.getDate() < b.getDate()) m--;
      setAgeInMonths(m <= 0 ? 0 : m);
    } else setAgeInMonths(null);
  }, [birthday]);

  useEffect(() => {
    if (!isScanning || !feederId || scanTargetBowl === null) return;
    const rtdb = getDatabase();
    const cmdPath = `commands/${feederId}`;
    const scanRef = ref(rtdb, `scan_pairing/${feederId}/bowl_${scanTargetBowl}`);
    const timeout = setTimeout(() => {
      setIsScanning(false); setScanTargetBowl(null);
      Alert.alert('Timeout', 'No tag detected.');
      rtdbSet(ref(rtdb, cmdPath), { command: `cancel_scan_bowl_${scanTargetBowl}`, timestamp: serverTimestamp() });
    }, 30500);
    const onTag = (snap: any) => {
      if (snap.exists() && snap.val().tagId) {
        clearTimeout(timeout);
        setRfidTagId(snap.val().tagId);
        setIsScanning(false); setScanTargetBowl(null);
        Alert.alert('Success', 'Tag Assigned!');
        rtdbSet(scanRef, null);
      }
    };
    onValue(scanRef, onTag);
    return () => { off(scanRef, 'value', onTag); clearTimeout(timeout); };
  }, [isScanning, feederId, scanTargetBowl]);

  useEffect(() => {
    const calc = () => {
      const w = parseFloat(weight);
      const k = parseFloat(kcal);
      if (isNaN(w) || w <= 0 || isNaN(k) || k <= 0 || ageInMonths === null) {
        setRecommendedPortion(0); setIdealPortion(null); return;
      }
      const getGrams = (tw: number) => {
        const rer = 70 * Math.pow(tw, 0.75);
        let f = 1.6;
        if (ageInMonths < 4) f = activityLevel === 'Low' ? 2.8 : activityLevel === 'High' ? 3.2 : 3.0;
        else if (ageInMonths < 12) f = activityLevel === 'Low' ? 1.8 : activityLevel === 'High' ? 2.2 : 2.0;
        else if (neuterStatus === 'Neutered/Spayed') f = activityLevel === 'Low' ? 1.4 : activityLevel === 'High' ? 1.8 : 1.6;
        else f = activityLevel === 'Low' ? 1.4 : activityLevel === 'High' ? 3.0 : 1.8;
        return Math.round(((rer * f) / k) * 1000);
      };
      setRecommendedPortion(getGrams(w));
      if (ageInMonths >= 12 && selectedBreedId) {
        const p = breeds.find(b => b.id === selectedBreedId);
        if (p && p.defaultWeight && w > p.defaultWeight * 1.15) setIdealPortion(getGrams(p.defaultWeight));
        else setIdealPortion(null);
      } else setIdealPortion(null);
    };
    calc();
  }, [weight, kcal, neuterStatus, activityLevel, ageInMonths, selectedBreedId, breeds]);

  const handleScanTag = async () => {
    if (!feederId) return;
    setScanTargetBowl(assignedBowl); setIsScanning(true);
    try {
        const rtdb = getDatabase();
        await rtdbSet(ref(rtdb, `scan_pairing/${feederId}/bowl_${assignedBowl}`), null);
        await rtdbSet(ref(rtdb, `commands/${feederId}`), { command: `scan_tag_bowl_${assignedBowl}`, timestamp: serverTimestamp() });
    } catch (e) { setIsScanning(false); }
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed'); return; }
    let res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1,1], quality: 0.5 });
    if (!res.canceled) setLocalImageUri(res.assets[0].uri);
  };

  const uploadImage = async (uri: string, pId: string) => {
    if (!feederId || !user) return null;
    try {
        const blob: any = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.onload = function() { resolve(xhr.response); };
            xhr.onerror = function(e) { reject(new TypeError("Network request failed")); };
            xhr.responseType = "blob";
            xhr.open("GET", uri, true);
            xhr.send(null);
        });
        const path = `pet_photos/${feederId}/${pId}.jpg`;
        const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(storage.app.options.storageBucket!)}/o?name=${encodeURIComponent(path)}`;
        const token = await user.getIdToken();
        const res = await fetch(url, { method: 'POST', body: blob, headers: { 'Content-Type': 'image/jpeg', 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error("Upload failed");
        const json = await res.json();
        return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(storage.app.options.storageBucket!)}/o/${encodeURIComponent(path)}?alt=media&token=${json.downloadTokens}`;
    } catch (e) { console.error(e); return null; }
  };

  const handleSave = async () => {
    if (!name || !birthday || !weight || !kcal) { Alert.alert('Missing Info', 'Fill all fields.'); return; }
    if (!rfidTagId) { Alert.alert('Missing Info', 'Please scan a tag.'); return; }
    if (!feederId) return;
    setIsLoading(true);

    try {
        const petsRef = collection(db, 'feeders', feederId, 'pets');
        const dupQ = query(petsRef, where('rfidTagId', '==', rfidTagId));
        const dupSnap = await getDocs(dupQ);
        if (dupSnap.docs.find(d => d.id !== (isEditing ? id : ''))) {
            Alert.alert('Duplicate Tag', 'Tag already assigned.'); setIsLoading(false); return;
        }

        const batch = writeBatch(db);
        let petRef = (isEditing && id) ? doc(db, 'feeders', feederId, 'pets', id) : doc(collection(db, 'feeders', feederId, 'pets'));
        let finalUrl = photoUrl;
        if (localImageUri) {
            const u = await uploadImage(localImageUri, petRef.id);
            if (u) finalUrl = u;
        }

        const conflict = occupiedBowls.find(p => p.bowlNumber === assignedBowl);
        if (conflict) {
            const target = assignedBowl === 1 ? 2 : 1;
            const conRef = doc(db, 'feeders', feederId, 'pets', conflict.petId);
            batch.update(conRef, { bowlNumber: target });
            const sQ = query(collection(db, 'feeders', feederId, 'schedules'), where('petId', '==', conflict.petId));
            const sSnap = await getDocs(sQ);
            sSnap.forEach(s => batch.update(s.ref, { bowlNumber: target }));
        }

        const data = {
            name, birthday: Timestamp.fromDate(birthday), weight: parseFloat(weight), kcal: parseInt(kcal),
            neuterStatus, activityLevel, recommendedPortion, snackPortion, rfidTagId, bowlNumber: assignedBowl,
            breed: selectedBreedId ? breeds.find(b => b.id === selectedBreedId)?.name : 'Unknown',
            photoUrl: finalUrl
        };

        if (isEditing) {
            batch.update(petRef, data);
            if (initialBowl !== assignedBowl) {
                const sQ = query(collection(db, 'feeders', feederId, 'schedules'), where('petId', '==', id));
                const sSnap = await getDocs(sQ);
                sSnap.forEach(s => batch.update(s.ref, { bowlNumber: assignedBowl }));
            }
        } else {
            batch.set(petRef, data);
        }

        await batch.commit();
        await recalculatePortionsForPet(feederId, petRef.id, recommendedPortion);
        if (conflict) await recalculatePortionsForPet(feederId, conflict.petId);
        
        router.back();
    } catch (e) { Alert.alert('Error', 'Save failed.'); } finally { setIsLoading(false); }
  };

  const handleDelete = () => {
      Alert.alert('Delete', 'Delete profile?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: async () => {
              if (isEditing && id && feederId) {
                  setIsLoading(true);
                  const batch = writeBatch(db);
                  batch.delete(doc(db, 'feeders', feederId, 'pets', id));
                  const sSnap = await getDocs(query(collection(db, 'feeders', feederId, 'schedules'), where('petId', '==', id)));
                  sSnap.forEach(s => batch.delete(s.ref));
                  await batch.commit();
                  router.back();
              }
          }}
      ]);
  };

  if (isLoading || breedsLoading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  const filteredBreeds = breeds.filter(b => b.name.toLowerCase().includes(breedSearch.toLowerCase()));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={28} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? 'Edit Profile' : 'New Pet'}</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={isLoading}>
           <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* AVATAR */}
        <TouchableOpacity style={styles.avatarSection} onPress={handlePickImage}>
           <View style={[styles.avatarCircle, { borderColor: assignedBowl === 1 ? COLORS.bowl1 : COLORS.bowl2 }]}>
             {(localImageUri || photoUrl) ? (
                 <Image source={{ uri: localImageUri || photoUrl! }} style={styles.avatarImg} />
             ) : (
                 <MaterialCommunityIcons name="camera-plus" size={40} color={COLORS.subText} />
             )}
             <View style={[styles.bowlIndicator, { backgroundColor: assignedBowl === 1 ? COLORS.bowl1 : COLORS.bowl2 }]}>
                 <Text style={styles.bowlIndicatorText}>{assignedBowl}</Text>
             </View>
           </View>
        </TouchableOpacity>

        {/* BREED PRESET */}
        {!isEditing && (
            <View style={styles.section}>
                <Text style={styles.label}>Start with Preset</Text>
                <TouchableOpacity style={styles.dropdownBtn} onPress={() => setBreedModalVisible(true)}>
                    <Text style={[styles.dropdownText, !selectedBreedId && { color: '#AAA' }]}>
                        {selectedBreedId ? breeds.find(b => b.id === selectedBreedId)?.name : 'Select Breed'}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color={COLORS.subText} />
                </TouchableOpacity>
            </View>
        )}

        {/* BASIC INFO */}
        <View style={styles.section}>
            <Text style={styles.label}>Basic Info</Text>
            <View style={styles.inputRow}>
                <Ionicons name="paw-outline" size={20} color={COLORS.subText} />
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Pet Name" placeholderTextColor="#AAA" />
            </View>
            <View style={styles.splitRow}>
                <View style={[styles.column, { marginRight: 8 }]}>
                    <View style={styles.inputRow}>
                        <MaterialCommunityIcons name="weight" size={20} color={COLORS.subText} />
                        <TextInput style={styles.input} value={weight} onChangeText={setWeight} placeholder="Weight (kg)" keyboardType="numeric" placeholderTextColor="#AAA" />
                    </View>
                    
                    {/* --- RESTORED: Weight Estimation Warning --- */}
                    {ageInMonths !== null && ageInMonths < 12 && (
                        <View style={styles.infoRow}>
                            <MaterialCommunityIcons name="alert-circle-outline" size={14} color={COLORS.warning} />
                            <Text style={styles.warningText}>Estimated by age. Verify!</Text>
                        </View>
                    )}
                </View>

                <TouchableOpacity style={[styles.inputRow, { flex: 1, marginLeft: 8 }]} onPress={() => setShowDatePicker(true)}>
                    <MaterialCommunityIcons name="cake-variant" size={20} color={COLORS.subText} />
                    <Text style={[styles.inputText, !birthday && { color: '#AAA' }]}>{birthday ? birthday.toLocaleDateString() : 'Birthday'}</Text>
                </TouchableOpacity>
            </View>
            
            {/* --- RESTORED: Age/Puppy Text --- */}
            {ageInMonths !== null && (
                <Text style={styles.helperText}>
                    {getAgeString(birthday)} {ageInMonths < 12 && <Text style={{color: COLORS.accent, fontWeight: 'bold'}}>(Puppy Mode Active)</Text>}
                </Text>
            )}
        </View>

        {/* DIET */}
        <View style={styles.section}>
            <Text style={styles.label}>Calories</Text>
            <View style={styles.inputRow}>
                <MaterialCommunityIcons name="food-drumstick-outline" size={20} color={COLORS.subText} />
                <TextInput style={styles.input} value={kcal} onChangeText={setKcal} placeholder="Calories (kcal/kg)" keyboardType="numeric" placeholderTextColor="#AAA" />
            </View>
            
            {/* --- RESTORED: Calories Info Tip --- */}
            <View style={[styles.infoRow, { marginBottom: 12 }]}>
                 <MaterialCommunityIcons name="information-outline" size={16} color={COLORS.info} />
                 <Text style={[styles.helperText, {color: COLORS.info, marginLeft: 4}]}>
                     Listed as "Metabolizable Energy" on bag
                 </Text>
            </View>

            <View style={styles.segContainer}>
                {['Neutered/Spayed', 'Intact'].map((opt) => (
                    <TouchableOpacity key={opt} style={[styles.segBtn, neuterStatus === opt && styles.segBtnActive]} onPress={() => setNeuterStatus(opt)}>
                        <Text style={[styles.segText, neuterStatus === opt && styles.segTextActive]}>{opt}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            <View style={styles.segContainer}>
                {['Low', 'Normal', 'High'].map((opt) => (
                    <TouchableOpacity key={opt} style={[styles.segBtn, activityLevel === opt && styles.segBtnActive]} onPress={() => setActivityLevel(opt)}>
                        <Text style={[styles.segText, activityLevel === opt && styles.segTextActive]}>{opt}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>

        {/* BOWL & RFID */}
        <View style={styles.section}>
            <Text style={styles.label}>Bowl Assignment</Text>
            <View style={styles.bowlRow}>
                {[1, 2].map(num => {
                    const occupant = occupiedBowls.find(o => o.bowlNumber === num);
                    const isTaken = occupant && occupant.petId !== id;
                    const isActive = assignedBowl === num;
                    const color = num === 1 ? COLORS.bowl1 : COLORS.bowl2;
                    return (
                        <TouchableOpacity key={num} style={[styles.bowlCard, isActive && { borderColor: color, backgroundColor: '#FDFDFD' }]} onPress={() => setAssignedBowl(num)}>
                            <MaterialCommunityIcons name="bowl-mix" size={32} color={isActive ? color : '#DDD'} />
                            <Text style={[styles.bowlTitle, isActive && { color }]}>Bowl {num}</Text>
                            {isTaken ? (
                                <Text style={styles.bowlSub}>Swap with {occupant.petName}</Text>
                            ) : (
                                <Text style={[styles.bowlSub, { color: COLORS.success }]}>Available</Text>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>

            <TouchableOpacity style={[styles.rfidCard, isScanning && styles.rfidScanning]} onPress={handleScanTag} disabled={isScanning}>
                <MaterialCommunityIcons name="radio-tower" size={32} color={isScanning ? '#FFF' : COLORS.secondary} />
                <View style={{ marginLeft: 16, flex: 1 }}>
                    <Text style={[styles.rfidTitle, isScanning && { color: '#FFF' }]}>
                        {isScanning ? 'Scanning...' : (rfidTagId ? 'Tag Linked' : 'Scan RFID Tag')}
                    </Text>
                    <Text style={[styles.rfidSub, isScanning && { color: '#EEE' }]}>
                        {rfidTagId ? `ID: ${rfidTagId}` : 'Tap to pair collar tag'}
                    </Text>
                </View>
                {rfidTagId && !isScanning && <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />}
            </TouchableOpacity>
        </View>

        {/* RESULT */}
        <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Daily Goal</Text>
            <Text style={styles.resultValue}>{recommendedPortion}<Text style={{fontSize: 20}}>g</Text></Text>
            
            {/* --- RESTORED: Detailed Diet Insight --- */}
            {idealPortion && (
                <View style={styles.dietContainer}>
                    <View style={styles.dietHeader}>
                        <MaterialCommunityIcons name="scale-bathroom" size={20} color={COLORS.warning} />
                        <Text style={styles.dietTitle}>Weight Insight</Text>
                    </View>
                    <Text style={styles.dietText}>
                        Your entered weight ({weight}kg) is higher than the breed average.
                        For weight loss, consider feeding:
                    </Text>
                    <Text style={styles.dietValue}>{idealPortion}g / day</Text>
                </View>
            )}
        </View>

        {isEditing && (
             <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                 <Text style={styles.deleteText}>Delete Profile</Text>
             </TouchableOpacity>
        )}

      </ScrollView>

      {/* BREED MODAL */}
      <Modal visible={isBreedModalVisible} animationType="slide" presentationStyle="pageSheet">
          <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Breed</Text>
              <TouchableOpacity onPress={() => setBreedModalVisible(false)}><Ionicons name="close" size={24} /></TouchableOpacity>
          </View>
          <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color="#999" />
              <TextInput style={{flex:1, marginLeft:8}} placeholder="Search..." value={breedSearch} onChangeText={setBreedSearch} />
          </View>
          <FlatList 
            data={filteredBreeds} 
            keyExtractor={i => i.id} 
            renderItem={({item}) => (
                <TouchableOpacity style={styles.breedItem} onPress={() => { setSelectedBreedId(item.id); setBreedSearch(''); setBreedModalVisible(false); }}>
                    <Text style={styles.breedText}>{item.name}</Text>
                    <View style={styles.sizeBadge}><Text style={styles.sizeText}>{item.size}</Text></View>
                </TouchableOpacity>
            )}
          />
      </Modal>

      {showDatePicker && (
         <DateTimePicker value={birthday || new Date()} mode="date" onChange={(e, d) => { setShowDatePicker(Platform.OS === 'ios'); if(d) setBirthday(d); }} />
      )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  saveBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  saveBtnText: { color: '#FFF', fontWeight: '600' },
  content: { padding: 24 },
  
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatarCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', borderWidth: 4, overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  bowlIndicator: { position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  bowlIndicatorText: { color: '#FFF', fontWeight: 'bold' },

  section: { marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.subText, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 },
  
  dropdownBtn: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COLORS.card, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  dropdownText: { fontSize: 16, color: COLORS.text },

  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, height: 50, marginBottom: 12 },
  input: { flex: 1, marginLeft: 12, fontSize: 16, color: COLORS.text, height: '100%' },
  inputText: { marginLeft: 12, fontSize: 16, color: COLORS.text },
  splitRow: { flexDirection: 'row' },
  column: { flex: 1 },
  helperText: { fontSize: 12, color: COLORS.subText, marginLeft: 4, fontStyle: 'italic' },
  
  // New Info Row Styles
  infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginLeft: 4 },
  warningText: { fontSize: 11, color: COLORS.warning, marginLeft: 4, fontWeight: '600' },

  segContainer: { flexDirection: 'row', backgroundColor: '#E0E0E0', borderRadius: 10, padding: 4, marginBottom: 12 },
  segBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segBtnActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2 },
  segText: { fontWeight: '600', color: COLORS.subText },
  segTextActive: { color: COLORS.primary },

  bowlRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  bowlCard: { flex: 1, backgroundColor: COLORS.card, padding: 16, borderRadius: 16, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  bowlTitle: { fontSize: 16, fontWeight: '700', color: COLORS.subText, marginTop: 8 },
  bowlSub: { fontSize: 11, color: '#AAA', marginTop: 4 },

  rfidCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border },
  rfidScanning: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  rfidTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  rfidSub: { fontSize: 13, color: COLORS.subText },

  resultCard: { backgroundColor: COLORS.card, padding: 24, borderRadius: 20, alignItems: 'center', marginBottom: 24, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  resultTitle: { fontSize: 14, fontWeight: '700', color: COLORS.subText, textTransform: 'uppercase' },
  resultValue: { fontSize: 48, fontWeight: '800', color: COLORS.primary, marginVertical: 8 },

  // Diet Insight Styles
  dietContainer: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#EEE', width: '100%', alignItems: 'center' },
  dietHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  dietTitle: { fontSize: 14, fontWeight: '700', color: COLORS.warning, marginLeft: 6 },
  dietText: { fontSize: 13, color: COLORS.subText, textAlign: 'center', lineHeight: 18 },
  dietValue: { fontSize: 20, fontWeight: '800', color: COLORS.primary, marginTop: 4 },

  deleteBtn: { alignItems: 'center', padding: 16 },
  deleteText: { color: COLORS.danger, fontWeight: '700', fontSize: 16 },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  searchBar: { flexDirection: 'row', backgroundColor: '#F0F0F0', margin: 16, marginTop: 0, padding: 10, borderRadius: 10, alignItems: 'center' },
  breedItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#EEE' },
  breedText: { fontSize: 16, color: COLORS.text },
  sizeBadge: { backgroundColor: '#F0F0F0', paddingHorizontal: 8, borderRadius: 4 },
  sizeText: { fontSize: 12, color: '#666' }
});