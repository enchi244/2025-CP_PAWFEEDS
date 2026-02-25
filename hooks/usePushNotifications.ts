/*
 * Full file: enchi244/pawfeeds-app/pawfeeds-app-c6c6d3af53f9130a3abd84ae570f3bd8b45a9b11/hooks/usePushNotifications.ts
 *
 * NEW: Added logic in responseListener to handle 'missed_meal_notification' action
 * and call the 'skipScheduledMeal' Firebase Callable Function.
 */

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import {
  DataSnapshot,
  getDatabase,
  off,
  onChildAdded,
  orderByChild,
  query,
  Query,
  ref,
  startAt,
} from 'firebase/database';
import { doc, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions'; // <-- NEW IMPORT
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebaseConfig';

// Configure notification handling when app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true, 
    shouldShowList: true, 
  }),
});

// --- NEW HELPER FUNCTION TO CALL CLOUD FUNCTION ---
// Define the callable function using the app instance from firebaseConfig
const skipMeal = httpsCallable(getFunctions(db.app, 'asia-southeast1'), 'skipScheduledMeal');
// --- END NEW HELPER FUNCTION ---


/**
 * Triggers a local notification immediately.
 */
async function scheduleLocalNotification(
  title: string,
  body: string,
  data: Record<string, unknown>, 
) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: null, // Triggers immediately
    });
  } catch (e) {
    console.error('Error scheduling local notification:', e);
  }
}

async function registerForPushNotificationsAsync(uid: string): Promise<string | null> {
  let token: string | null = null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Failed to get push token: Permissions not granted.');
      return null;
    }

    try {
      const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({
        projectId: '1b09b532-3580-4573-b26a-5431b090252b',
      });
      token = expoPushToken;
    } catch (e) {
      console.error('Error getting Expo push token (expected on HMS-only devices):', e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  if (token && uid) {
    try {
      const userDocRef = doc(db, 'users', uid);
      await setDoc(userDocRef, { pushToken: token, updatedAt: new Date() }, { merge: true });
      console.log('Push token saved to Firestore for user:', uid);
    } catch (e) {
      console.error('Error saving push token to Firestore:', e);
    }
  }

  return token;
}

export const usePushNotifications = () => {
  const { user } = useAuth();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    let rtdbListenerHandle: ((snapshot: DataSnapshot) => void) | null = null;
    let rtdbQuery: Query | undefined; 

    if (user) {
      registerForPushNotificationsAsync(user.uid);

      // --- 1. Set up Expo Push Notification Listeners ---
      notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
        // console.log('Expo Notification received:', notification);
      });

      // Listener for when a user taps on a notification or an action button
      responseListener.current = Notifications.addNotificationResponseReceivedListener(async response => {
        const data = response.notification.request.content.data;
        // Check for the "missed meal" notification action
        if (data.action === 'missed_meal_notification' && data.scheduleId) {
            const scheduleId = data.scheduleId as string;

            try {
                // Call the Cloud Function to disable the schedule and redistribute portions
                console.log(`Calling skipScheduledMeal for schedule: ${scheduleId}`);
                await skipMeal({ scheduleId });
                alert('Meal skipped. Portions have been redistributed.');
            } catch (error) {
                console.error("Failed to skip meal via notification action:", error);
                alert('Error skipping meal. Please check the schedule screen.');
            }
        }
        // console.log('Expo Notification response received:', response);
      });

      // --- 2. Set up RTDB Listener for Local Notifications ---
      try {
        const rtdb = getDatabase(db.app); 
        const notificationsRef = ref(rtdb, `user_notifications/${user.uid}`);

        rtdbQuery = query(notificationsRef, orderByChild('timestamp'), startAt(Date.now()));

        rtdbListenerHandle = onChildAdded(rtdbQuery, (snapshot) => {
          if (snapshot.exists()) {
            const notificationData = snapshot.val();
            console.log('RTDB Message received, triggering local notification:', notificationData);
            if (notificationData.title && notificationData.body) {
              scheduleLocalNotification(
                notificationData.title,
                notificationData.body,
                notificationData.data || {},
              );
            }
          }
        });
      } catch (e) {
        console.error('Error setting up RTDB notification listener:', e);
      }

      // --- 3. Cleanup listeners on unmount ---
      return () => {
        if (notificationListener.current) {
          notificationListener.current.remove(); 
        }
        if (responseListener.current) {
          responseListener.current.remove(); 
        }
        if (rtdbQuery && rtdbListenerHandle) {
          off(rtdbQuery, 'child_added', rtdbListenerHandle);
        }
      };
    }
  }, [user]); 
};