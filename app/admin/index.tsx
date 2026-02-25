import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';

const COLORS = {
  primary: '#2C3E50', // Darker, more "Admin-like" color
  accent: '#E74C3C',
  background: '#ECF0F1',
  white: '#FFFFFF',
  text: '#34495E'
};

// Admin Menu Item Component
const AdminCard = ({ title, icon, subtitle, onPress }: any) => (
  <TouchableOpacity style={styles.card} onPress={onPress}>
    <View style={styles.cardIcon}>
      <MaterialCommunityIcons name={icon} size={32} color={COLORS.primary} />
    </View>
    <View style={styles.cardContent}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
    </View>
    <MaterialCommunityIcons name="chevron-right" size={24} color="#BDC3C7" />
  </TouchableOpacity>
);

export default function AdminDashboard() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // Router in _layout will handle the redirect to login
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Admin Console</Text>
          <Text style={styles.headerSubtitle}>PawFeeds Management System</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
           <MaterialCommunityIcons name="logout" size={24} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Database Management</Text>
        
        <AdminCard 
          title="Breed Database" 
          subtitle="Manage dog breeds, weights & presets"
          icon="dog"
          onPress={() => router.push('/admin/breeds')} // We will build this next
        />

        <Text style={styles.sectionTitle}>Support & Diagnostics</Text>

        <AdminCard 
        title="Device Inspector" 
        subtitle="Lookup feeder status by ID or User Email"
        icon="chip"
        onPress={() => router.push('/admin/device-inspector')} 
        />
        
        <AdminCard 
        title="User Management" 
        subtitle="View active users and permissions"
        icon="account-group"
        onPress={() => router.push('/admin/users')}
        />

        {/* Removed System / Firmware OTA Section */}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.primary,
    padding: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.white },
  headerSubtitle: { fontSize: 14, color: '#BDC3C7', marginTop: 4 },
  logoutButton: { padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8 },
  content: { padding: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#95A5A6', marginTop: 24, marginBottom: 8, textTransform: 'uppercase' },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardIcon: {
    width: 50,
    height: 50,
    backgroundColor: '#F4F6F7',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  cardSubtitle: { fontSize: 12, color: '#7F8C8D', marginTop: 2 },
});