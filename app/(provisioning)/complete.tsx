import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext'; // ** FIX: Import useAuth **

const COLORS = {
  primary: '#8C6E63',
  accent: '#FFC107',
  background: '#F5F5F5',
  text: '#333333',
  white: '#FFFFFF',
  success: '#4CAF50',
};

export default function SetupCompleteScreen() {
  const router = useRouter();
  const { authStatus } = useAuth(); // ** FIX: Get auth status **

  // ** FIX: Initialize state based on current authStatus **
  const [isConfirmed, setIsConfirmed] = useState(
    authStatus === 'authenticated_with_feeder',
  );

  // ** FIX: Listen for changes to authStatus **
  useEffect(() => {
    if (authStatus === 'authenticated_with_feeder') {
      setIsConfirmed(true);
    }
  }, [authStatus]);

  const handleFinish = () => {
    // Replace the entire provisioning stack with the main tabs layout
    router.replace('/(tabs)');
  };

  // ** FIX: Show a loading screen while waiting for confirmation **
  if (!isConfirmed) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Finalizing Setup...' }} />
        <View style={styles.content}>
          <View style={[styles.iconContainer, { backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 }]}>
            <ActivityIndicator size={120} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Finalizing Connection...</Text>
          <Text style={styles.instructions}>
            Please wait. Your phone is reconnecting to your home Wi-Fi and
            waiting for the PawFeeds device to come online. This can take up to a
            minute.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ** Original screen, shown only *after* confirmation **
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Setup Complete!' }} />
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons
            name="check-decagram"
            size={120}
            color={COLORS.success}
          />
        </View>
        <Text style={styles.title}>All Set!</Text>
        <Text style={styles.instructions}>
          Your PawFeeds device is now online and connected to your account.
        </Text>
        <TouchableOpacity style={styles.button} onPress={handleFinish}>
          <Text style={styles.buttonText}>Go to Dashboard</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconContainer: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  instructions: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
});