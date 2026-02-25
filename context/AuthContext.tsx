import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebaseConfig';

// 1. Status Types
type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated_no_feeder' | 'authenticated_with_feeder' | 'authenticated_admin';

// 2. Update Interface to include refreshUserData
interface AuthContextType {
  user: User | null;
  authStatus: AuthStatus;
  refreshUserData: () => Promise<void>; // <--- Added this property
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  authStatus: 'loading',
  refreshUserData: async () => {}, // Default stub
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');

  // Helper function: Logic to determine if user is Admin or has Feeders
  const checkStatus = async (currentUser: User) => {
    try {
      // A. Check for Admin Role
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists() && userDocSnap.data().isAdmin === true) {
        console.log("User is Admin");
        setAuthStatus('authenticated_admin');
        return;
      }

      // B. Check for Feeders (Standard User)
      const feedersCollectionRef = collection(db, 'feeders');
      const q = query(feedersCollectionRef, where('owner_uid', '==', currentUser.uid));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setAuthStatus('authenticated_no_feeder');
      } else {
        setAuthStatus('authenticated_with_feeder');
      }
    } catch (e) {
      console.error("Error checking auth status:", e);
      setAuthStatus('authenticated_no_feeder'); 
    }
  };

  // 3. The function exposed to the app to manually re-run the check
  const refreshUserData = async () => {
    if (user) {
      await checkStatus(user);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Run the check automatically on login/load
        await checkStatus(firebaseUser);
      } else {
        setUser(null);
        setAuthStatus('unauthenticated');
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, authStatus, refreshUserData }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);