import React, { createContext, useContext, useEffect, useState } from 'react';
// 1. Import the modular onAuthStateChanged function
import authModule, { FirebaseAuthTypes } from '@react-native-firebase/auth';
// Import native instances
import { db } from '../firebaseConfig';

type User = FirebaseAuthTypes.User | null;
type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated_no_feeder' | 'authenticated_with_feeder';

interface AuthContextType {
  user: User | null;
  authStatus: AuthStatus;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  authStatus: 'loading',
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    // 2. Use the imported modular onAuthStateChanged, passing the auth instance
    const subscriber = authModule().onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // User is logged in, now check for a feeder
        try {
          // Use the native firestore instance (db) and its methods
          const feedersCollectionRef = db.collection('feeders');
          const q = feedersCollectionRef.where('owner_uid', '==', firebaseUser.uid);
          const querySnapshot = await q.get();

          if (querySnapshot.empty) {
            setAuthStatus('authenticated_no_feeder');
          } else {
            setAuthStatus('authenticated_with_feeder');
          }
        } catch (e) {
          console.error("Error checking feeder status in AuthContext:", e);
          // Default to no feeder on error to allow for re-provisioning
          setAuthStatus('authenticated_no_feeder');
        }
      } else {
        setUser(null);
        setAuthStatus('unauthenticated');
      }
    });

    return subscriber; // return the unsubscriber
  }, []);

  return (
    <AuthContext.Provider value={{ user, authStatus }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);