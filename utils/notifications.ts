import messaging from '@react-native-firebase/messaging';
import { Alert } from 'react-native';
// Import native db instance
import { db } from '../firebaseConfig'; // Adjust this path if needed

/**
 * Registers the app for push notifications with FCM, gets the FCM token,
 * and saves it to the user's feeder document in Firestore.
 * @param uid The Firebase user's UID.
 */
export const registerForPushNotificationsAsync = async (uid: string) => {
  try {
    // --- 1. Request Permissions ---
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      Alert.alert(
        'Push Notifications Disabled',
        'Please enable push notifications in your device settings to receive feeding alerts.'
      );
      return; // Stop if permission not granted
    }

    // --- 2. Get FCM Token ---
    const token = await messaging().getToken();

    if (!token) {
      Alert.alert('Error', 'Failed to retrieve FCM push token.');
      return;
    }
    console.log('FCM Token obtained:', token);

    // --- 3. Save Token to Firestore ---
    const feedersRef = db.collection('feeders');
    const q = feedersRef.where('owner_uid', '==', uid);
    const querySnapshot = await q.get();

    if (querySnapshot.empty) {
      console.log('Notification Manager: No feeder found for user, cannot save token.');
      return; // No feeder to save token to yet
    }

    const feederDoc = querySnapshot.docs[0];
    const feederRef = db.collection('feeders').doc(feederDoc.id);

    await feederRef.update({
      fcmPushToken: token,
    });
    console.log('FCM token saved to Firestore:', token);

    // --- Android Notification Channel Creation Removed ---
    // This section was causing persistent TypeScript errors and is often handled
    // automatically by FCM or can be configured server-side if needed.

    // --- Notification Actions (Handled Differently) ---
    // Actions are handled via listeners in _layout.tsx

  } catch (error) {
    console.error('Error during push notification registration:', error);
    Alert.alert('Error', 'Could not register for push notifications.');
  }
};