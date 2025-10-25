import * as Notifications from 'expo-notifications';
import { SplashScreen, Stack } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';
import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { db } from '../firebaseConfig';
import { registerForPushNotificationsAsync } from '../utils/notifications'; // 1. Import

// --- 2. Set the handler for how notifications are presented ---
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// --- 3. Handle Notification Response (user taps "Feed Now") ---
const handleNotificationResponse = async (response: Notifications.NotificationResponse) => {
  const { actionIdentifier } = response;
  const { feederId, pendingFeedId } = response.notification.request.content.data as { feederId: string, pendingFeedId: string };

  if (actionIdentifier === 'feedNow') {
    if (!feederId || !pendingFeedId) {
      Alert.alert("Error", "Notification data is missing. Cannot dispense feed.");
      return;
    }
    
    try {
      // This triggers the `onPendingFeedTrigger` cloud function
      const pendingFeedRef = doc(db, 'feeders', feederId, 'pendingFeeds', pendingFeedId);
      await updateDoc(pendingFeedRef, {
        status: 'triggered',
      });
      Alert.alert("Success", "Feed command sent!");
    } catch (error) {
      console.error("Error triggering feed from notification:", error);
      Alert.alert("Error", "Could not send feed command.");
    }
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
    // If user is authenticated, register for push notifications
    if (user) {
      registerForPushNotificationsAsync(user.uid);
    }

    // Listener for when user interacts with a notification (e.g., taps "Feed Now")
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    
    // Listener for when a notification is received while app is foregrounded
    const notificationSubscription = Notifications.addNotificationReceivedListener(notification => {
      // You can add logic here if needed
      console.log("Notification received:", notification);
    });

    // Cleanup listeners
    return () => {
      responseSubscription.remove();
      notificationSubscription.remove();
    };
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
      <Stack.Screen name="pet/[id]" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="schedule/[id]" options={{ headerShown: false, presentation: 'modal' }} />
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