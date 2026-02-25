import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';

const COLORS = {
  primary: '#8C6E63',
  accent: '#FFC107',
  background: '#F5F5F5',
  text: '#333333',
  lightGray: '#E0E0E0',
  white: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.5)',
};

interface WifiNetwork {
  ssid: string;
  rssi: number; // Signal strength
}

export default function SelectNetworkScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<WifiNetwork | null>(null);
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [manualSsid, setManualSsid] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const fetchNetworks = async () => {
    setIsLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch('http://192.168.4.1/networks', { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Device responded with status: ${response.status}`);
      
      const data: WifiNetwork[] = await response.json();
      if (!Array.isArray(data)) throw new Error('Received invalid data format from device.');

      // Filter out duplicates or empty SSIDs if necessary
      const uniqueNetworks = data.filter((v, i, a) => a.findIndex(t => (t.ssid === v.ssid)) === i && v.ssid.length > 0);

      setNetworks(uniqueNetworks.sort((a, b) => b.rssi - a.rssi));
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.error("Fetch Error:", e);
      if (e.name === 'AbortError') {
        setError('Request timed out. Ensure you are connected to "PawFeeds_Setup" Wi-Fi and try again.');
      } else {
        setError('Failed to fetch networks. Please try again or use Manual Entry.');
      }
      setNetworks([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNetworks();
  }, []);

  const handleNetworkSelect = (network: WifiNetwork) => {
    setSelectedNetwork(network);
    setIsManualEntry(false);
    setIsModalVisible(true);
  };

  const handleManualEntry = () => {
    setSelectedNetwork(null);
    setIsManualEntry(true);
    setIsModalVisible(true);
  };
  
  const handleConnect = async () => {
    const ssid = isManualEntry ? manualSsid : selectedNetwork?.ssid;
    if (!ssid || !password) {
      Alert.alert('Details Required', 'Please provide the network name and password.');
      return;
    }
    if (!user) {
      Alert.alert('Authentication Error', 'You must be logged in to provision a device.');
      return;
    }
    
    setIsConnecting(true);

    try {
      // 1. Construct payload
      const payload = `ssid=${encodeURIComponent(ssid)}&pass=${encodeURIComponent(password)}&uid=${encodeURIComponent(user.uid)}`;

      // 2. Create a fetch promise
      const request = fetch('http://192.168.4.1/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload,
      });

      // 3. Create a timeout promise (5 seconds)
      // If the device reboots instantly, the fetch might hang or fail.
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );

      // 4. Race them
      await Promise.race([request, timeout]);

      // If we get here without error, assume success
      navigateToComplete();

    } catch (error) {
      console.log('Pairing request finished with error/interruption:', error);
      
      // CRITICAL FIX: 
      // The ESP32 reboots ~1.5s after receiving data, often breaking the HTTP response connection.
      // A "Network request failed" here usually means SUCCESS (device rebooted to connect to WiFi).
      // We proceed to the complete screen to let the Cloud Function verify the connection.
      navigateToComplete();
    } finally {
      setIsConnecting(false);
    }
  };

  const navigateToComplete = () => {
    setIsModalVisible(false);
    setPassword('');
    setManualSsid('');
    // Use replace to prevent going back to the selection screen during setup
    router.replace('/(provisioning)/complete');
  };

  const getSignalIcon = (rssi: number): React.ComponentProps<typeof MaterialCommunityIcons>['name'] => {
    if (rssi > -60) return 'wifi-strength-4';
    if (rssi > -70) return 'wifi-strength-3';
    if (rssi > -80) return 'wifi-strength-2';
    return 'wifi-strength-1';
  };

  const closeModal = () => {
    setIsModalVisible(false);
    setPassword('');
    setManualSsid('');
    setIsPasswordVisible(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Step 2: Connect to Your Wi-Fi' }} />

      <Modal
        animationType="fade"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {isManualEntry ? 'Enter Network Details' : `Enter password for "${selectedNetwork?.ssid}"`}
            </Text>
            {isManualEntry && (
              <TextInput
                style={styles.input}
                placeholder="Network Name (SSID)"
                value={manualSsid}
                onChangeText={setManualSsid}
                autoCapitalize="none"
              />
            )}
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!isPasswordVisible}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setIsPasswordVisible((prev) => !prev)}>
                <MaterialCommunityIcons
                  name={isPasswordVisible ? 'eye-off' : 'eye'}
                  size={24}
                  color={COLORS.text}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={closeModal}
                disabled={isConnecting}>
                <Text style={[styles.modalButtonText, styles.cancelButtonText]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.connectButton]}
                onPress={handleConnect}
                disabled={isConnecting}>
                {isConnecting ? (
                  <ActivityIndicator color={COLORS.text} />
                ) : (
                  <Text style={[styles.modalButtonText, styles.connectButtonText]}>Connect</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      <View style={styles.headerContainer}>
        <Text style={styles.title}>Select Network</Text>
        <Text style={styles.subtitle}>
          Choose your home Wi-Fi network from the list discovered by your feeder.
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loaderText}>Scanning for networks...</Text>
        </View>
      ) : error ? (
        <View style={styles.loaderContainer}>
            <MaterialCommunityIcons name="wifi-off" size={48} color={COLORS.lightGray} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchNetworks}>
                <Text style={styles.retryButtonText}>Scan Again</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.footerButton, {marginTop: 30}]} onPress={handleManualEntry}>
               <Text style={styles.footerButtonText}>Or Enter Manually</Text>
            </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={networks}
          keyExtractor={(item, index) => item.ssid + index}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.networkItem} onPress={() => handleNetworkSelect(item)}>
              <MaterialCommunityIcons name={getSignalIcon(item.rssi)} size={24} color={COLORS.primary} />
              <Text style={styles.networkSsid}>{item.ssid}</Text>
            </TouchableOpacity>
          )}
          ListFooterComponent={
            <View style={styles.footerButtons}>
              <TouchableOpacity style={styles.footerButton} onPress={fetchNetworks}>
                <MaterialCommunityIcons name="refresh" size={20} color={COLORS.primary} />
                <Text style={styles.footerButtonText}>Scan Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.footerButton} onPress={handleManualEntry}>
                <MaterialCommunityIcons name="plus" size={20} color={COLORS.primary} />
                <Text style={styles.footerButtonText}>Join a Hidden Network</Text>
              </TouchableOpacity>
            </View>
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerContainer: { padding: 24, paddingBottom: 16 },
  title: { fontSize: 26, fontWeight: 'bold', color: COLORS.text },
  subtitle: { fontSize: 16, color: '#666', marginTop: 8 },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loaderText: { marginTop: 16, color: '#666', fontSize: 16 },
  errorText: { fontSize: 16, color: 'red', textAlign: 'center', marginBottom: 20, marginTop: 10 },
  retryButton: { backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 30, borderRadius: 8 },
  retryButtonText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' },
  listContent: { paddingHorizontal: 24, paddingBottom: 24 },
  networkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2
  },
  networkSsid: { flex: 1, marginLeft: 16, fontSize: 16, fontWeight: '600', color: COLORS.text },
  footerButtons: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray,
    paddingTop: 24,
  },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  footerButtonText: {
    marginLeft: 12,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 16,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    borderRadius: 12,
    marginBottom: 16,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
  },
  eyeIcon: {
    padding: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 12
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.lightGray,
  },
  connectButton: {
    backgroundColor: COLORS.accent,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButtonText: {
    color: '#555',
  },
  connectButtonText: {
    color: COLORS.text,
  },
});