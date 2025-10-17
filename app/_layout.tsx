import { SplashScreen, Stack } from 'expo-router';
import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from '../context/AuthContext';

// Keep the splash screen visible until the auth state is loaded.
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { authStatus } = useAuth();
  const isLoading = authStatus === 'loading';

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

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