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

      setNetworks(data.sort((a, b) => b.rssi - a.rssi));
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.error("Fetch Error:", e);
      if (e.name === 'AbortError') {
        setError('Request timed out. Ensure you are connected to "PawFeeds_Setup" Wi-Fi and try again.');
      } else {
        setError('Failed to fetch networks. Please try again.');
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
      const response = await fetch('http://192.168.4.1/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `ssid=${encodeURIComponent(ssid)}&pass=${encodeURIComponent(password)}&uid=${encodeURIComponent(user.uid)}`,
      });

      if (!response.ok) {
        throw new Error(`Device responded with status: ${response.status}`);
      }
      
      setIsModalVisible(false);
      setPassword('');
      setManualSsid('');
      router.replace('/(provisioning)/complete');

    } catch (error) {
      console.error('Pairing failed:', error);
      Alert.alert('Pairing Failed', 'Could not send credentials to the feeder. Please try again.');
    } finally {
      setIsConnecting(false);
    }
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
    setIsPasswordVisible(false); // Reset password visibility on close
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
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchNetworks}>
                <Text style={styles.retryButtonText}>Scan Again</Text>
            </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={networks}
          keyExtractor={(item) => item.ssid}
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
  errorText: { fontSize: 16, color: 'red', textAlign: 'center', marginBottom: 20 },
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
  },
  eyeIcon: {
    padding: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.lightGray,
    marginRight: 8,
  },
  connectButton: {
    backgroundColor: COLORS.accent,
    marginLeft: 8,
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