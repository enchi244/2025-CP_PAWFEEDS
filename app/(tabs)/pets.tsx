import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';

const COLORS = {
  primary: '#5D4037', // Darker Brown
  secondary: '#8D6E63',
  accent: '#FFB300', // Amber
  background: '#F5F5F5',
  card: '#FFFFFF',
  text: '#3E2723',
  subText: '#9E9E9E',
  success: '#4CAF50',
  bowl1: '#29B6F6', // Blue for Bowl 1
  bowl2: '#EF5350', // Red for Bowl 2
};

const { width } = Dimensions.get('window');

interface Pet {
  id: string;
  name: string;
  age?: string;
  weight?: string;
  breed?: string;
  recommendedPortion: number; // Daily Goal
  bowlNumber: number;
}

export default function PetsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      try {
        const feedersRef = collection(db, 'feeders');
        const q = query(feedersRef, where('owner_uid', '==', user.uid));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
            const feederId = snap.docs[0].id;
            const petsRef = collection(db, 'feeders', feederId, 'pets');
            
            const unsub = onSnapshot(petsRef, (s) => {
                const data = s.docs.map(d => ({ id: d.id, ...d.data() } as Pet));
                setPets(data);
                setLoading(false);
            });
            return unsub;
        } else {
            setLoading(false);
        }
      } catch (e) {
          console.error(e);
          setLoading(false);
      }
    };
    fetch();
  }, [user]);

  const handlePetPress = (id: string) => {
    router.push({ pathname: "/pet/[id]", params: { id } });
  };

  const handleAddPet = () => {
    if (pets.length >= 2) {
        Alert.alert("Maximum Reached", "You can only have 2 pets assigned to this feeder.");
        return;
    }
    router.push({ pathname: "/pet/[id]", params: { id: 'new' } });
  };

  const PetCard = ({ pet }: { pet: Pet }) => {
    const isBowl1 = pet.bowlNumber === 1;
    const bowlColor = isBowl1 ? COLORS.bowl1 : COLORS.bowl2;

    return (
      <TouchableOpacity 
        style={styles.card} 
        activeOpacity={0.9} 
        onPress={() => handlePetPress(pet.id)}
      >
        {/* Bowl Badge */}
        <View style={[styles.bowlBadge, { backgroundColor: bowlColor }]}>
            <MaterialCommunityIcons name="bowl-mix" size={14} color="#FFF" />
            <Text style={styles.bowlBadgeText}>Bowl {pet.bowlNumber}</Text>
        </View>

        <View style={styles.cardContent}>
            {/* Avatar Circle */}
            <View style={[styles.avatarContainer, { borderColor: bowlColor }]}>
                <MaterialCommunityIcons name="dog" size={48} color={COLORS.secondary} />
            </View>

            {/* Main Info */}
            <View style={styles.infoColumn}>
                <Text style={styles.petName}>{pet.name}</Text>
                <Text style={styles.breedText}>{pet.breed || 'Unknown Breed'}</Text>
                
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>Daily Goal</Text>
                        <Text style={styles.statValue}>
                            {pet.recommendedPortion}
                            <Text style={styles.unit}>g</Text>
                        </Text>
                    </View>
                    <View style={styles.verticalDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>Weight</Text>
                        <Text style={styles.statValue}>
                            {pet.weight || '--'}
                            <Text style={styles.unit}>kg</Text>
                        </Text>
                    </View>
                </View>
            </View>

            {/* Arrow */}
            <View style={styles.arrowContainer}>
                <Ionicons name="chevron-forward" size={24} color="#E0E0E0" />
            </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <View>
            <Text style={styles.headerTitle}>My Pets</Text>
            <Text style={styles.headerSubtitle}>{pets.length}/2 Slots Used</Text>
        </View>
        {pets.length < 2 && (
            <TouchableOpacity style={styles.addBtn} onPress={handleAddPet}>
                <Ionicons name="add" size={24} color="#FFF" />
            </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {pets.length === 0 ? (
            <View style={styles.emptyState}>
                <MaterialCommunityIcons name="dog-side" size={80} color="#E0E0E0" />
                <Text style={styles.emptyText}>No pets added yet</Text>
                <Text style={styles.emptySub}>Add a pet to start feeding!</Text>
                <TouchableOpacity style={styles.ctaBtn} onPress={handleAddPet}>
                    <Text style={styles.ctaText}>Add First Pet</Text>
                </TouchableOpacity>
            </View>
        ) : (
            pets.map(pet => <PetCard key={pet.id} pet={pet} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: { 
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
      paddingHorizontal: 24, paddingVertical: 20, 
  },
  headerTitle: { fontSize: 32, fontWeight: '800', color: COLORS.primary },
  headerSubtitle: { fontSize: 14, color: COLORS.subText, fontWeight: '600', marginTop: 4 },
  
  addBtn: { 
      width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.accent, 
      justifyContent: 'center', alignItems: 'center', 
      shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6
  },

  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },

  card: {
      backgroundColor: COLORS.card, borderRadius: 28, marginBottom: 20,
      shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
      overflow: 'hidden', padding: 20, minHeight: 140
  },
  cardContent: { flexDirection: 'row', alignItems: 'center' },
  
  avatarContainer: {
      width: 80, height: 80, borderRadius: 40, backgroundColor: '#F5F5F5',
      justifyContent: 'center', alignItems: 'center', borderWidth: 3,
      marginRight: 20
  },
  
  infoColumn: { flex: 1 },
  petName: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 2 },
  breedText: { fontSize: 14, color: COLORS.subText, marginBottom: 12 },
  
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statItem: { marginRight: 16 },
  statLabel: { fontSize: 11, color: COLORS.subText, textTransform: 'uppercase', fontWeight: '700' },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  unit: { fontSize: 12, fontWeight: '600', color: COLORS.subText },
  
  verticalDivider: { width: 1, height: 24, backgroundColor: '#EEE', marginRight: 16 },

  arrowContainer: { justifyContent: 'center', paddingLeft: 10 },

  bowlBadge: {
      position: 'absolute', top: 0, right: 0, 
      borderBottomLeftRadius: 16, paddingVertical: 6, paddingHorizontal: 12,
      flexDirection: 'row', alignItems: 'center', gap: 4
  },
  bowlBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },

  emptyState: { alignItems: 'center', marginTop: 100 },
  emptyText: { fontSize: 20, fontWeight: 'bold', color: COLORS.subText, marginTop: 16 },
  emptySub: { fontSize: 16, color: '#BDBDBD', marginTop: 8 },
  ctaBtn: { marginTop: 24, backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  ctaText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
});