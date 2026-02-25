import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebaseConfig';

const COLORS = {
  primary: '#8C6E63',
  background: '#F5F5F5',
  white: '#FFFFFF',
  text: '#333333',
  lightGray: '#E0E0E0',
  secondaryText: '#666666',
  danger: '#D32F2F',
  overlay: 'rgba(0,0,0,0.5)'
};

type FilterType = '7_days' | '30_days' | 'all';

interface FeedLog {
  id: string;
  type: 'manual' | 'scheduled';
  amount: number;
  bowlNumber: number;
  petName: string;
  timestamp: Timestamp;
}

export default function LogsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [logs, setLogs] = useState<FeedLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feederId, setFeederId] = useState<string | null>(null);
  
  // Filter State
  const [filterType, setFilterType] = useState<FilterType>('7_days');
  const [isFilterVisible, setFilterVisible] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // 1. Fetch Feeder ID once
  useEffect(() => {
    const getFeeder = async () => {
      if (!user) return;
      try {
        const feedersRef = collection(db, 'feeders');
        const qFeeder = query(feedersRef, where('owner_uid', '==', user.uid));
        const feederSnap = await getDocs(qFeeder);
        
        if (!feederSnap.empty) {
          setFeederId(feederSnap.docs[0].id);
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error finding feeder:", error);
        setIsLoading(false);
      }
    };
    getFeeder();
  }, [user]);

  // 2. Fetch Logs when FeederID or Filter changes
  useEffect(() => {
    const fetchLogs = async () => {
      if (!feederId) return;
      
      setIsLoading(true);
      try {
        const historyRef = collection(db, 'feeders', feederId, 'history');
        let qHistory;

        // Apply Date Filters
        if (filterType !== 'all') {
          const now = new Date();
          const daysToSubtract = filterType === '7_days' ? 7 : 30;
          const startDate = new Date(now.setDate(now.getDate() - daysToSubtract));
          
          qHistory = query(
            historyRef, 
            where('timestamp', '>=', Timestamp.fromDate(startDate)),
            orderBy('timestamp', 'desc')
          );
        } else {
          qHistory = query(historyRef, orderBy('timestamp', 'desc'));
        }

        const historySnap = await getDocs(qHistory);
        const fetchedLogs = historySnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as FeedLog));

        setLogs(fetchedLogs);
      } catch (error) {
        console.error("Error fetching logs:", error);
        Alert.alert("Error", "Could not fetch logs.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();
  }, [feederId, filterType]);

  // --- DELETE FUNCTION ---
  const handleDelete = (logId: string) => {
    Alert.alert(
      "Delete Entry",
      "Are you sure you want to delete this feeding log?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            if (!feederId) return;
            try {
              // Optimistic Update
              setLogs(prev => prev.filter(l => l.id !== logId));
              
              // Delete from Firestore
              await deleteDoc(doc(db, 'feeders', feederId, 'history', logId));
            } catch (error) {
              console.error("Delete error:", error);
              Alert.alert("Error", "Failed to delete log.");
              // Re-fetch if fail to ensure UI sync
              // fetchLogs(); // (Optional: simplified for this snippet)
            }
          }
        }
      ]
    );
  };

  // --- EXPORT FUNCTION (PDF) ---
  const handleExport = async () => {
    if (logs.length === 0) {
      Alert.alert("No Data", "There are no logs to export.");
      return;
    }
    
    setIsExporting(true);
    try {
      // Generate HTML for PDF
      const rows = logs.map(log => {
        const date = log.timestamp?.toDate();
        return `
          <tr>
            <td>${date.toLocaleDateString()} ${date.toLocaleTimeString()}</td>
            <td>${log.petName} (Bowl ${log.bowlNumber})</td>
            <td>${log.type}</td>
            <td>${log.amount}g</td>
          </tr>
        `;
      }).join('');

      const html = `
        <html>
          <head>
            <style>
              body { font-family: Helvetica, Arial, sans-serif; padding: 20px; }
              h1 { color: #8C6E63; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; color: #333; }
            </style>
          </head>
          <body>
            <h1>PawFeeds Feeding History</h1>
            <p>Report generated on ${new Date().toLocaleString()}</p>
            <table>
              <tr>
                <th>Time</th>
                <th>Pet</th>
                <th>Type</th>
                <th>Amount</th>
              </tr>
              ${rows}
            </table>
          </body>
        </html>
      `;

      // Create PDF
      const { uri } = await Print.printToFileAsync({ html });
      
      // Share PDF
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });

    } catch (error) {
      console.error("Export error:", error);
      Alert.alert("Export Failed", "Could not generate the report.");
    } finally {
      setIsExporting(false);
    }
  };

  const renderItem = ({ item }: { item: FeedLog }) => {
    const date = item.timestamp?.toDate ? item.timestamp.toDate() : new Date();
    const formattedDate = date.toLocaleDateString();
    const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={styles.logCard}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons 
            name={item.type === 'scheduled' ? 'clock-outline' : 'gesture-tap'} 
            size={24} 
            color={COLORS.primary} 
          />
        </View>
        <View style={styles.logDetails}>
          <Text style={styles.logTitle}>{`Bowl ${item.bowlNumber} - ${item.petName}`}</Text>
          <Text style={styles.logSubtitle}>{`${formattedDate} at ${formattedTime}`}</Text>
        </View>
        
        {/* Right side actions */}
        <View style={styles.actionsContainer}>
          <View style={styles.amountContainer}>
             <Text style={styles.amountText}>{item.amount}g</Text>
          </View>
          <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
            <MaterialCommunityIcons name="trash-can-outline" size={22} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Mapping readable names for filter
  const getFilterName = (type: FilterType) => {
    switch(type) {
      case '7_days': return 'Last 7 Days';
      case '30_days': return 'Last 30 Days';
      case 'all': return 'All Time';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={28} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>History</Text>
        
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleExport} disabled={isExporting} style={styles.actionButton}>
            {isExporting ? (
               <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
               <MaterialCommunityIcons name="download-outline" size={26} color={COLORS.primary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setFilterVisible(true)} style={[styles.actionButton, { marginLeft: 10 }]}>
            <MaterialCommunityIcons name="filter-variant" size={26} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Active Filter Indicator */}
      <View style={styles.filterIndicator}>
        <Text style={styles.filterText}>Showing: {getFilterName(filterType)}</Text>
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="history" size={48} color={COLORS.lightGray} />
              <Text style={styles.emptyText}>No logs found for this period.</Text>
            </View>
          }
        />
      )}

      {/* Filter Modal */}
      <Modal
        visible={isFilterVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setFilterVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Filter Logs</Text>
            
            <TouchableOpacity 
              style={[styles.filterOption, filterType === '7_days' && styles.filterActive]}
              onPress={() => { setFilterType('7_days'); setFilterVisible(false); }}
            >
              <Text style={[styles.filterOptionText, filterType === '7_days' && styles.filterActiveText]}>Last 7 Days</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.filterOption, filterType === '30_days' && styles.filterActive]}
              onPress={() => { setFilterType('30_days'); setFilterVisible(false); }}
            >
              <Text style={[styles.filterOptionText, filterType === '30_days' && styles.filterActiveText]}>Last 30 Days</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.filterOption, filterType === 'all' && styles.filterActive]}
              onPress={() => { setFilterType('all'); setFilterVisible(false); }}
            >
              <Text style={[styles.filterOptionText, filterType === 'all' && styles.filterActiveText]}>All Time</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setFilterVisible(false)}
            >
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // Header
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingVertical: 16, 
    backgroundColor: COLORS.white, 
    borderBottomWidth: 1, 
    borderBottomColor: COLORS.lightGray 
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary },
  backButton: { padding: 4 },
  headerActions: { flexDirection: 'row' },
  actionButton: { padding: 4 },

  // Filter Indicator
  filterIndicator: {
    backgroundColor: '#EFEFEF',
    paddingVertical: 8,
    paddingHorizontal: 20,
    alignItems: 'center'
  },
  filterText: { color: COLORS.secondaryText, fontSize: 12, fontWeight: '600' },

  // List
  listContent: { padding: 20 },
  logCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: COLORS.white, 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 12, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 1 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 3, 
    elevation: 2 
  },
  iconContainer: { width: 40, alignItems: 'center' },
  logDetails: { flex: 1, paddingHorizontal: 10 },
  logTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  logSubtitle: { fontSize: 14, color: COLORS.secondaryText, marginTop: 4 },
  
  actionsContainer: { alignItems: 'flex-end' },
  amountContainer: { backgroundColor: '#F0EAE8', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginBottom: 8 },
  amountText: { color: COLORS.primary, fontWeight: 'bold' },
  deleteButton: { padding: 4 },

  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: COLORS.secondaryText, marginTop: 16, fontSize: 16 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '80%', backgroundColor: COLORS.white, borderRadius: 16, padding: 24, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 20 },
  filterOption: { width: '100%', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EEE', alignItems: 'center' },
  filterActive: { backgroundColor: '#F0EAE8', borderRadius: 8, borderBottomWidth: 0 },
  filterOptionText: { fontSize: 16, color: COLORS.text },
  filterActiveText: { color: COLORS.primary, fontWeight: 'bold' },
  closeButton: { marginTop: 20, padding: 10 },
  closeButtonText: { color: COLORS.secondaryText, fontWeight: '600' },
});