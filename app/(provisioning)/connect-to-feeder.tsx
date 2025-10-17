import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Linking, Platform, StyleSheet, Text, ToastAndroid, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  primary: '#8C6E63',
  accent: '#FFC107',
  background: '#F5F5F5',
  text: '#333333',
  lightGray: '#E0E0E0',
  white: '#FFFFFF',
};

export default function ConnectToFeederScreen() {
  const router = useRouter();

  const openWifiSettings = async () => {
    try {
      if (Platform.OS === 'ios') {
        await Linking.openURL('App-Prefs:WIFI');
      } else {
        // This is the intent for Android Wi-Fi settings
        await Linking.sendIntent('android.settings.WIFI_SETTINGS');
      }
    } catch (error) {
      console.error('Failed to open Wi-Fi settings:', error);
      ToastAndroid.show('Could not open Wi-Fi settings automatically.', ToastAndroid.LONG);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Step 1: Connect to Feeder' }} />
      <View style={styles.content}>
        <View style={styles.instructionCard}>
          <View style={styles.stepHeader}>
            <MaterialCommunityIcons name="wifi-arrow-right" size={32} color={COLORS.primary} />
            <Text style={styles.title}>Connect to the Feeder&apos;s Wi-Fi</Text>
          </View>

          <View style={styles.step}>
            <Text style={styles.stepNumber}>1</Text>
            <Text style={styles.stepText}>
              Open your phone&apos;s Wi-Fi settings using the button below.
            </Text>
          </View>
          <TouchableOpacity style={styles.settingsButton} onPress={openWifiSettings}>
            <Text style={styles.settingsButtonText}>Open Wi-Fi Settings</Text>
          </TouchableOpacity>

          <View style={styles.step}>
            <Text style={styles.stepNumber}>2</Text>
            <Text style={styles.stepText}>
              Connect to the network named:
            </Text>
          </View>
          <View style={styles.networkNameBox}>
            <Text style={styles.networkNameText}>PawFeeds-XXXX</Text>
          </View>

          <View style={styles.step}>
            <Text style={styles.stepNumber}>3</Text>
            <Text style={styles.stepText}>
              Return to this app after connecting.
            </Text>
          </View>
          <Text style={styles.noteText}>
            Your phone might warn you about &quot;No Internet.&quot; This is expected.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/(provisioning)/select-network')}>
          <Text style={styles.buttonText}>I&apos;m Connected</Text>
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
    justifyContent: 'space-between',
    padding: 24,
  },
  instructionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
    paddingBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginLeft: 12,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  stepNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
    backgroundColor: COLORS.lightGray,
    width: 28,
    height: 28,
    borderRadius: 14,
    textAlign: 'center',
    lineHeight: 28,
    marginRight: 12,
  },
  stepText: {
    flex: 1,
    fontSize: 16,
    color: '#555',
    lineHeight: 24,
  },
  settingsButton: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginVertical: 8,
    marginHorizontal: 40,
  },
  settingsButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  networkNameBox: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginVertical: 8,
    marginHorizontal: 40,
  },
  networkNameText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  noteText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 16,
  },
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
    marginTop: 24,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
});