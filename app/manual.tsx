import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    LayoutAnimation,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Enable LayoutAnimation for Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const COLORS = {
  primary: '#8C6E63',
  accent: '#FFC107',
  background: '#F5F5F5',
  text: '#333333',
  lightGray: '#E0E0E0',
  white: '#FFFFFF',
  secondaryText: '#666666',
};

interface ManualSection {
  id: string;
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  content: string;
}

const MANUAL_DATA: ManualSection[] = [
  {
    id: '1',
    title: 'Getting Started',
    icon: 'power-plug',
    content:
      '1. Plug your PawFeeds device into a power outlet.\n2. Ensure the indicator light is blinking (pairing mode).\n3. Go to the "Add Device" section in the menu to connect your feeder to Wi-Fi.',
  },
  {
    id: '2',
    title: 'Dashboard Overview',
    icon: 'view-dashboard',
    content:
      '• **Live Feed**: Watch your pets in real-time (if camera is enabled).\n• **Food Level**: Check the current percentage of food remaining in the hopper.\n• **Manual Feed**: Tap "Feed Now" to dispense food immediately outside of the schedule.',
  },
  {
    id: '3',
    title: 'Managing Pets',
    icon: 'dog',
    content:
      '• Go to the **Pets** tab to add or edit profiles.\n• **Bowl Assignment**: Each pet can be assigned to Bowl 1 or Bowl 2.\n• **Note**: You can only assign one pet per bowl. If both bowls are taken, you must remove a pet before adding a new one.',
  },
  {
    id: '4',
    title: 'Scheduling Meals',
    icon: 'clock-outline',
    content:
      '• Navigate to the **Schedules** tab.\n• Tap "+" to create a new feeding time.\n• Set the time, select the pet (which automatically selects the bowl), and choose repeat days.\n• Toggle the switch to Enable/Disable specific meals instantly.',
  },
  {
    id: '5',
    title: 'Device Reset',
    icon: 'restart',
    content:
      'If you need to change Wi-Fi networks or sell the device:\n1. Open the Menu (hamburger icon).\n2. Select "Reset Device".\n3. This will wipe the device settings and remove it from your account.',
  },
  {
    id: '6',
    title: 'Troubleshooting',
    icon: 'alert-circle-outline',
    content:
      '• **Offline?** Check your Wi-Fi connection and ensure the device is plugged in.\n• **Not Dispensing?** Check for food jams in the hopper or ensure the food level is not empty.\n• **Video Lag?** This depends on your internet speed. Try lowering the stream quality if available.',
  },
];

const AccordionItem = ({
  item,
  expanded,
  onPress,
}: {
  item: ManualSection;
  expanded: boolean;
  onPress: () => void;
}) => {
  return (
    <View style={styles.accordionContainer}>
      <TouchableOpacity
        style={[styles.accordionHeader, expanded && styles.accordionHeaderActive]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons
            name={item.icon}
            size={24}
            color={expanded ? COLORS.white : COLORS.primary}
          />
          <Text
            style={[
              styles.accordionTitle,
              expanded && styles.headerTitleActive,
            ]}
          >
            {item.title}
          </Text>
        </View>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={24}
          color={expanded ? COLORS.white : COLORS.primary}
        />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.accordionContent}>
          <Text style={styles.contentText}>{item.content}</Text>
        </View>
      )}
    </View>
  );
};

export default function ManualScreen() {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={28} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Manual</Text>
        <View style={{ width: 28 }} /> 
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.introText}>
          Welcome to the PawFeeds User Manual. Tap on a section below to learn more about your smart feeder features.
        </Text>

        {MANUAL_DATA.map((item) => (
          <AccordionItem
            key={item.id}
            item={item}
            expanded={expandedId === item.id}
            onPress={() => toggleExpand(item.id)}
          />
        ))}
        {/* Support Footer Removed */}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  introText: {
    fontSize: 16,
    color: COLORS.secondaryText,
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  accordionContainer: {
    marginBottom: 12,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.white,
  },
  accordionHeaderActive: {
    backgroundColor: COLORS.primary,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accordionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  headerTitleActive: {
    color: COLORS.white,
  },
  accordionContent: {
    padding: 16,
    backgroundColor: '#FAF9F8',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  contentText: {
    fontSize: 15,
    color: '#444',
    lineHeight: 24,
  },
});