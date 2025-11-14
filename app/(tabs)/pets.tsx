import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, getDocs, onSnapshot, query, Unsubscribe, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ListRenderItem,
  StyleSheet,
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

interface Pet {
  id: string;
  name: string;
  photoUrl: string;
}

export default function PetsScreen() {
  const router = useRouter();
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let unsubscribe: Unsubscribe = () => {};

    const fetchPets = async () => {
      try {
        const feedersRef = collection(db, 'feeders');
        const q = query(feedersRef, where('owner_uid', '==', user.uid));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const feederDoc = querySnapshot.docs[0];
          const feederId = feederDoc.id;
          const petsCollectionRef = collection(db, 'feeders', feederId, 'pets');
          
          unsubscribe = onSnapshot(petsCollectionRef, (snapshot) => {
            const petsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pet));
            setPets(petsData);
            setLoading(false);
          });
        } else {
          setPets([]);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error fetching pets:", error);
        setLoading(false);
      }
    };

    fetchPets();
    return () => unsubscribe();
  }, [user]);

  const handleAddPet = () => {
    router.push({
      pathname: "/pet/[id]",
      params: { id: 'new' }
    });
  };
  
  const handleEditPet = (petId: string) => {
    router.push({
      pathname: "/pet/[id]",
      params: { id: petId }
    });
  };

  const renderPetItem: ListRenderItem<Pet> = ({ item }) => (
    <TouchableOpacity style={styles.petItem} onPress={() => handleEditPet(item.id)}>
      <Image source={{ uri: item.photoUrl }} style={styles.petPhoto} />
      <Text style={styles.petName}>{item.name}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Pets</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} />
      ) : pets.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="dog" size={80} color={COLORS.lightGray} />
          <Text style={styles.emptyText}>No pets added yet.</Text>
          <Text style={styles.emptySubText}>{"Tap the '+' button to add your first pet!"}</Text>
        </View>
      ) : (
        <FlatList
          data={pets}
          renderItem={renderPetItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={handleAddPet}>
        <MaterialCommunityIcons name="plus" size={32} color={COLORS.text} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray, alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.primary },
  listContainer: { padding: 20 },
  petItem: { backgroundColor: COLORS.white, borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  petPhoto: { width: 60, height: 60, borderRadius: 30, marginRight: 16, backgroundColor: COLORS.lightGray },
  petName: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { fontSize: 20, fontWeight: 'bold', color: '#aaa', marginTop: 16 },
  emptySubText: { fontSize: 16, color: '#bbb', marginTop: 8, textAlign: 'center' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 6 },
});