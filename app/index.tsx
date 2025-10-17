import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/AuthContext'; // Assuming this is the correct path

export default function StartPage() {
  const { authStatus } = useAuth();

  if (authStatus === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (authStatus === 'authenticated_with_feeder') {
    return <Redirect href="/(tabs)" />;
  }
  
  if (authStatus === 'authenticated_no_feeder') {
    return <Redirect href="/(provisioning)" />;
  }

  // Unauthenticated
  return <Redirect href="/login" />;
}