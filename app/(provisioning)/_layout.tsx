import { Stack } from 'expo-router';
import React from 'react';

// --- Color Palette ---
const COLORS = {
  primary: '#8C6E63', // Kibble Brown
  background: '#F5F5F5', // Soft Cream
  white: '#FFFFFF',
  lightGray: '#E0E0E0',
};

/**
 * Defines the navigation stack for the device provisioning flow.
 * All screens in this flow will share the same header style.
 */
export default function ProvisioningLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.white,
        },
        headerTintColor: COLORS.primary,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerShadowVisible: true,
        headerBackVisible: false, // Hides the back button for this stack
      }}
    />
  );
}