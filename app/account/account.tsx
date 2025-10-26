import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
// 1. Import native auth types and EmailAuthProvider
import auth, { EmailAuthProvider, FirebaseAuthTypes } from '@react-native-firebase/auth';
// 2. Import native firestore types
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
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
// 3. Import native db instance (we don't need the auth instance directly here)
import { db } from '../../firebaseConfig';

const COLORS = { primary: '#8C6E63', accent: '#FFC107', background: '#F5F5F5', text: '#333333', lightGray: '#E0E0E0', white: '#FFFFFF', danger: '#D32F2F', overlay: 'rgba(0, 0, 0, 0.4)' };

// 4. Define the Unsubscribe type
type Unsubscribe = () => void;
// 5. Use the correct User type
type User = FirebaseAuthTypes.User | null;

export default function AccountScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [petCount, setPetCount] = useState(0);
  const [scheduleCount, setScheduleCount] = useState(0);
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let unsubscribePets: Unsubscribe = () => {};
    let unsubscribeSchedules: Unsubscribe = () => {};

    // 6. Use the imported native auth instance
    const authInstance = auth();
    const unsubscribeAuth = authInstance.onAuthStateChanged((authUser) => {
      setUser(authUser);
      if (authUser) {
        // Now that we have the user, fetch their data
        // TODO: Dynamically fetch feederId instead of hardcoding
        const feederId = 'eNFJODJ5YP1t3lw77WJG';

        try {
          // 7. Use native firestore syntax
          const petsCollectionRef = db.collection('feeders').doc(feederId).collection('pets');
          const schedulesCollectionRef = db.collection('feeders').doc(feederId).collection('schedules');

          // 8. Use native onSnapshot syntax with explicit types and error handlers
          unsubscribePets = petsCollectionRef.onSnapshot(
            (querySnapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
              setPetCount(querySnapshot.size);
            },
            (error) => {
              console.error('Error fetching pet count:', error);
            }
          );

          unsubscribeSchedules = schedulesCollectionRef.onSnapshot(
            (querySnapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
              setScheduleCount(querySnapshot.size);
            },
            (error) => {
              console.error('Error fetching schedule count:', error);
            }
          );

        } catch (error) {
          console.error('Error setting up listeners:', error);
          Alert.alert('Error', 'Could not fetch account data.');
        } finally {
          setIsLoading(false); // Set loading false after setup attempt
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
        // 9. Use native EmailAuthProvider
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        // 10. Use native reauthenticateWithCredential and updatePassword methods
        await user.reauthenticateWithCredential(credential);
        await user.updatePassword(newPassword);
        Alert.alert('Success', 'Your password has been changed.');
        setNewPassword('');
        setCurrentPassword('');
      } catch (error: any) { // Catch as any to access error properties
        console.error('Error changing password:', error);
        // Provide more specific error messages if possible
        let errorMessage = 'Failed to change password. Please ensure your current password is correct and you have recently logged in.';
        if (error.code === 'auth/wrong-password') {
            errorMessage = 'Incorrect current password provided.';
        } else if (error.code === 'auth/requires-recent-login') {
            errorMessage = 'This operation requires you to have recently signed in. Please log out and log back in.';
        }
        Alert.alert('Error', errorMessage);
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