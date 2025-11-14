/*
 * Full file: enchi244/pawfeeds-app/pawfeeds-app-c6c6d3af53f9130a3abd84ae570f3bd8b45a9b11/hooks/usePushNotifications.ts
 *
 * FIXES:
 * 1. Updated setNotificationHandler to include shouldShowBanner and shouldShowList for NotificationBehavior type.
 * 2. Corrected removeNotificationSubscription to use listener.remove() method.
 * 3. Typed `data` in scheduleLocalNotification as Record<string, unknown>.
 * 4. Imported `Query` type from firebase/database and typed `rtdbQuery`.
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
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebaseConfig'; // db is Firestore, we'll get the app from it

// Configure notification handling when app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true, // FIX: Added for NotificationBehavior type
    shouldShowList: true, // FIX: Added for NotificationBehavior type
  }),
});

/**
 * Triggers a local notification immediately.
 */
async function scheduleLocalNotification(
  title: string,
  body: string,
  data: Record<string, unknown>, // FIX: Changed type from object
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
      // This will fail on Huawei devices without GMS, which is OK
      // for this workaround, as we'll rely on the RTDB listener.
      const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({
        projectId: '1b09b532-3580-4573-b26a-5431b090252b',
      });
      token = expoPushToken;
    } catch (e) {
      console.error('Error getting Expo push token (expected on HMS-only devices):', e);
      // We don't return null here, because we still want the RTDB listener
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  if (token && uid) {
    try {
      // Save the token to a 'users' collection, creating or merging the document.
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
    let rtdbQuery: Query | undefined; // FIX: Add Query type

    if (user) {
      // User is authenticated, register for notifications
      registerForPushNotificationsAsync(user.uid);

      // --- 1. Set up Expo Push Notification Listeners ---
      // Listener for when a notification is received while the app is foregrounded
      notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
        // console.log('Expo Notification received:', notification);
      });

      // Listener for when a user taps on a notification (app was backgrounded or killed)
      responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
        // console.log('Expo Notification response received:', response);
      });

      // --- 2. Set up RTDB Listener for Local Notifications ---
      // This is the workaround for devices that don't get Expo push notifications.
      try {
        const rtdb = getDatabase(db.app); // Get RTDB instance from the app
        const notificationsRef = ref(rtdb, `user_notifications/${user.uid}`);

        // Query for new notifications starting from "now"
        // This prevents triggering notifications for all old messages on app start
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
        // Cleanup Expo listeners
        if (notificationListener.current) {
          notificationListener.current.remove(); // FIX: Use .remove()
        }
        if (responseListener.current) {
          responseListener.current.remove(); // FIX: Use .remove()
        }
        // Cleanup RTDB listener
        if (rtdbQuery && rtdbListenerHandle) {
          off(rtdbQuery, 'child_added', rtdbListenerHandle);
        }
      };
    }
  }, [user]); // Re-run effect if user changes
};