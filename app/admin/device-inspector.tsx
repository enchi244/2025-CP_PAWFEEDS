import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { db } from '../../firebaseConfig';

const COLORS = {
  primary: '#2C3E50',
  background: '#ECF0F1',
  white: '#FFFFFF',
  text: '#34495E',
  accent: '#E74C3C',
  success: '#27AE60',
  lightGray: '#BDC3C7',
  info: '#3498DB',
  warning: '#F39C12'
};

interface UserData {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  createdAt?: any;
  isAdmin?: boolean;
}

interface FeederData {
  id: string;
  status: string;
  owner_uid: string;
  owner_email?: string;
  foodLevels: { [key: string]: number };
}

export default function DeviceInspectorScreen() {
  const router = useRouter();
  
  // 1. GET PARAMS (for auto-fill)
  const params = useLocalSearchParams<{ search?: string }>();
  
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [foundUser, setFoundUser] = useState<UserData | null>(null);
  const [foundFeeders, setFoundFeeders] = useState<FeederData[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // 2. AUTO-TRIGGER SEARCH ON MOUNT
  useEffect(() => {
    if (params.search) {
      setSearchInput(params.search);
      handleSearch(params.search);
    }
  }, [params.search]);

  // 3. UPDATED SEARCH LOGIC (Accepts optional term)
  const handleSearch = async (termOverride?: string) => {
    const termToUse = termOverride || searchInput;
    if (!termToUse.trim()) return;
    
    setLoading(true);
    setHasSearched(true);
    setFoundUser(null);
    setFoundFeeders([]);

    try {
      const term = termToUse.trim().toLowerCase(); 
      
      // A. SEARCH BY EMAIL
      if (term.includes('@')) {
        // 1. Find User
        const usersRef = collection(db, 'users');
        const qUser = query(usersRef, where('email', '==', term));
        const userSnap = await getDocs(qUser);

        if (!userSnap.empty) {
          const uData = userSnap.docs[0].data();
          const uid = uData.uid || userSnap.docs[0].id;
          
          setFoundUser({
            uid,
            email: uData.email,
            firstName: uData.firstName,
            lastName: uData.lastName,
            isAdmin: uData.isAdmin
          });

          // 2. Find Feeders for this User
          const feedersRef = collection(db, 'feeders');
          const qFeeder = query(feedersRef, where('owner_uid', '==', uid));
          const feederSnap = await getDocs(qFeeder);
          
          const feeders = feederSnap.docs.map(d => ({ 
            id: d.id, 
            ...d.data(),
            owner_email: uData.email 
          } as FeederData));
          
          setFoundFeeders(feeders);
        }
      } 
      // B. SEARCH BY FEEDER ID
      else {
        // Direct Feeder Lookup (keep case for ID)
        const feederDocRef = doc(db, 'feeders', termToUse.trim()); 
        const feederSnap = await getDoc(feederDocRef);
        
        if (feederSnap.exists()) {
          const data = feederSnap.data();
          let ownerEmail = 'Unknown';
          let userData: UserData | null = null;

          // Try to fetch owner details
          if (data.owner_uid) {
            const userDoc = await getDoc(doc(db, 'users', data.owner_uid));
            if (userDoc.exists()) {
              const u = userDoc.data();
              ownerEmail = u.email;
              userData = {
                 uid: u.uid || userDoc.id,
                 email: u.email,
                 firstName: u.firstName,
                 lastName: u.lastName,
                 isAdmin: u.isAdmin
              };
            }
          }
          
          setFoundUser(userData); 
          setFoundFeeders([{
            id: feederSnap.id,
            ...data,
            owner_email: ownerEmail
          } as FeederData]);
        }
      }

    } catch (error: any) {
      console.error(error);
      Alert.alert("Error", "Search failed: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'online') return COLORS.success;
    if (status === 'offline') return COLORS.accent;
    return COLORS.lightGray;
  };

  const renderUserCard = () => {
    if (!foundUser) return null;
    return (
      <View style={styles.userCard}>
        <View style={styles.userHeader}>
           <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="account" size={24} color={COLORS.primary} />
           </View>
           <View>
              <Text style={styles.userName}>{foundUser.firstName} {foundUser.lastName}</Text>
              <Text style={styles.userEmail}>{foundUser.email}</Text>
           </View>
           {foundUser.isAdmin && (
             <View style={styles.adminBadge}>
               <Text style={styles.adminText}>ADMIN</Text>
             </View>
           )}
        </View>
        <View style={styles.userDetails}>
           <Text style={styles.detailLabel}>UID: <Text style={styles.detailValue}>{foundUser.uid}</Text></Text>
        </View>
      </View>
    );
  };

  const renderFeeder = ({ item }: { item: FeederData }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.feederId}>ID: {item.id}</Text>
          <Text style={styles.ownerEmail}>Linked to: {item.owner_email}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
           <Text style={styles.statusText}>{item.status ? item.status.toUpperCase() : 'UNKNOWN'}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Food Levels</Text>
      <View style={styles.levelsContainer}>
         <View style={styles.levelRow}>
            <Text style={styles.bowlLabel}>Bowl 1</Text>
            <View style={styles.progressBarBg}>
               <View style={[styles.progressBarFill, { width: `${item.foodLevels?.['1'] || 0}%` }]} />
            </View>
            <Text style={styles.percentText}>{item.foodLevels?.['1'] || 0}%</Text>
         </View>

         <View style={styles.levelRow}>
            <Text style={styles.bowlLabel}>Bowl 2</Text>
            <View style={styles.progressBarBg}>
               <View style={[styles.progressBarFill, { width: `${item.foodLevels?.['2'] || 0}%` }]} />
            </View>
            <Text style={styles.percentText}>{item.foodLevels?.['2'] || 0}%</Text>
         </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Device Inspector</Text>
        <View style={{ width: 24 }} /> 
      </View>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <Text style={styles.helperText}>Search by Feeder ID or User Email (@)</Text>
        <View style={styles.searchRow}>
          <View style={styles.searchInputContainer}>
            <MaterialCommunityIcons name="magnify" size={20} color={COLORS.text} />
            <TextInput 
              style={styles.searchInput}
              placeholder="e.g., user@gmail.com or feeder_123"
              value={searchInput}
              onChangeText={setSearchInput}
              autoCapitalize="none"
            />
          </View>
          <TouchableOpacity style={styles.searchBtn} onPress={() => handleSearch()}>
             <Text style={styles.searchBtnText}>Search</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Results Content */}
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* 1. USER RESULT SECTION */}
            {hasSearched && !foundUser && !foundFeeders.length && (
                <View style={styles.emptyContainer}>
                   <MaterialCommunityIcons name="alert-circle-outline" size={48} color={COLORS.lightGray} />
                   <Text style={styles.emptyText}>No user or device found.</Text>
                </View>
            )}

            {renderUserCard()}

            {/* 2. FEEDER LIST SECTION */}
            {foundUser && foundFeeders.length === 0 && (
               <View style={styles.infoBox}>
                  <MaterialCommunityIcons name="information-outline" size={20} color={COLORS.info} />
                  <Text style={styles.infoText}>This user exists but has no linked feeders.</Text>
               </View>
            )}

            <FlatList
              data={foundFeeders}
              keyExtractor={item => item.id}
              renderItem={renderFeeder}
              contentContainerStyle={{ paddingBottom: 40, marginTop: 10 }}
            />
          </>
        )}
      </View>
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
  
  searchSection: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2,
    zIndex: 10
  },
  helperText: { fontSize: 12, color: COLORS.text, marginBottom: 8, opacity: 0.6 },
  searchRow: { flexDirection: 'row', gap: 10 },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F5F6FA',
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0'
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16, paddingVertical: 10 },
  searchBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: 'center'
  },
  searchBtnText: { color: COLORS.white, fontWeight: 'bold' },

  content: { flex: 1, padding: 16 },
  
  // USER CARD STYLES
  userCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.info,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2
  },
  userHeader: { flexDirection: 'row', alignItems: 'center' },
  iconCircle: { 
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#E8F4FD', 
    justifyContent: 'center', alignItems: 'center', marginRight: 12 
  },
  userName: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  userEmail: { fontSize: 14, color: '#7F8C8D' },
  userDetails: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  detailLabel: { fontSize: 12, color: '#95A5A6' },
  detailValue: { color: COLORS.text, fontFamily: 'monospace' },
  adminBadge: { 
      backgroundColor: COLORS.primary, paddingHorizontal: 6, paddingVertical: 2, 
      borderRadius: 4, marginLeft: 'auto' 
  },
  adminText: { color: COLORS.white, fontSize: 10, fontWeight: 'bold' },

  // FEEDER CARD STYLES
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 1
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  feederId: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  ownerEmail: { fontSize: 12, color: '#7F8C8D', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  statusText: { color: COLORS.white, fontSize: 10, fontWeight: 'bold' },
  
  divider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 12 },
  
  sectionLabel: { fontSize: 12, fontWeight: 'bold', color: '#95A5A6', marginBottom: 8, textTransform: 'uppercase' },
  levelsContainer: { gap: 12 },
  levelRow: { flexDirection: 'row', alignItems: 'center' },
  bowlLabel: { width: 50, fontSize: 14, fontWeight: '600', color: COLORS.text },
  progressBarBg: { flex: 1, height: 8, backgroundColor: '#ECF0F1', borderRadius: 4, marginHorizontal: 10, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: COLORS.success },
  percentText: { width: 40, fontSize: 12, color: '#7F8C8D', textAlign: 'right' },

  infoBox: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F4FD', 
      padding: 12, borderRadius: 8, marginBottom: 10
  },
  infoText: { color: COLORS.info, marginLeft: 8, fontSize: 14 },

  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#BDC3C7', marginTop: 10, fontSize: 16 },
});