import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Audio, AVPlaybackStatus, ResizeMode, Video } from 'expo-av';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { getDatabase, ref, serverTimestamp as rtdbServerTimestamp, set } from 'firebase/database';
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, Unsubscribe, where } from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  overlay: 'rgba(0, 0, 0, 0.5)',
};

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 40;

// ====================================================================================
// === CONFIGURATION: Update this value to match your container's max capacity in grams ===
// ====================================================================================
const MAX_CONTAINER_CAPACITY_GRAMS = 1000; // 1kg container

// --- Interfaces for our data models ---
interface Pet {
    id: string;
    name: string;
    recommendedPortion: number;
}

interface Schedule {
    id: string;
    petId: string;
    petName: string;
    time: string;
    bowlNumber: number;
    isEnabled: boolean;
}

interface BowlCardProps {
  bowlNumber: number;
  selectedPet: Pet | undefined;
  foodLevel: number;
  perMealPortion: number;
  onPressFeed: () => void;
  onPressFilter: () => void;
  streamUri: string | null;
  isActive: boolean;
}

const BowlCard: React.FC<BowlCardProps> = ({ bowlNumber, selectedPet, foodLevel, perMealPortion, onPressFeed, onPressFilter, streamUri, isActive }) => {
    const isUnassigned = !selectedPet;
    const videoRef = useRef<Video>(null);
    const [showBuffering, setShowBuffering] = useState(true);

    useEffect(() => {
        const managePlayback = async () => {
            if (videoRef.current) {
                try {
                    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
                    if (isActive && streamUri) {
                        setShowBuffering(true); // Show spinner when we start loading a new stream
                        console.log(`[Video Player Bowl ${bowlNumber}] Attempting to load URI: ${streamUri}`);
                        await videoRef.current.loadAsync({ uri: streamUri }, { shouldPlay: true });
                    } else {
                        await videoRef.current.unloadAsync();
                    }
                } catch (error) {
                    console.error(`[Video Player Bowl ${bowlNumber}] Error managing playback:`, error);
                    setShowBuffering(false);
                }
            }
        };

        managePlayback();

        return () => {
            if (videoRef.current) {
                videoRef.current.unloadAsync();
            }
        };
    }, [isActive, streamUri, bowlNumber]);

    const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
        if (!status.isLoaded) {
            if (status.error) {
                console.error(`[Video Player Bowl ${bowlNumber}] Playback Error:`, status.error);
            }
            setShowBuffering(false);
        } else {
            const isActuallyBuffering = status.isBuffering && !status.isPlaying;
            setShowBuffering(isActuallyBuffering);
        }
    };

    return (
      <View style={[styles.card, { width: CARD_WIDTH }]}>
        <View style={styles.cardHeader}>
          <TouchableOpacity onPress={onPressFilter} style={styles.cardTitleContainer}>
              <Text style={[styles.cardTitle, isUnassigned && { color: '#999' }]}>{`Bowl ${bowlNumber} - ${selectedPet?.name || 'No Pet Scheduled'}`}</Text>
              <MaterialCommunityIcons name="chevron-down" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.onlineIndicator} />
        </View>
        <View style={styles.videoFeedPlaceholder}>
          {streamUri ? (
            <>
              <Video
                ref={videoRef}
                style={styles.video}
                source={{ uri: streamUri }}
                resizeMode={ResizeMode.COVER}
                shouldPlay={false} // Controlled by useEffect
                isLooping
                isMuted
                onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
              />
              {showBuffering && isActive && (
                <View style={styles.videoOverlay}>
                  <ActivityIndicator color={COLORS.white} />
                  <Text style={styles.videoOverlayText}>Connecting...</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.videoOverlay}>
                <MaterialCommunityIcons name="camera-off-outline" size={32} color="#999" />
                <Text style={styles.videoFeedText}>Live Feed Unavailable</Text>
            </View>
          )}
        </View>
        <View style={styles.statusContainer}>
          <Text style={styles.statusLabel}>Food Level</Text>
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${foodLevel}%` }]} />
          </View>
          <Text style={styles.statusPercentage}>{foodLevel}%</Text>
        </View>
        <TouchableOpacity style={[styles.feedButton, isUnassigned && styles.disabledButton]} onPress={onPressFeed} disabled={isUnassigned}>
          <Text style={styles.feedButtonText}>Feed Now</Text>
        </TouchableOpacity>
        <Text style={styles.portionText}>
          {`Next meal portion: ${perMealPortion > 0 ? perMealPortion : '--'}g`}
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
  const { user } = useAuth();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [filters, setFilters] = useState({ bowl1: true, bowl2: true });

  const [pets, setPets] = useState<Pet[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  const [isFeedModalVisible, setIsFeedModalVisible] = useState(false);
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [selectedBowlForAction, setSelectedBowlForAction] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');

  const [isCustomFeedVisible, setIsCustomFeedVisible] = useState(false);
  const [selectedPetInBowl, setSelectedPetInBowl] = useState<{[bowlId: string]: string | undefined}>({});

  const [feederId, setFeederId] = useState<string | null>(null);
  const [streamUris, setStreamUris] = useState<{ [bowlId: string]: string | null }>({});
  const [containerWeight, setContainerWeight] = useState<number>(0);

  const bowlsConfig = [{ id: 1 }, { id: 2 }];

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const unsubscribes: Unsubscribe[] = [];

    const fetchFeederAndData = async () => {
      const feedersRef = collection(db, 'feeders');
      const q = query(feedersRef, where('owner_uid', '==', user.uid));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const currentFeederId = querySnapshot.docs[0].id;
        setFeederId(currentFeederId);

        // --- Real-time listener for feeder document (for container_weight) ---
        const feederDocRef = doc(db, 'feeders', currentFeederId);
        const feederUnsub = onSnapshot(feederDocRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setContainerWeight(data.container_weight || 0);
            }
        });
        unsubscribes.push(feederUnsub);


        const relayServerIp = '192.168.1.5';
        const relayServerPort = 8080;
        const baseStreamUrl = `http://${relayServerIp}:${relayServerPort}`;

        setStreamUris({
          '1': `${baseStreamUrl}/1/index.m3u8`,
          '2': `${baseStreamUrl}/2/index.m3u8`,
        });

        for (const bowl of bowlsConfig) {
          const url = `${baseStreamUrl}/stream/${bowl.id}`;
          console.log(`[App] Initiating stream for bowl ${bowl.id} at ${url}`);
          try {
            fetch(url).catch(err => console.error(`[App] Non-blocking fetch failed for bowl ${bowl.id}:`, err));
          } catch (error) {
            console.error(`[App] Error initiating stream for bowl ${bowl.id}:`, error);
          }
        }

        const petsRef = collection(db, 'feeders', currentFeederId, 'pets');
        const petsUnsub = onSnapshot(petsRef, (snapshot) => {
          setPets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pet)));
        });
        unsubscribes.push(petsUnsub);

        const schedulesRef = collection(db, 'feeders', currentFeederId, 'schedules');
        const schedulesUnsub = onSnapshot(schedulesRef, (snapshot) => {
          setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule)));
          setIsLoading(false);
        });
        unsubscribes.push(schedulesUnsub);
      } else {
        setIsLoading(false);
      }
    };

    fetchFeederAndData().catch(console.error);

    return () => unsubscribes.forEach(unsub => unsub());
  }, [user]);

  const foodLevelPercentage = useMemo(() => {
    if (containerWeight <= 0) return 0;
    const percentage = (containerWeight / MAX_CONTAINER_CAPACITY_GRAMS) * 100;
    return Math.min(100, Math.round(percentage)); // Ensure it doesn't go over 100%
  }, [containerWeight]);


  const petsByBowl = useMemo(() => {
    const bowlMap: { [bowlId: string]: Pet[] } = {};
    const addedPetIds: { [bowlId: string]: Set<string> } = {};

    schedules.forEach(schedule => {
      if (schedule.isEnabled && schedule.petId && schedule.bowlNumber) {
        if (!bowlMap[schedule.bowlNumber]) {
          bowlMap[schedule.bowlNumber] = [];
          addedPetIds[schedule.bowlNumber] = new Set();
        }

        const pet = pets.find(p => p.id === schedule.petId);
        if (pet && !addedPetIds[schedule.bowlNumber].has(pet.id)) {
          bowlMap[schedule.bowlNumber].push(pet);
          addedPetIds[schedule.bowlNumber].add(pet.id);
        }
      }
    });
    return bowlMap;
  }, [schedules, pets]);

  useEffect(() => {
    const newSelections = { ...selectedPetInBowl };
    let changed = false;
    bowlsConfig.forEach(bowl => {
        const petsForBowl = petsByBowl[bowl.id];
        if (petsForBowl && petsForBowl.length > 0 && !newSelections[bowl.id]) {
            newSelections[bowl.id] = petsForBowl[0].id;
            changed = true;
        }
        else if ((!petsForBowl || petsForBowl.length === 0) && newSelections[bowl.id]) {
            delete newSelections[bowl.id];
            changed = true;
        }
    });
    if (changed) {
        setSelectedPetInBowl(newSelections);
    }
  }, [petsByBowl, bowlsConfig]);

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
      { text: "Logout", style: "destructive", onPress: async () => {
        try {
            await signOut(auth);
            router.replace('/login');
        } catch (error) {
            console.error("Logout Error:", error);
            Alert.alert("Logout Failed", "An error occurred while logging out.");
        }
      }},
    ]);
  };

  const handleResetDevice = () => {
    handleMenuClose();
    Alert.alert(
      "Reset Device",
      "This will erase the feeder from your account and send a reset command to the device. Are you sure you want to proceed?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            if (!feederId || !user) {
              Alert.alert("Error", "Feeder or user not identified. Cannot reset.");
              return;
            }
            try {
              const rtdb = getDatabase();
              const commandPath = `commands/${feederId}`;
              await set(ref(rtdb, commandPath), {
                command: "reset_device",
                timestamp: rtdbServerTimestamp(),
              });

              const feederDocRef = doc(db, 'feeders', feederId);
              await deleteDoc(feederDocRef);

              await signOut(auth);
              router.replace("/login");

              Alert.alert("Success", "Device has been reset and removed from your account.");

            } catch (error) {
              console.error("Error resetting device:", error);
              Alert.alert("Error", "Could not complete the reset process. Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleAccountPress = () => {
    router.push("/account/account");
    handleMenuClose();
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
    setSelectedBowlForAction(bowlNumber);
    setIsCustomFeedVisible(false);
    setCustomAmount('');
    setIsFeedModalVisible(true);
  };

  const handleOpenFilterModal = (bowlNumber: number) => {
    setSelectedBowlForAction(bowlNumber);
    setIsFilterModalVisible(true);
  };

  const handleSelectPetForFilter = (petId: string) => {
      if (selectedBowlForAction) {
          setSelectedPetInBowl(prev => ({ ...prev, [selectedBowlForAction]: petId }));
      }
      setIsFilterModalVisible(false);
  };

  const handleDispenseFeed = async (amount: number) => {
    if (selectedBowlForAction === null || !amount || amount <= 0) {
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
      await set(ref(rtdb, commandPath), { command: 'feed', bowl: selectedBowlForAction, amount, timestamp: rtdbServerTimestamp() });
      Alert.alert('Success', `Dispensing ${amount}g from Bowl ${selectedBowlForAction}.`);
    } catch (error) {
      console.error("Error sending feed command:", error);
      Alert.alert('Error', 'Could not send feed command.');
    } finally {
      setIsFeedModalVisible(false);
      setSelectedBowlForAction(null);
      setCustomAmount('');
    }
  };

  const feedModalData = useMemo(() => {
    if (selectedBowlForAction === null) return null;
    const petId = selectedPetInBowl[selectedBowlForAction];
    if (!petId) return null;

    const pet = pets.find(p => p.id === petId);
    if (!pet) return null;

    const activeScheduleCount = activeSchedulesByPetId[pet.id] || 0;
    const perMealPortion = (pet.recommendedPortion && activeScheduleCount > 0) ? Math.round(pet.recommendedPortion / activeScheduleCount) : 0;

    return { pet, perMealPortion };
  }, [selectedBowlForAction, selectedPetInBowl, pets, activeSchedulesByPetId]);


  if (isLoading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleMenu}><MaterialCommunityIcons name="menu" size={28} color={COLORS.primary} /></TouchableOpacity>
        <Text style={styles.headerTitle}>PawFeeds</Text>
        <View style={{ width: 28 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={16} contentContainerStyle={styles.swiperContainer} decelerationRate="fast" snapToInterval={CARD_WIDTH + 20} snapToAlignment="start">
            {bowlsConfig.map((bowl, index) => {
                const selectedPetId = selectedPetInBowl[bowl.id];
                const selectedPet = pets.find(p => p.id === selectedPetId);
                const activeScheduleCount = selectedPet ? (activeSchedulesByPetId[selectedPet.id] || 0) : 0;
                const perMealPortion = (selectedPet && selectedPet.recommendedPortion && activeScheduleCount > 0) ? Math.round(selectedPet.recommendedPortion / activeScheduleCount) : 0;
                const streamUri = streamUris[bowl.id] || null;
                return (
                    <BowlCard
                        key={bowl.id}
                        bowlNumber={bowl.id}
                        selectedPet={selectedPet}
                        foodLevel={foodLevelPercentage}
                        perMealPortion={perMealPortion}
                        onPressFeed={() => handleOpenFeedModal(bowl.id)}
                        onPressFilter={() => handleOpenFilterModal(bowl.id)}
                        streamUri={streamUri}
                        isActive={index === activeIndex}
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
            <Text style={styles.noSchedulesText}>No feedings scheduled for the selected bowls.</Text>
          )}
        </View>
      </ScrollView>

      {/* Main Menu Modal */}
      <Modal animationType="fade" transparent={true} visible={isMenuVisible} onRequestClose={handleMenuClose} >
        <TouchableOpacity style={styles.modalOverlay} onPress={handleMenuClose} activeOpacity={1}>
          <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>Menu</Text>
            <TouchableOpacity style={styles.menuItem} onPress={handleAccountPress}><MaterialCommunityIcons name="account-circle-outline" size={24} color={COLORS.text} style={styles.menuIcon} /><Text style={styles.menuItemText}>Account</Text></TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('Coming Soon', 'Device provisioning will be available in a future update.')}><MaterialCommunityIcons name="plus-box-outline" size={24} color={COLORS.text} style={styles.menuIcon} /><Text style={styles.menuItemText}>Add Device</Text></TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleResetDevice}><MaterialCommunityIcons name="restart" size={24} color={COLORS.text} style={styles.menuIcon} /><Text style={styles.menuItemText}>Reset Device</Text></TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('Coming Soon', 'Manual and tutorials will be available here.')}><MaterialCommunityIcons name="book-open-outline" size={24} color={COLORS.text} style={styles.menuIcon} /><Text style={styles.menuItemText}>Manual</Text></TouchableOpacity>
            <TouchableOpacity style={styles.menuLogoutButton} onPress={handleLogout}><MaterialCommunityIcons name="logout" size={24} color={COLORS.danger} style={styles.menuIcon} /><Text style={styles.menuLogoutText}>Logout</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Feed Now Modal */}
      <Modal visible={isFeedModalVisible} transparent={true} animationType="fade" onRequestClose={() => setIsFeedModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setIsFeedModalVisible(false)} activeOpacity={1}>
            <TouchableOpacity activeOpacity={1} style={styles.selectionModalContent}>
                <View style={{padding: 2, alignItems: 'center', width: '100%'}}>
                <TouchableOpacity style={[styles.modalButton, !feedModalData?.perMealPortion && styles.disabledButton]} onPress={() => handleDispenseFeed(feedModalData?.perMealPortion || 0)} disabled={!feedModalData?.perMealPortion}>
                    <Text style={styles.modalButtonText}>{`Dispense Meal (${feedModalData?.perMealPortion || 0}g)`}</Text>
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

      {/* Pet Filter Modal */}
      <Modal visible={isFilterModalVisible} transparent={true} animationType="fade" onRequestClose={() => setIsFilterModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setIsFilterModalVisible(false)} activeOpacity={1}>
            <View style={styles.selectionModalContent}>
                <Text style={styles.modalTitle}>Select Pet to View</Text>
                <FlatList
                    data={petsByBowl[selectedBowlForAction!] || []}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.selectionItem} onPress={() => handleSelectPetForFilter(item.id)}>
                            <Text style={styles.selectionItemText}>{item.name}</Text>
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={styles.emptyListText}>No pets scheduled for this bowl.</Text>}
                />
            </View>
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
  onlineIndicator: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4CAF50' },
  videoFeedPlaceholder: { height: 180, backgroundColor: '#000000', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12, overflow: 'hidden' },
  video: { ...StyleSheet.absoluteFillObject },
  videoOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  videoOverlayText: { color: COLORS.white, marginTop: 8 },
  videoFeedText: { color: '#999', fontWeight: '500' },
  statusContainer: { marginBottom: 16 },
  statusLabel: { fontSize: 14, color: '#666', marginBottom: 6 },
  progressBarBackground: { height: 10, backgroundColor: COLORS.lightGray, borderRadius: 5 },
  progressBarFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 5 },
  statusPercentage: { textAlign: 'right', fontSize: 12, color: '#666', marginTop: 4 },
  feedButton: { backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
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
  cancelButton: { backgroundColor: 'transparent' },
  cancelButtonText: { color: COLORS.danger, fontWeight: '600' },
  unassignButton: { backgroundColor: COLORS.danger, borderWidth: 0},
  selectionModalContent: { backgroundColor: COLORS.white, borderRadius: 12, padding: 20, width: '85%', maxHeight: '60%' },
  selectionItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  selectionItemText: { fontSize: 18, color: COLORS.text, textAlign: 'center' },
  emptyListText: { textAlign: 'center', color: '#999', marginVertical: 20 },
});