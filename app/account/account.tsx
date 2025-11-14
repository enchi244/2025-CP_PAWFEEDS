import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { EmailAuthProvider, getAuth, onAuthStateChanged, reauthenticateWithCredential, updatePassword, User } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

const COLORS = { primary: '#8C6E63', accent: '#FFC107', background: '#F5F5F5', text: '#333333', lightGray: '#E0E0E0', white: '#FFFFFF', danger: '#D32F2F', overlay: 'rgba(0, 0, 0, 0.4)' };

export default function AccountScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [petCount, setPetCount] = useState(0);
  const [scheduleCount, setScheduleCount] = useState(0);
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let unsubscribePets = () => {};
    let unsubscribeSchedules = () => {};
    
    const auth = getAuth();
    const unsubscribeAuth = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      if (authUser) {
        // Now that we have the user, fetch their data
        const feederId = 'eNFJODJ5YP1t3lw77WJG';
        
        try {
          const petsCollectionRef = collection(db, 'feeders', feederId, 'pets');
          const schedulesCollectionRef = collection(db, 'feeders', feederId, 'schedules');
  
          unsubscribePets = onSnapshot(petsCollectionRef, (querySnapshot) => {
            setPetCount(querySnapshot.size);
          });
  
          unsubscribeSchedules = onSnapshot(schedulesCollectionRef, (querySnapshot) => {
            setScheduleCount(querySnapshot.size);
          });

        } catch (error) {
          console.error('Error fetching user data:', error);
          Alert.alert('Error', 'Could not fetch account data.');
        } finally {
          setIsLoading(false);
        }

      } else {
        setIsLoading(false);
        router.replace('/');
      }
    });

    // Cleanup function that unsubscribes all listeners
    return () => {
      unsubscribeAuth();
      unsubscribePets();
      unsubscribeSchedules();
    };
  }, [router]);

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long.');
      return;
    }
    
    // Perform null checks on the user object before proceeding
    if (user && user.email && currentPassword) {
      setIsLoading(true);
      try {
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPassword);
        Alert.alert('Success', 'Your password has been changed.');
        setNewPassword('');
        setCurrentPassword('');
      } catch (error) {
        console.error('Error changing password:', error);
        Alert.alert('Error', 'Failed to change password. Please ensure your current password is correct and you have recently logged in.');
      } finally {
        setIsLoading(false);
      }
    } else {
      Alert.alert('Missing Information', 'Please provide both your current and new passwords.');
    }
  };

  if (isLoading || !user) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={28} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account</Text>
        <View style={{ width: 28 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.summaryContainer}>
          <Text style={styles.emailText}>Email: {user.email}</Text>
          <View style={styles.statRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total Pets</Text>
              <Text style={styles.statValue}>{petCount}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total Schedules</Text>
              <Text style={styles.statValue}>{scheduleCount}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Change Password</Text>
          <Text style={styles.label}>Current Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter current password"
            placeholderTextColor="#999"
            secureTextEntry
            value={currentPassword}
            onChangeText={setCurrentPassword}
          />
          <Text style={styles.label}>New Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter new password"
            placeholderTextColor="#999"
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <TouchableOpacity style={styles.updateButton} onPress={handleChangePassword}>
            <Text style={styles.updateButtonText}>Update Password</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary },
  scrollContent: { padding: 20 },
  summaryContainer: { backgroundColor: COLORS.white, borderRadius: 12, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  emailText: { fontSize: 18, fontWeight: '600', color: COLORS.text, marginBottom: 16 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statCard: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.lightGray, marginHorizontal: 4 },
  statLabel: { fontSize: 14, color: '#666' },
  statValue: { fontSize: 28, fontWeight: 'bold', color: COLORS.primary, marginTop: 4 },
  sectionContainer: { marginTop: 24, padding: 20, backgroundColor: COLORS.white, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary, marginBottom: 16 },
  label: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  input: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.lightGray, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 16, color: COLORS.text },
  updateButton: { backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  updateButtonText: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
});