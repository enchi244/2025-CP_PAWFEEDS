import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { auth } from '../../firebaseConfig';

const COLORS = {
  primary: '#8C6E63',
  accent: '#FFC107',
  background: '#F5F5F5',
  text: '#333333',
  lightGray: '#E0E0E0',
  white: '#FFFFFF',
};

export default function GetStartedScreen() {
  const router = useRouter();
  const { authStatus } = useAuth();

  const handleCancel = async () => {
    // If the user already has a feeder, "Cancel" implies returning to the dashboard.
    if (authStatus === 'authenticated_with_feeder') {
      router.replace('/(tabs)');
      return;
    }

    // If the user has NO feeder, "Cancel" implies exiting the flow.
    // Since they cannot access the app without a device, we log them out.
    try {
      await signOut(auth);
      router.replace('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Add Your Feeder' }} />
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons
            name="wifi-plus"
            size={120}
            color={COLORS.primary}
          />
        </View>
        <Text style={styles.title}>Let&apos;s Connect Your Feeder</Text>
        <Text style={styles.instructions}>
          Before we begin, please make sure your PawFeeds device is plugged into
          a power source and the indicator light is blinking.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/(provisioning)/connect-to-feeder')}
        >
          <Text style={styles.buttonText}>Get Started</Text>
        </TouchableOpacity>

        {/* Show the Cancel button if the user is authenticated.
          Behavior adapts based on whether they already have a device.
        */}
        {(authStatus === 'authenticated_with_feeder' || authStatus === 'authenticated_no_feeder') && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleCancel}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        )}
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
  secondaryButton: {
    marginTop: 16,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
});