import { useRouter } from 'expo-router';
import { GoogleAuthProvider, signInWithCredential, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'; // Added Firestore imports
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../firebaseConfig'; // Added db import

// 1. IMPORT THE NEW MODULES
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';

const COLORS = {
  primary: '#8C6E63',
  accent: '#FFC107',
  background: '#F5F5FF',
  text: '#333333',
  lightGray: '#E0E0E0',
  white: '#FFFFFF',
};

// 2. CONFIGURE GOOGLE SIGN-IN
// We only need the webClientId here, which is used to verify the ID token
GoogleSignin.configure({
  webClientId: '847280230673-unso54fvd6etf0cuihmjb56q2j1eol09.apps.googleusercontent.com',
});

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false); // Loading state for Google

  // 3. THIS IS THE NEW NATIVE GOOGLE SIGN-IN FUNCTION
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      // Check if Play Services are available (required for Android)
      await GoogleSignin.hasPlayServices();

      // FIX: Force sign out from Google SDK to ensure account picker shows up
      try {
        await GoogleSignin.signOut();
      } catch (error) {
        // If not signed in, this might throw, but we can safely ignore it 
        // as we just wanted to ensure a clean state.
        console.log('Ensure clean Google session:', error);
      }

      // Get the user's ID token (this triggers the native modal)
      const { idToken } = await GoogleSignin.signIn();

      // Create a Firebase credential with the Google ID token
      const googleCredential = GoogleAuthProvider.credential(idToken);

      // Sign-in to Firebase with the credential
      const userCredential = await signInWithCredential(auth, googleCredential);
      const user = userCredential.user;

      // 4. CHECK AND CREATE FIRESTORE USER DOCUMENT
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        // Parse name from displayName (fallback to empty string if missing)
        const displayName = user.displayName || '';
        const nameParts = displayName.trim().split(/\s+/);
        
        // Simple heuristic: First word is firstName, rest is lastName
        const firstName = nameParts.length > 0 ? nameParts[0] : '';
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

        await setDoc(userDocRef, {
          uid: user.uid,
          firstName: firstName,
          lastName: lastName,
          email: user.email ? user.email.toLowerCase() : '',
          createdAt: serverTimestamp(),
        });
      }
      
      // Explicitly redirect to tabs on success, similar to email login
      router.replace('/(tabs)');

    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        Alert.alert('Login Canceled', 'You canceled the login flow.');
      } else if (error.code === statusCodes.IN_PROGRESS) {
        Alert.alert('In Progress', 'Sign in is already in progress.');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Error', 'Google Play Services not available or outdated.');
      } else {
        Alert.alert('Login Failed', error.message);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing Fields', 'Please enter both email and password.');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoToSignUp = () => {
    router.push('/signup');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.logo}>PawFeeds</Text>
          <Text style={styles.tagline}>Your pet's personal chef.</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email Address"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity style={styles.buttonPrimary} onPress={handleLogin} disabled={loading || googleLoading}>
            {loading ? (
              <ActivityIndicator color={COLORS.text} />
            ) : (
              <Text style={styles.buttonPrimaryText}>Login</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.dividerText}>OR</Text>

        <View style={styles.actions}>
          {/* This button now calls the new native function */}
          <TouchableOpacity
            style={styles.buttonSecondary}
            onPress={handleGoogleSignIn}
            disabled={loading || googleLoading}>
            {googleLoading ? (
              <ActivityIndicator color={COLORS.text} />
            ) : (
              <Text style={styles.buttonSecondaryText}>Sign in with Google</Text>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.buttonSecondary}
            onPress={handleGoToSignUp} 
            disabled={loading || googleLoading}>
            <Text style={styles.buttonSecondaryText}>Create an Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

// STYLES (Unchanged)
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 48,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  tagline: {
    fontSize: 16,
    color: COLORS.text,
    marginTop: 8,
  },
  form: {
    width: '100%',
  },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 16,
    color: COLORS.text,
  },
  buttonPrimary: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonPrimaryText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  dividerText: {
    textAlign: 'center',
    color: '#aaa',
    marginVertical: 24,
    fontWeight: '500',
  },
  actions: {
    width: '100%',
  },
  buttonSecondary: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
});