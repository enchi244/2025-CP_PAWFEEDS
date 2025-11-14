import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebaseConfig';

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
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // User is logged in, now check for a feeder
        try {
          const feedersCollectionRef = collection(db, 'feeders');
          const q = query(feedersCollectionRef, where('owner_uid', '==', firebaseUser.uid));
          const querySnapshot = await getDocs(q);

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

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, authStatus }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);