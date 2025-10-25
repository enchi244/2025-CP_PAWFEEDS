import * as Notifications from 'expo-notifications';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { Alert, Platform } from 'react-native';
import { db } from '../firebaseConfig'; // Adjust this path if needed

/**
 * Registers the app for push notifications, gets the token,
 * and saves it to the user's feeder document in Firestore.
 * @param uid The Firebase user's UID.
 */
export const registerForPushNotificationsAsync = async (uid: string) => {
  // The check for Device.isDevice has been removed as requested to resolve the build error.
  // We will now rely on the app running on a physical device for the token to be valid.

  try {
    // --- 1. Request Permissions ---
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      Alert.alert('Failed to get push token for push notification!');
      return;
    }

    // --- 2. Get Expo Push Token ---
    const token = (await Notifications.getExpoPushTokenAsync({
      projectId: '1b09b532-3580-4573-b26a-5431b090252b', // Your EAS Project ID from app.json
    })).data;

    if (!token) {
      Alert.alert('Error', 'Failed to retrieve push token.');
      return;
    }

    // --- 3. Save Token to Firestore ---
    // Find the user's feeder document
    const feedersRef = collection(db, 'feeders');
    const q = query(feedersRef, where('owner_uid', '==', uid));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log('Notification Manager: No feeder found for user, cannot save token.');
      return; // No feeder to save token to yet
    }

    const feederDoc = querySnapshot.docs[0];
    const feederRef = doc(db, 'feeders', feederDoc.id);

    // Save the token
    await updateDoc(feederRef, {
      expoPushToken: token,
    });
    console.log('Push token saved to Firestore:', token);

    // --- 4. Set Android Notification Channel (optional but recommended) ---
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FFC107',
      });
    }

    // --- 5. Define Notification Actions ---
    await Notifications.setNotificationCategoryAsync('smartFeedAction', [
      {
        identifier: 'feedNow',
        buttonTitle: 'Feed Now',
        options: {
          opensAppToForeground: false, // Don't open the app, handle in background
        },
      },
    ]);

  } catch (error) {
    console.error('Error during push notification registration:', error);
    Alert.alert('Error', 'Could not register for push notifications.');
  }
};