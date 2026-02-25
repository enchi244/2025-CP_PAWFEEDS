import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Audio } from 'expo-av';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { getDatabase, onValue, ref, serverTimestamp as rtdbServerTimestamp, set } from 'firebase/database';
import { addDoc, collection, deleteDoc, doc, serverTimestamp as firestoreServerTimestamp, getDocs, onSnapshot, query, Unsubscribe, where } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VLCPlayer } from 'react-native-vlc-media-player';
import { useAuth } from '../../context/AuthContext';
import { auth, db } from '../../firebaseConfig';

const COLORS = {
  primary: '#8C6E63',
  accent: '#FFC107',
  background: '#F5F5F5',
  text: '#333333',
  lightGray: '#E0E0E0',
  white: '#FFFFFF',
  danger: '#D32F2F',
  success: '#4CAF50',
  warning: '#FF9800',
  overlay: 'rgba(0, 0, 0, 0.5)',
  offline: '#9E9E9E',
};

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 40;

interface Pet {
  id: string;
  name: string;
  recommendedPortion: number;
  snackPortion?: number; 
  bowlNumber?: number;
}

interface Schedule {
  id: string;
  petId: string;
  petName: string;
  time: string;
  bowlNumber: number;
  isEnabled: boolean;
}

interface Feeder {
  id: string;
  [key: string]: any;
}

interface BowlStatus {
  isWaiting: boolean;
  amount?: number;
  petId?: string;
}

interface BowlCardProps {
  bowlNumber: number;
  selectedPet: Pet | undefined;
  // foodLevel prop removed from usage but kept in signature if passed from parent, 
  // or we can just ignore it since we aren't displaying it.
  foodLevel: number; 
  perMealPortion: number;
  onPressFeed: () => void;
  streamUri: string | null;
  isActive: boolean;
  isFeederOnline: boolean;
  bowlStatus: BowlStatus | undefined;
}

// [MODIFIED] BowlCard Component - Removed Food Level/Leftover Display
const BowlCard: React.FC<BowlCardProps> = ({ 
    bowlNumber, 
    selectedPet, 
    perMealPortion, 
    onPressFeed, 
    streamUri, 
    isActive,
    isFeederOnline,
    bowlStatus
}) => {
    const isUnassigned = !selectedPet;
    const isFeedDisabled = isUnassigned || !isFeederOnline;

    useEffect(() => {
        const setAudio = async () => {
            await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        };
        setAudio();
    }, []);

    const handleError = (error: any) => {
        if (isActive) {
          console.log(`[Stream Error Bowl ${bowlNumber}]`, error);
        }
    };

    return (
      <View style={[styles.card, { width: CARD_WIDTH }]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleContainer}>
              <Text style={[styles.cardTitle, isUnassigned && { color: '#999' }]}>
                {`Bowl ${bowlNumber} - ${selectedPet?.name || 'No Pet Assigned'}`}
              </Text>
          </View>
          <View style={[styles.onlineIndicator, { backgroundColor: isFeederOnline ? '#4CAF50' : COLORS.offline }]} />
        </View>

        <View style={styles.videoFeedPlaceholder}>
          {streamUri ? (
            <>
              {isActive && (
                <VLCPlayer
                  style={styles.video}
                  source={{ uri: streamUri }}
                  resizeMode="cover"
                  muted={true}
                  paused={false}
                  onError={handleError}
                  videoAspectRatio={`${16}:${9}`}
                />
              )}
            </>
          ) : (
            <View style={styles.videoOverlay}>
                <MaterialCommunityIcons name="camera-off-outline" size={32} color="#999" />
                <Text style={styles.videoFeedText}>Live Feed Unavailable</Text>
            </View>
          )}
        </View>

        {/* Status Container Removed Here */}

        <TouchableOpacity 
          style={[styles.feedButton, isFeedDisabled && styles.disabledButton]} 
          onPress={onPressFeed} 
          disabled={isFeedDisabled}
        >
          <Text style={styles.feedButtonText}>
            {isFeederOnline 
                ? (bowlStatus?.isWaiting 
                    ? `Feed Pending Meal (${bowlStatus.amount}g)` 
                    : (isUnassigned ? 'No Pet Assigned' : 'Feed Now')) 
                : 'Feeder Offline'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.portionText}>
          {`Next scheduled meal: ${perMealPortion > 0 ? perMealPortion : '--'}g`}
        </Text>
      </View>
    );
};

const formatScheduleTime = (timeString: string): string => {
    if (!timeString) return 'Invalid Time';
    const [hours, minutes] = timeString.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return 'Invalid Time';

    const date = new Date();
    date.setHours(hours, minutes);

    return date.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: true
    });
};

export default function DashboardScreen() {
  const router = useRouter();
  const { user, refreshUserData } = useAuth();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  
  const [allFeeders, setAllFeeders] = useState<Feeder[]>([]);
  const [feederId, setFeederId] = useState<string | null>(null);
  
  const [isFeederOnline, setIsFeederOnline] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [filters, setFilters] = useState({ bowl1: true, bowl2: true });

  const [pets, setPets] = useState<Pet[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  const [bowlStatuses, setBowlStatuses] = useState<{ [bowlId: string]: BowlStatus }>({});

  const [isFeedModalVisible, setIsFeedModalVisible] = useState(false);
  const [selectedBowlForAction, setSelectedBowlForAction] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [isCustomFeedVisible, setIsCustomFeedVisible] = useState(false);
  const [isResetSelectionVisible, setIsResetSelectionVisible] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const PUBLIC_HLS_SERVER_DOMAIN = 'workspherecbd.site';
  
  // --- DYNAMIC IP STATE ---
  const [streamUris, setStreamUris] = useState<{ [bowlId: string]: string | null }>({
    '1': null,
    '2': null,
  });

  // Keep tracking food levels for logic, even if not displayed
  const [foodLevels, setFoodLevels] = useState<{ [bowlId: string]: number }>({});
  const bowlsConfig = [{ id: 1 }, { id: 2 }];

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const fetchFeeders = async () => {
      try {
        const feedersRef = collection(db, 'feeders');
        const q = query(feedersRef, where('owner_uid', '==', user.uid));
        const querySnapshot = await getDocs(q);
        
        const fetchedFeeders = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setAllFeeders(fetchedFeeders);

        if (fetchedFeeders.length > 0) {
          if (!feederId || !fetchedFeeders.find(f => f.id === feederId)) {
            setFeederId(fetchedFeeders[0].id);
          }
        } else {
          setFeederId(null);
          setIsLoading(false); 
        }
      } catch (error) {
        console.error("Error fetching feeders:", error);
        setIsLoading(false);
      }
    };

    fetchFeeders();
  }, [user, refreshTrigger]);

  useEffect(() => {
    if (!feederId || !user) {
      return;
    }

    setIsLoading(true);
    const unsubscribes: Unsubscribe[] = [];
    const rtdbUnsubscribes: (() => void)[] = [];
    const rtdb = getDatabase();

    // 1. Listen for Firestore Data
    const feederDocRef = doc(db, 'feeders', feederId);
    const feederUnsub = onSnapshot(feederDocRef, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            setFoodLevels(data.foodLevels || { "1": 0, "2": 0 });
        } else {
            setIsFeederOnline(false);
        }
    }, (error) => {
        console.error("Feeder doc snapshot error:", error);
    });
    unsubscribes.push(feederUnsub);

    // 2. Listen for RTDB Status
    const statusRef = ref(rtdb, `feeders/${feederId}/status`);
    const statusUnsub = onValue(statusRef, (snapshot) => {
        const status = snapshot.val();
        setIsFeederOnline(status === 'online');
    });
    rtdbUnsubscribes.push(() => statusUnsub()); 

    // 3. Listen for Bowl Status
    const bowlStatusRef = ref(rtdb, `feeders/${feederId}/bowlStatus`);
    const bowlStatusUnsub = onValue(bowlStatusRef, (snapshot) => {
        if (snapshot.exists()) {
            setBowlStatuses(snapshot.val());
        } else {
            setBowlStatuses({});
        }
    });
    rtdbUnsubscribes.push(() => bowlStatusUnsub());

    // --- 4. NEW: DYNAMIC CAM IP LISTENER ---
    const camIpRef1 = ref(rtdb, `feeders/${feederId}/camIp1`);
    const camIpUnsub1 = onValue(camIpRef1, (snapshot) => {
        const ip = snapshot.val();
        setStreamUris(prev => ({
            ...prev,
            '1': ip ? `http://${ip}/stream` : `https://${PUBLIC_HLS_SERVER_DOMAIN}/hls/stream1.m3u8`
        }));
    });
    rtdbUnsubscribes.push(() => camIpUnsub1());

    const camIpRef2 = ref(rtdb, `feeders/${feederId}/camIp2`);
    const camIpUnsub2 = onValue(camIpRef2, (snapshot) => {
        const ip = snapshot.val();
        const mDNSFallback = `http://pawfeeds-cam-2.local/stream`; 
        setStreamUris(prev => ({
            ...prev,
            '2': ip ? `http://${ip}/stream` : mDNSFallback
        }));
    });
    rtdbUnsubscribes.push(() => camIpUnsub2());
    // ----------------------------------------

    const petsRef = collection(db, 'feeders', feederId, 'pets');
    const petsUnsub = onSnapshot(petsRef, (snapshot) => {
      setPets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pet)));
    });
    unsubscribes.push(petsUnsub);

    const schedulesRef = collection(db, 'feeders', feederId, 'schedules');
    const schedulesUnsub = onSnapshot(schedulesRef, (snapshot) => {
      setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule)));
      setIsLoading(false);
    });
    unsubscribes.push(schedulesUnsub);

    return () => {
        unsubscribes.forEach(unsub => unsub());
        rtdbUnsubscribes.forEach(unsub => unsub());
    };
  }, [feederId, user]);
  
  const assignedPetsByBowl = useMemo(() => {
    const bowlMap: { [bowlId: string]: Pet | undefined } = {};
    pets.forEach(pet => {
      if (pet.bowlNumber) {
        bowlMap[pet.bowlNumber] = pet;
      }
    });
    return bowlMap;
  }, [pets]);

  const activeSchedulesByPetId = useMemo(() => {
    const counts: { [petId: string]: number } = {};
    schedules.forEach(schedule => {
      if (schedule.isEnabled && schedule.petId) {
        counts[schedule.petId] = (counts[schedule.petId] || 0) + 1;
      }
    });
    return counts;
  }, [schedules]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / (CARD_WIDTH + 20));
    setActiveIndex(index);
  };

  const handleMenu = () => setIsMenuVisible(true);
  const handleMenuClose = () => setIsMenuVisible(false);

  const handleLogout = () => {
    handleMenuClose();
    Alert.alert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Logout", 
        style: "destructive", 
        onPress: async () => {
          try {
            try {
              await GoogleSignin.signOut();
            } catch (googleError) {
              console.log("Google Sign-Out skipped or failed:", googleError);
            }
            await signOut(auth);
          } catch (error) {
            console.error("Logout Error:", error);
            Alert.alert("Logout Failed", "An error occurred while logging out.");
          }
        }
      },
    ]);
  };

  const handleResetMenuPress = () => {
    handleMenuClose();
    if (allFeeders.length === 0) {
      Alert.alert("Error", "No devices found to reset.");
      return;
    }
    if (allFeeders.length > 1) {
      setIsResetSelectionVisible(true);
    } else {
      confirmResetDevice(allFeeders[0].id);
    }
  };

  const confirmResetDevice = (targetFeederId: string) => {
    setIsResetSelectionVisible(false);
    Alert.alert(
      "Reset Device",
      "This will erase the feeder from your account and send a reset command to the device. You will NOT be logged out. Are you sure you want to proceed?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => performResetDevice(targetFeederId),
        },
      ]
    );
  };

  const performResetDevice = async (targetFeederId: string) => {
    if (!targetFeederId || !user) {
      Alert.alert("Error", "Feeder or user not identified. Cannot reset.");
      return;
    }
    try {
      const rtdb = getDatabase();
      const commandPath = `commands/${targetFeederId}`;
      await set(ref(rtdb, commandPath), {
        command: "reset_device",
        timestamp: rtdbServerTimestamp(),
      });

      const feederDocRef = doc(db, 'feeders', targetFeederId);
      await deleteDoc(feederDocRef);

      if (refreshUserData) {
        await refreshUserData(); 
      }
      setRefreshTrigger(prev => prev + 1);
      Alert.alert("Success", "Device has been reset and removed from your account.");

    } catch (error) {
      console.error("Error resetting device:", error);
      Alert.alert("Error", "Could not complete the reset process. Please try again.");
    }
  };

  const handleAccountPress = () => {
    router.push("/account/account");
    handleMenuClose();
  };

  const handleManualPress = () => {
    handleMenuClose();
    router.push("/manual");
  };

  const toggleFilter = (bowl: 'bowl1' | 'bowl2') => {
    setFilters(prevFilters => ({ ...prevFilters, [bowl]: !prevFilters[bowl] }));
  };

  const filteredSchedules = useMemo(() => {
    return schedules.filter(schedule => {
        if (!schedule.isEnabled) return false;
        if (filters.bowl1 && schedule.bowlNumber === 1) return true;
        if (filters.bowl2 && schedule.bowlNumber === 2) return true;
        return false;
    }).sort((a, b) => a.time.localeCompare(b.time));
  }, [schedules, filters]);


  const handleOpenFeedModal = (bowlNumber: number) => {
    if (!isFeederOnline) {
        Alert.alert("Feeder Offline", "Cannot dispense food while the feeder is offline.");
        return;
    }
    if (!assignedPetsByBowl[bowlNumber]) {
         Alert.alert("No Pet Assigned", "Please schedule a pet to this bowl before using Feed Now.");
         return;
    }

    const status = bowlStatuses[bowlNumber];
    if (status?.isWaiting && status.amount) {
        const petName = pets.find(p => p.id === status.petId)?.name || 'your pet';
        
        Alert.alert(
            "Pending Meal",
            `This bowl is waiting for ${petName}. Do you want to feed the scheduled ${status.amount}g now?`,
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Feed Scheduled Amount", 
                    onPress: () => handleDispenseFeed(status.amount!, bowlNumber)
                }
            ]
        );
        return;
    }

    setSelectedBowlForAction(bowlNumber);
    setIsCustomFeedVisible(false);
    setCustomAmount('');
    setIsFeedModalVisible(true);
  };

  const feedModalData = useMemo(() => {
    if (selectedBowlForAction === null) return null;
    const pet = assignedPetsByBowl[selectedBowlForAction];
    if (!pet) return null;
    const snackPortion = pet.snackPortion || 15; 
    return { pet, snackPortion };
  }, [selectedBowlForAction, assignedPetsByBowl]);


  const handleDispenseFeed = async (amount: number, explicitBowlNumber?: number) => {
    const bowlToFeed = explicitBowlNumber ?? selectedBowlForAction;

    if (bowlToFeed === null || !amount || amount <= 0) {
        Alert.alert('Invalid Amount', 'Please provide a valid portion amount.');
        return;
    }
    if (!feederId) {
      Alert.alert('Error', 'Feeder not identified. Cannot send command.');
      return;
    }
    try {
      const rtdb = getDatabase();
      const commandPath = `commands/${feederId}`;
      await set(ref(rtdb, commandPath), { command: 'feed', bowl: bowlToFeed, amount, timestamp: rtdbServerTimestamp() });
      
      const petName = assignedPetsByBowl[bowlToFeed]?.name || 'Manual Override';
      
      await addDoc(collection(db, 'feeders', feederId, 'history'), {
           type: 'manual',
           amount: amount,
           bowlNumber: bowlToFeed,
           petName: petName,
           timestamp: firestoreServerTimestamp()
      });

      Alert.alert('Success', `Dispensing ${amount}g from Bowl ${bowlToFeed}.`);
    } catch (error) {
      console.error("Error sending feed command:", error);
      Alert.alert('Error', 'Could not send feed command.');
    } finally {
      setIsFeedModalVisible(false);
      setSelectedBowlForAction(null);
      setCustomAmount('');
    }
  };

  if (isLoading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleMenu}><MaterialCommunityIcons name="menu" size={28} color={COLORS.primary} /></TouchableOpacity>
        <Text style={styles.headerTitle}>PawFeeds</Text>
        <TouchableOpacity onPress={() => router.push('/logs')}>
              <MaterialCommunityIcons name="history" size={28} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={16} contentContainerStyle={styles.swiperContainer} decelerationRate="fast" snapToInterval={CARD_WIDTH + 20} snapToAlignment="start">
            {bowlsConfig.map((bowl, index) => {
                const selectedPet = assignedPetsByBowl[bowl.id];
                const activeScheduleCount = selectedPet ? (activeSchedulesByPetId[selectedPet.id] || 0) : 0;
                const perMealPortion = (selectedPet && selectedPet.recommendedPortion && activeScheduleCount > 0) ? Math.round(selectedPet.recommendedPortion / activeScheduleCount) : 0;
                const streamUri = streamUris[bowl.id] || null;
                const foodLevel = foodLevels[bowl.id] ?? 0;
                return (
                    <BowlCard
                        key={bowl.id}
                        bowlNumber={bowl.id}
                        selectedPet={selectedPet}
                        foodLevel={foodLevel}
                        perMealPortion={perMealPortion}
                        onPressFeed={() => handleOpenFeedModal(bowl.id)}
                        streamUri={streamUri}
                        isActive={index === activeIndex}
                        isFeederOnline={isFeederOnline}
                        bowlStatus={bowlStatuses[bowl.id]}
                    />
                );
            })}
          </ScrollView>
          <View style={styles.pagination}>
            {bowlsConfig.map((_, index) => (<View key={index} style={[styles.dot, index === activeIndex ? styles.activeDot : styles.inactiveDot]}/>))}
          </View>
        </View>

        <View style={styles.scheduleSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Today's Feedings</Text>
            <View style={styles.filterContainer}>
              <TouchableOpacity style={[styles.filterButton, filters.bowl1 && styles.filterButtonActive]} onPress={() => toggleFilter('bowl1')}><Text style={[styles.filterButtonText, filters.bowl1 && styles.filterButtonTextActive]}>Bowl 1</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.filterButton, filters.bowl2 && styles.filterButtonActive]} onPress={() => toggleFilter('bowl2')}><Text style={[styles.filterButtonText, filters.bowl2 && styles.filterButtonTextActive]}>Bowl 2</Text></TouchableOpacity>
            </View>
          </View>
          {filteredSchedules.length > 0 ? (
            filteredSchedules.map((schedule) => (
              <View style={styles.scheduleItem} key={schedule.id}>
                <Text style={styles.scheduleTime}>{formatScheduleTime(schedule.time)}</Text>
                <Text style={styles.scheduleDetails}>{`${schedule.petName} - Bowl ${schedule.bowlNumber}`}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.noSchedulesText}>No schedules scheduled for the selected bowls.</Text>
          )}
        </View>
      </ScrollView>

      {/* Main Menu Modal */}
      <Modal animationType="fade" transparent={true} visible={isMenuVisible} onRequestClose={handleMenuClose} >
        <TouchableOpacity style={styles.modalOverlay} onPress={handleMenuClose} activeOpacity={1}>
          <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>Menu</Text>
            <TouchableOpacity style={styles.menuItem} onPress={handleAccountPress}><MaterialCommunityIcons name="account-circle-outline" size={24} color={COLORS.text} style={styles.menuIcon} /><Text style={styles.menuItemText}>Account</Text></TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { handleMenuClose(); router.push('/(provisioning)'); }}><MaterialCommunityIcons name="plus-box-outline" size={24} color={COLORS.text} style={styles.menuIcon} /><Text style={styles.menuItemText}>Add Device</Text></TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleResetMenuPress}><MaterialCommunityIcons name="restart" size={24} color={COLORS.text} style={styles.menuIcon} /><Text style={styles.menuItemText}>Reset Device</Text></TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleManualPress}><MaterialCommunityIcons name="book-open-outline" size={24} color={COLORS.text} style={styles.menuIcon} /><Text style={styles.menuItemText}>Manual</Text></TouchableOpacity>
            <TouchableOpacity style={styles.menuLogoutButton} onPress={handleLogout}><MaterialCommunityIcons name="logout" size={24} color={COLORS.danger} style={styles.menuIcon} /><Text style={styles.menuLogoutText}>Logout</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Reset Device Selection Modal */}
      <Modal animationType="fade" transparent={true} visible={isResetSelectionVisible} onRequestClose={() => setIsResetSelectionVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setIsResetSelectionVisible(false)} activeOpacity={1}>
          <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>Select Device to Reset</Text>
            <Text style={styles.modalSubtitle}>Choose a device to remove from your account.</Text>
            <FlatList 
              data={allFeeders}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 300, width: '100%' }}
              renderItem={({ item, index }) => (
                <TouchableOpacity 
                  style={styles.menuItem} 
                  onPress={() => confirmResetDevice(item.id)}
                >
                  <MaterialCommunityIcons name="router-wireless" size={24} color={COLORS.primary} style={styles.menuIcon} />
                  <Text style={styles.menuItemText} numberOfLines={1}>
                    {item.name || `Feeder ${index + 1}`} <Text style={{fontSize: 12, color: '#999'}}>({item.id.slice(0, 5)}...)</Text>
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.cancelButton} onPress={() => setIsResetSelectionVisible(false)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Feed Now Modal */}
      <Modal visible={isFeedModalVisible} transparent={true} animationType="fade" onRequestClose={() => setIsFeedModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setIsFeedModalVisible(false)} activeOpacity={1}>
            <TouchableOpacity activeOpacity={1} style={styles.selectionModalContent}>
                <View style={{padding: 2, alignItems: 'center', width: '100%'}}>
                <TouchableOpacity style={[styles.modalButton, !feedModalData?.snackPortion && styles.disabledButton]} onPress={() => handleDispenseFeed(feedModalData?.snackPortion || 0)} disabled={!feedModalData?.snackPortion}>
                    <Text style={styles.modalButtonText}>{`Dispense Snack (${feedModalData?.snackPortion || 0}g)`}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.customFeedToggle} onPress={() => setIsCustomFeedVisible(!isCustomFeedVisible)}>
                    <Text style={styles.customFeedToggleText}>Custom Amount</Text>
                    <MaterialCommunityIcons name={isCustomFeedVisible ? "chevron-up" : "chevron-down"} size={24} color={COLORS.text} />
                </TouchableOpacity>
                {isCustomFeedVisible && (
                    <View style={styles.customFeedContainer}>
                        <TextInput style={styles.modalInput} placeholder="Input Amount Here" placeholderTextColor="#999" keyboardType="number-pad" value={customAmount} onChangeText={setCustomAmount} />
                        <TouchableOpacity style={[styles.modalButton, !customAmount && styles.disabledButton]} onPress={() => handleDispenseFeed(parseInt(customAmount, 10))} disabled={!customAmount}>
                            <Text style={styles.modalButtonText}>Dispense Custom</Text>
                        </TouchableOpacity>
                    </View>
                )}
                </View>
            </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.primary },
  scrollContainer: { paddingBottom: 20 },
  swiperContainer: { paddingHorizontal: 20, paddingTop: 20 },
  card: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 4, marginRight: 20 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitleContainer: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, marginRight: 10 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, flexShrink: 1 },
  onlineIndicator: { width: 10, height: 10, borderRadius: 5 },
  videoFeedPlaceholder: { height: 180, backgroundColor: '#000000', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12, overflow: 'hidden' },
  video: { ...StyleSheet.absoluteFillObject },
  videoOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  videoOverlayText: { color: COLORS.white, marginTop: 8 },
  videoFeedText: { color: '#999', fontWeight: '500' },
  // statusContainer and related styles removed since they are no longer used
  feedButton: { backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  disabledButton: { backgroundColor: COLORS.lightGray },
  feedButtonText: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  portionText: { textAlign: 'center', color: '#888', marginTop: 12, fontSize: 14, fontStyle: 'italic' },
  pagination: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  dot: { height: 8, borderRadius: 4, marginHorizontal: 4 },
  activeDot: { backgroundColor: COLORS.primary, width: 16 },
  inactiveDot: { backgroundColor: COLORS.lightGray, width: 8 },
  scheduleSection: { marginTop: 24, paddingHorizontal: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  filterContainer: { flexDirection: 'row' },
  filterButton: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: COLORS.lightGray, backgroundColor: COLORS.white, marginLeft: 8 },
  filterButtonActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterButtonText: { fontWeight: '600', color: COLORS.primary },
  filterButtonTextActive: { color: COLORS.white },
  scheduleItem: { backgroundColor: COLORS.white, borderRadius: 12, padding: 16, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scheduleTime: { fontSize: 22, fontWeight: 'bold', color: COLORS.text },
  scheduleDetails: { fontSize: 16, color: '#555', marginTop: 4 },
  noSchedulesText: { textAlign: 'center', color: '#999', marginTop: 20, fontStyle: 'italic' },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center' },
  menuContainer: { width: '80%', backgroundColor: COLORS.white, borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 5, elevation: 8 },
  menuTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.primary, marginBottom: 20, textAlign: 'center' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  menuItemText: { fontSize: 18, fontWeight: '500', color: COLORS.text, marginLeft: 15 },
  menuIcon: { width: 24, textAlign: 'center' },
  menuLogoutButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, marginTop: 20 },
  menuLogoutText: { fontSize: 18, fontWeight: '500', color: COLORS.danger, marginLeft: 15 },
  modalContent: { width: '85%', backgroundColor: COLORS.white, borderRadius: 16, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary, marginBottom: 16, textAlign: 'center' },
  modalSubtitle: { fontSize: 16, color: COLORS.text, marginBottom: 24, textAlign: 'center' },
  modalButton: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', width: '100%', marginBottom: 12 },
  modalButtonText: { fontSize: 16, fontWeight: 'bold', color: COLORS.white },
  modalDivider: { color: '#aaa', fontWeight: 'bold', marginVertical: 8 },
  modalInput: { width: '100%', backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.lightGray, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: COLORS.text, textAlign: 'center', marginVertical: 12 },
  customFeedToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.lightGray, marginVertical: 12 },
  customFeedToggleText: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  customFeedContainer: { width: '100%', alignItems: 'center' },
  cancelButton: { backgroundColor: 'transparent', marginTop: 10, alignSelf: 'center', padding: 10 },
  cancelButtonText: { color: COLORS.danger, fontWeight: '600', fontSize: 16 },
  unassignButton: { backgroundColor: COLORS.danger, borderWidth: 0},
  selectionModalContent: { backgroundColor: COLORS.white, borderRadius: 12, padding: 20, width: '85%', maxHeight: '60%' },
  selectionItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  selectionItemText: { fontSize: 18, color: COLORS.text, textAlign: 'center' },
  emptyListText: { textAlign: 'center', color: '#999', marginVertical: 20 },
});