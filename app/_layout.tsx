import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { SplashScreen, Stack } from 'expo-router';
import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { AuthProvider, useAuth } from '../context/AuthContext';
// db is now the native firestore instance
import { db } from '../firebaseConfig';

/**
 * Handles saving the push token to the user's document in Firestore.
 */
async function saveTokenToUser(uid: string, token: string) {
  try {
    const userRef = db.collection('users').doc(uid);
    await userRef.update({
      pushToken: token,
    });
    console.log('Push token saved to user document.');
  } catch (error) {
    console.error('Error saving push token to Firestore:', error);
  }
}

/**
 * Requests permission and gets the FCM token.
 */
async function registerForPushNotificationsAsync(uid: string) {
  try {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      const token = await messaging().getToken();
      console.log('FCM Token:', token);
      await saveTokenToUser(uid, token);
    } else {
      Alert.alert(
        'Push Notifications Disabled',
        'Please enable push notifications in settings to receive feeding alerts.'
      );
    }
  } catch (error) {
    console.error('Error during push notification registration:', error);
    Alert.alert(
      'Registration Error',
      'An error occurred while registering for push notifications.'
    );
  }
}

/**
 * Handles triggering the feed when a notification is opened.
 * This function is now triggered by onNotificationOpenedApp.
 */
const handleNotificationTrigger = async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
  console.log(
    'Notification caused app to open from background state:',
    remoteMessage
  );

  const { feederId, pendingFeedId } = remoteMessage.data as {
    feederId: string;
    pendingFeedId: string;
  };

  // We assume opening the notification means the user wants to feed.
  // The 'feedNow' action identifier no longer exists in this SDK.
  if (!feederId || !pendingFeedId) {
    Alert.alert('Error', 'Notification data is missing. Cannot dispense feed.');
    return;
  }

  try {
    // This triggers the `onPendingFeedTrigger` cloud function
    // Use native Firestore syntax
    const pendingFeedRef = db
      .collection('feeders')
      .doc(feederId)
      .collection('pendingFeeds')
      .doc(pendingFeedId);
      
    await pendingFeedRef.update({
      status: 'triggered',
    });
    Alert.alert('Success', 'Feed command sent!');
  } catch (error) {
    console.error('Error triggering feed from notification:', error);
    Alert.alert('Error', 'Could not send feed command.');
  }
};

// Keep the splash screen visible until the auth state is loaded.
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { authStatus, user } = useAuth(); // Get the user object
  const isLoading = authStatus === 'loading';

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  // --- 4. Add Notification Logic ---
  useEffect(() => {
    if (user) {
      // If user is authenticated, register for push notifications
      registerForPushNotificationsAsync(user.uid);

      // --- Listener for when a notification is received while app is foregrounded ---
      const unsubscribeOnMessage = messaging().onMessage(async (remoteMessage) => {
        console.log('Notification received in foreground:', remoteMessage);
        Alert.alert(
          remoteMessage.notification?.title || 'Notification',
          remoteMessage.notification?.body || 'You have a new message.'
        );
      });

      // --- Listener for when user interacts with a notification (taps it) ---
      // This handles when the app is in the background or quit
      const unsubscribeOnNotificationOpened = messaging().onNotificationOpenedApp(
        handleNotificationTrigger
      );

      // Check if app was opened from a quit state by a notification
      messaging()
        .getInitialNotification()
        .then((remoteMessage) => {
          if (remoteMessage) {
            handleNotificationTrigger(remoteMessage);
          }
        });

      // Cleanup listeners
      return () => {
        unsubscribeOnMessage();
        unsubscribeOnNotificationOpened();
      };
    }
  }, [user]); // Re-run when user object changes

  // Render nothing while the auth state is loading. The splash screen will be visible.
  if (authStatus === 'loading') {
    return null;
  }

  // Define all possible top-level routes.
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(provisioning)" options={{ headerShown: false }} />
      <Stack.Screen
        name="pet/[id]"
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="schedule/[id]"
        options={{ headerShown: false, presentation: 'modal' }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}