import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const PairingScreen = () => {
  const router = useRouter();
  const { ssid, uid } = useLocalSearchParams<{ ssid: string; uid: string }>();
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handlePairDevice = async () => {
    if (!password) {
      Alert.alert('Password Required', 'Please enter the password for the Wi-Fi network.');
      return;
    }
    setIsLoading(true);

    try {
      // ** FIX: Replaced placeholder logic with a real API call to send credentials **
      const response = await fetch('http://192.168.4.1/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        // Encode the data in the required format
        body: `ssid=${encodeURIComponent(ssid)}&pass=${encodeURIComponent(password)}&uid=${encodeURIComponent(uid)}`,
      });

      if (!response.ok) {
        throw new Error(`Device responded with status: ${response.status}`);
      }
      
      // If successful, the ESP32 will restart. We navigate to the completion screen.
      router.replace('/(provisioning)/complete');

    } catch (error) {
      console.error('Pairing failed:', error);
      Alert.alert('Pairing Failed', 'Could not send credentials to the feeder. Please ensure you are still connected to the "PawFeeds_Setup" Wi-Fi and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Step 3: Enter Wi-Fi Password</Text>
      <Text style={styles.subtitle}>
        Enter the password for <Text style={styles.ssidText}>{ssid}</Text>
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
      />

      {isLoading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <TouchableOpacity style={styles.button} onPress={handlePairDevice}>
          <Text style={styles.buttonText}>Connect</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
  },
  ssidText: {
    fontWeight: 'bold',
    color: '#000',
  },
  input: {
    height: 50,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 20,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007bff',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default PairingScreen;