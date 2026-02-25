import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { off, onValue, ref, remove } from 'firebase/database';
import { collection, getDocs, query, where } from 'firebase/firestore'; // Import Firestore functions
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert, // Import Alert
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { database, db } from '../../firebaseConfig'; // Import db

const COLORS = {
  primary: '#8C6E63',
  secondary: '#6D4C41',
  accent: '#FFC107',
  background: '#F8F9FA',
  surface: '#FFFFFF',
  text: '#2D3436',
  subtext: '#636E72',
  success: '#00B894',
  lightGray: '#DFE6E9',
};

export default function SetupCompleteScreen() {
  const router = useRouter();
  const { user, refreshUserData } = useAuth();
  const [status, setStatus] = useState<'waiting' | 'success'>('waiting');
  const [isVerifying, setIsVerifying] = useState(false); // Local state for button loading

  useEffect(() => {
    if (!user?.uid) return;

    // We listen to the Realtime Database for a handshake signal from the ESP32.
    // This signal ({ status: 'complete' }) is sent ONLY after the ESP32 has 
    // successfully created the Firestore feeder document and updated the user profile.
    const setupSyncRef = ref(database, `/setup_sync/${user.uid}`);
    let isFinished = false;

    // 1. Fallback Timeout
    // If the ESP32 writes to Firestore but fails to write to RTDB (e.g., network blip),
    // we don't want the user stuck on "Verifying" forever.
    const timeoutId = setTimeout(async () => {
      if (!isFinished) {
        console.log("Setup sync timeout - checking user profile directly.");
        // Attempt to refresh data anyway; if the feeder exists in Firestore, this will find it.
        if (refreshUserData) await refreshUserData();
        setStatus('success'); 
        isFinished = true;
      }
    }, 15000); // 15 seconds

    // 2. RTDB Handshake Listener
    const unsubscribe = onValue(setupSyncRef, async (snapshot) => {
      const data = snapshot.val();
      
      if (data && data.status === 'complete') {
        if (isFinished) return; // Prevent double trigger
        isFinished = true;

        console.log("Received handshake from ESP32 via RTDB.");
        
        // Sync AuthContext so the rest of the app knows we are verified
        if (refreshUserData) {
          await refreshUserData();
        }

        setStatus('success');
        
        // Cleanup: Remove the handshake node
        remove(setupSyncRef).catch(err => console.log("Cleanup warning:", err));
      }
    });

    return () => {
      off(setupSyncRef);
      clearTimeout(timeoutId);
    };
  }, [user?.uid, refreshUserData]);

  const handleFinish = async () => {
    if (isVerifying) return;
    setIsVerifying(true);

    try {
      // 1. Force a refresh of the auth context logic
      if (refreshUserData) {
        await refreshUserData();
      }

      // 2. Double-Check: Manually query Firestore to ensure the feeder exists.
      // This prevents the race condition where context might still be stale 
      // or Firestore latency causes the layout to bounce us back.
      if (user?.uid) {
        const feedersRef = collection(db, 'feeders');
        const q = query(feedersRef, where('owner_uid', '==', user.uid));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          // Success: Feeder confirmed. Navigation is safe.
          router.replace('/(tabs)');
        } else {
          // Failure: Context or Firestore is lagging.
          Alert.alert(
            "Syncing Device",
            "We are finalizing the device registration. Please wait a few moments and try again."
          );
          setIsVerifying(false);
        }
      } else {
        // Fallback for edge cases
        router.replace('/(tabs)');
      }
    } catch (error) {
      console.error("Verification failed:", error);
      Alert.alert("Error", "Could not verify device setup. Please try again.");
      setIsVerifying(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.content}>
        
        {/* WAITING STATE */}
        {status === 'waiting' && (
          <View style={styles.card}>
            <View style={styles.animationContainer}>
              <View style={styles.spinnerWrapper}>
                <ActivityIndicator size={80} color={COLORS.primary} />
              </View>
              <View style={styles.iconOverlay}>
                <MaterialCommunityIcons name="wifi" size={32} color={COLORS.primary} />
              </View>
            </View>
            
            <Text style={styles.title}>Finalizing Connection</Text>
            
            <View style={styles.statusSteps}>
              <StatusStep 
                icon="check-circle" 
                text="Credentials sent to device" 
                active={true} 
                completed={true} 
              />
              <StatusStep 
                icon="router-wireless" 
                text="Device connecting to Wi-Fi" 
                active={true} 
                completed={true} 
              />
              <StatusStep 
                icon="cloud-sync" 
                text="Verifying with Cloud..." 
                active={true} 
                completed={false} 
                isLast
              />
            </View>

            <Text style={styles.subtext}>
              Please wait. Your feeder is coming online and registering with the server. This typically takes 10-20 seconds.
            </Text>
          </View>
        )}

        {/* SUCCESS STATE */}
        {status === 'success' && (
          <View style={styles.card}>
            <View style={styles.successIconContainer}>
              <MaterialCommunityIcons name="check-decagram" size={100} color={COLORS.success} />
            </View>
            
            <Text style={styles.title}>All Set!</Text>
            <Text style={styles.successText}>
              Your PawFeeds device is online, linked to your account, and ready to dispense happiness.
            </Text>

            <View style={styles.divider} />

            <TouchableOpacity 
              style={[styles.button, isVerifying && styles.buttonDisabled]} 
              onPress={handleFinish}
              activeOpacity={0.8}
              disabled={isVerifying}
            >
              {isVerifying ? (
                <ActivityIndicator size="small" color={COLORS.text} />
              ) : (
                <>
                  <Text style={styles.buttonText}>Go to Dashboard</Text>
                  <MaterialCommunityIcons name="arrow-right" size={20} color={COLORS.text} style={{marginLeft: 8}} />
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

      </View>
    </SafeAreaView>
  );
}

// Helper component for the waiting steps
const StatusStep = ({ icon, text, active, completed, isLast }: any) => (
  <View style={styles.stepContainer}>
    <View style={styles.stepIconColumn}>
      <MaterialCommunityIcons 
        name={completed || active ? icon : 'circle-outline'} 
        size={24} 
        color={completed ? COLORS.success : (active ? COLORS.primary : COLORS.lightGray)} 
      />
      {!isLast && <View style={[styles.stepLine, { backgroundColor: completed ? COLORS.success : COLORS.lightGray }]} />}
    </View>
    <Text style={[
      styles.stepText, 
      { color: completed || active ? COLORS.text : COLORS.subtext, fontWeight: active ? '600' : '400' }
    ]}>
      {text}
    </Text>
    {active && !completed && <ActivityIndicator size="small" color={COLORS.primary} style={{marginLeft: 'auto'}} />}
    {completed && <MaterialCommunityIcons name="check" size={16} color={COLORS.success} style={{marginLeft: 'auto'}} />}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  // Animation Styles
  animationContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  spinnerWrapper: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconOverlay: {
    backgroundColor: COLORS.surface,
    padding: 10,
    borderRadius: 50,
  },
  // Success Icon
  successIconContainer: {
    marginBottom: 24,
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  // Typography
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtext: {
    fontSize: 14,
    color: COLORS.subtext,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 20,
  },
  successText: {
    fontSize: 16,
    color: COLORS.subtext,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  // Steps
  statusSteps: {
    width: '100%',
    marginTop: 24,
    paddingHorizontal: 8,
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 0,
    height: 48,
  },
  stepIconColumn: {
    alignItems: 'center',
    marginRight: 16,
    width: 24,
  },
  stepLine: {
    width: 2,
    height: 24,
    marginTop: 4,
    borderRadius: 1,
  },
  stepText: {
    fontSize: 15,
    marginTop: 2,
    flex: 1,
  },
  // Button & Divider
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: COLORS.lightGray,
    marginVertical: 24,
  },
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: COLORS.lightGray,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
});