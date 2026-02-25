import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    orderBy,
    query,
    updateDoc
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import { db } from '../../firebaseConfig';

// --- CONSTANTS & TYPES ---
const COLORS = {
  primary: '#2C3E50',
  accent: '#E74C3C',
  background: '#ECF0F1',
  white: '#FFFFFF',
  text: '#34495E',
  lightGray: '#BDC3C7',
  success: '#27AE60',
  warning: '#F39C12',
  info: '#3498DB'
};

interface DogBreed {
  id: string;
  name: string;
  size: 'Small' | 'Medium' | 'Large';
  defaultWeight: number;
  defaultKcal: number;
  defaultActivity: 'Low' | 'Normal' | 'High';
  defaultNeuterStatus: 'Neutered/Spayed' | 'Intact';
}

// --- HELPER COMPONENT: SEGMENTED CONTROL ---
const SegmentedControl = ({ options, selected, onSelect, small = false }: any) => (
  <View style={[styles.segmentContainer, small && { padding: 1 }]}>
    {options.map((opt: string) => (
      <TouchableOpacity
        key={opt}
        style={[
          styles.segmentBtn, 
          selected === opt && styles.segmentBtnActive,
          small && { paddingVertical: 4 }
        ]}
        onPress={() => onSelect(opt)}
      >
        <Text style={[
          styles.segmentText, 
          selected === opt && styles.segmentTextActive,
          small && { fontSize: 11 }
        ]}>
          {opt}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
);

export default function BreedManagerScreen() {
  const router = useRouter();
  const [breeds, setBreeds] = useState<DogBreed[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // --- FILTER & SORT STATE ---
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterSize, setFilterSize] = useState<'All' | 'Small' | 'Medium' | 'Large'>('All');
  const [filterActivity, setFilterActivity] = useState<'All' | 'Low' | 'Normal' | 'High'>('All');

  // --- CRUD MODAL STATE ---
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // --- FORM STATE ---
  const [name, setName] = useState('');
  const [size, setSize] = useState<'Small' | 'Medium' | 'Large'>('Medium');
  const [weight, setWeight] = useState('');
  const [kcal, setKcal] = useState('');
  const [activity, setActivity] = useState<'Low' | 'Normal' | 'High'>('Normal');
  const [neuter, setNeuter] = useState('Neutered/Spayed');

  // --- 1. FETCH BREEDS ---
  const fetchBreeds = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'dogBreeds'), orderBy('name'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DogBreed));
      setBreeds(data);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to load breeds.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBreeds();
  }, []);

  // --- 2. HANDLE EDIT / OPEN MODAL ---
  const openModal = (breed?: DogBreed) => {
    if (breed) {
      setEditingId(breed.id);
      setName(breed.name);
      setSize(breed.size);
      setWeight(breed.defaultWeight.toString());
      setKcal(breed.defaultKcal.toString());
      setActivity(breed.defaultActivity);
      setNeuter(breed.defaultNeuterStatus);
    } else {
      setEditingId(null);
      setName('');
      setSize('Medium');
      setWeight('');
      setKcal('');
      setActivity('Normal');
      setNeuter('Neutered/Spayed');
    }
    setModalVisible(true);
  };

  // --- 3. HANDLE SAVE (CREATE OR UPDATE) ---
  const handleSave = async () => {
    if (!name || !weight || !kcal) {
      Alert.alert('Validation', 'Please fill all fields.');
      return;
    }

    const breedData = {
      name,
      size,
      defaultWeight: parseFloat(weight),
      defaultKcal: parseInt(kcal, 10),
      defaultActivity: activity,
      defaultNeuterStatus: neuter
    };

    setLoading(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, 'dogBreeds', editingId), breedData);
        Alert.alert('Success', 'Breed updated successfully.');
      } else {
        await addDoc(collection(db, 'dogBreeds'), breedData);
        Alert.alert('Success', 'New breed added.');
      }
      setModalVisible(false);
      fetchBreeds(); 
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to save breed.');
    } finally {
      setLoading(false);
    }
  };

  // --- 4. HANDLE DELETE ---
  const handleDelete = (id: string, breedName: string) => {
    Alert.alert(
      'Delete Breed',
      `Are you sure you want to delete ${breedName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            setLoading(true);
            try {
              await deleteDoc(doc(db, 'dogBreeds', id));
              fetchBreeds();
            } catch (e) {
              Alert.alert('Error', 'Could not delete breed.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  // --- FILTER LOGIC ---
  const filteredBreeds = breeds.filter(b => {
    const matchesSearch = b.name.toLowerCase().includes(search.toLowerCase());
    const matchesSize = filterSize === 'All' || b.size === filterSize;
    const matchesActivity = filterActivity === 'All' || b.defaultActivity === filterActivity;
    return matchesSearch && matchesSize && matchesActivity;
  }).sort((a, b) => {
    if (sortOrder === 'asc') return a.name.localeCompare(b.name);
    return b.name.localeCompare(a.name);
  });

  const activeFilterCount = (filterSize !== 'All' ? 1 : 0) + (filterActivity !== 'All' ? 1 : 0);

  // --- RENDER ITEM ---
  const renderItem = ({ item }: { item: DogBreed }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.breedName}>{item.name}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: getSizeColor(item.size) }]}>
              <Text style={styles.badgeText}>{item.size}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: COLORS.lightGray, marginLeft: 8 }]}>
              <Text style={styles.badgeText}>{item.defaultActivity}</Text>
            </View>
          </View>
        </View>
        <View style={styles.actionRow}>
          <TouchableOpacity onPress={() => openModal(item)} style={styles.iconBtn}>
            <MaterialCommunityIcons name="pencil" size={20} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(item.id, item.name)} style={styles.iconBtn}>
            <MaterialCommunityIcons name="trash-can" size={20} color={COLORS.accent} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.detailsRow}>
        <Text style={styles.detailText}>Avg: {item.defaultWeight}kg</Text>
        <Text style={styles.detailText}> • </Text>
        <Text style={styles.detailText}>{item.defaultKcal} kcal/100g</Text>
      </View>
    </View>
  );

  const getSizeColor = (s: string) => {
    if (s === 'Small') return '#27AE60'; 
    if (s === 'Medium') return '#F39C12'; 
    if (s === 'Large') return '#C0392B'; 
    return COLORS.lightGray;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Breed Database</Text>
        <TouchableOpacity onPress={() => openModal()} style={styles.addBtn}>
          <MaterialCommunityIcons name="plus" size={24} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* SEARCH & FILTER BAR */}
      <View style={styles.searchContainer}>
        <MaterialCommunityIcons name="magnify" size={20} color={COLORS.text} />
        <TextInput 
          style={styles.searchInput} 
          placeholder="Search breeds..." 
          value={search} 
          onChangeText={setSearch} 
        />
        <View style={styles.vDivider} />
        <TouchableOpacity 
          style={styles.filterBtn} 
          onPress={() => setShowFilterMenu(true)}
        >
           <MaterialCommunityIcons 
             name={activeFilterCount > 0 ? "filter" : "tune"} 
             size={22} 
             color={activeFilterCount > 0 ? COLORS.primary : COLORS.lightGray} 
           />
           {activeFilterCount > 0 && <View style={styles.filterBadge} />}
        </TouchableOpacity>
      </View>

      {/* FILTER MODAL (POPUP) */}
      <Modal visible={showFilterMenu} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowFilterMenu(false)}>
           <View style={styles.filterOverlay}>
              <TouchableWithoutFeedback>
                 <View style={styles.filterCard}>
                    <Text style={styles.filterTitle}>Filter & Sort</Text>
                    
                    <Text style={styles.filterLabel}>Sort Order</Text>
                    <SegmentedControl 
                      options={['A-Z', 'Z-A']} 
                      selected={sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
                      onSelect={(val: string) => setSortOrder(val === 'A-Z' ? 'asc' : 'desc')}
                      small
                    />

                    <Text style={styles.filterLabel}>Size</Text>
                    <SegmentedControl 
                      options={['All', 'Small', 'Medium', 'Large']} 
                      selected={filterSize}
                      onSelect={setFilterSize}
                      small
                    />

                    <Text style={styles.filterLabel}>Activity Level</Text>
                    <SegmentedControl 
                      options={['All', 'Low', 'Normal', 'High']} 
                      selected={filterActivity}
                      onSelect={setFilterActivity}
                      small
                    />

                    <TouchableOpacity 
                      style={styles.applyBtn}
                      onPress={() => setShowFilterMenu(false)}
                    >
                      <Text style={styles.applyBtnText}>Apply Filters</Text>
                    </TouchableOpacity>
                 </View>
              </TouchableWithoutFeedback>
           </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* LIST */}
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={filteredBreeds}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No breeds match your filters.</Text>}
        />
      )}

      {/* ADD/EDIT MODAL (FULL SCREEN) */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingId ? 'Edit Breed' : 'New Breed'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.form}>
            <Text style={styles.label}>Breed Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Golden Retriever" />

            <Text style={styles.label}>Size Category</Text>
            <SegmentedControl options={['Small', 'Medium', 'Large']} selected={size} onSelect={setSize} />

            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Avg Weight (kg)</Text>
                <TextInput style={styles.input} value={weight} onChangeText={setWeight} keyboardType="numeric" />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Food Kcal (Approx)</Text>
                <TextInput style={styles.input} value={kcal} onChangeText={setKcal} keyboardType="numeric" />
              </View>
            </View>

            <Text style={styles.label}>Activity Level</Text>
            <SegmentedControl options={['Low', 'Normal', 'High']} selected={activity} onSelect={setActivity} />

            <Text style={styles.label}>Default Neuter Status</Text>
            <SegmentedControl options={['Neutered/Spayed', 'Intact']} selected={neuter} onSelect={setNeuter} />

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save Breed</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.primary,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
  backBtn: { padding: 4 },
  addBtn: { padding: 4 },
  
  // SEARCH & FILTER
  searchContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1
  },
  searchInput: { marginLeft: 8, flex: 1, fontSize: 16, height: 40 },
  vDivider: { width: 1, height: 24, backgroundColor: '#eee', marginHorizontal: 8 },
  filterBtn: { padding: 8, position: 'relative' },
  filterBadge: {
    position: 'absolute', top: 8, right: 6, width: 8, height: 8,
    backgroundColor: COLORS.accent, borderRadius: 4, borderWidth: 1, borderColor: COLORS.white
  },

  // FILTER POPUP
  filterOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center'
  },
  filterCard: {
    width: '85%', backgroundColor: COLORS.white, borderRadius: 12, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 5
  },
  filterTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary, marginBottom: 16, textAlign: 'center' },
  filterLabel: { fontSize: 12, fontWeight: '600', color: '#7F8C8D', marginBottom: 6, marginTop: 12 },
  applyBtn: {
    backgroundColor: COLORS.primary, borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 24
  },
  applyBtnText: { color: COLORS.white, fontWeight: 'bold' },

  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  breedName: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  badgeRow: { flexDirection: 'row', marginTop: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: COLORS.white, fontSize: 10, fontWeight: 'bold' },
  actionRow: { flexDirection: 'row' },
  iconBtn: { padding: 8, marginLeft: 4 },
  detailsRow: { flexDirection: 'row', marginTop: 12 },
  detailText: { fontSize: 14, color: '#7F8C8D' },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#95A5A6' },
  
  // MODAL STYLES
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', padding: 20, backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: '#E0E0E0'
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary },
  cancelText: { fontSize: 16, color: COLORS.accent },
  form: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#7F8C8D', marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: '#BDC3C7',
    borderRadius: 8, padding: 12, fontSize: 16, color: COLORS.text
  },
  row: { flexDirection: 'row', gap: 16 },
  col: { flex: 1 },
  saveBtn: {
    backgroundColor: COLORS.success, borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 32
  },
  saveBtnText: { color: COLORS.white, fontWeight: 'bold', fontSize: 16 },
  
  // SEGMENTED CONTROL
  segmentContainer: { flexDirection: 'row', backgroundColor: '#E0E0E0', borderRadius: 8, padding: 2 },
  segmentBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  segmentBtnActive: { backgroundColor: COLORS.white, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2 },
  segmentText: { fontSize: 12, fontWeight: '600', color: '#7F8C8D' },
  segmentTextActive: { color: COLORS.primary },
});