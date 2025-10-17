import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = { primary: '#8C6E63', accent: '#FFC107', background: '#F5F5F5', text: '#333333', lightGray: '#E0E0E0', white: '#FFFFFF', danger: '#D32F2F', overlay: 'rgba(0, 0, 0, 0.4)' };

export default function ProvisioningScreen() {
    const router = useRouter();
    // Removed unused setIsloading variable to fix ESLint warning
    const [isLoading] = useState(false);

    const handleStartSetup = () => {
        Alert.alert('Setup Started', 'Navigating to the next step of device provisioning.');
        // TODO: Implement navigation to the next step, e.g., ConnectToDeviceScreen
    };

    const handleNoDevice = () => {
        // Corrected navigation path to the dashboard
        router.replace('/(tabs)');
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={handleNoDevice}>
                    <MaterialCommunityIcons name="arrow-left" size={28} color={COLORS.primary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Device Setup</Text>
                <View style={{ width: 28 }} />
            </View>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.content}>
                    <MaterialCommunityIcons name="wifi-plus" size={100} color={COLORS.primary} style={styles.icon} />
                    <Text style={styles.title}>Connect Your PawFeeds</Text>
                    <Text style={styles.subtitle}>
                        We&apos;ll guide you through connecting your smart feeder to your home Wi-Fi network. This process should take only a few minutes.
                    </Text>

                    <TouchableOpacity style={styles.primaryButton} onPress={handleStartSetup} disabled={isLoading}>
                        <Text style={styles.primaryButtonText}>
                            {isLoading ? 'Starting...' : 'Start Setup'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.secondaryButton} onPress={handleNoDevice}>
                        <Text style={styles.secondaryButtonText}>I&apos;ll do this later</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary },
    scrollContent: { flexGrow: 1 },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
    icon: { marginBottom: 20 },
    title: { fontSize: 28, fontWeight: 'bold', color: COLORS.primary, marginBottom: 10, textAlign: 'center' },
    subtitle: { fontSize: 16, color: COLORS.text, textAlign: 'center', marginBottom: 30 },
    primaryButton: { backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 16, width: '100%', alignItems: 'center', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    primaryButtonText: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
    secondaryButton: { paddingVertical: 16, width: '100%', alignItems: 'center' },
    secondaryButtonText: { fontSize: 16, color: COLORS.primary, fontWeight: '600' },
});