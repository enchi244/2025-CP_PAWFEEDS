import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

// Your app's Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyD6qqin2W1UpqCbtudFN6cMHo8S3jtqz0c",
  authDomain: "pawfeeds-v2.firebaseapp.com",
  projectId: "pawfeeds-v2",
  storageBucket: "pawfeeds-v2.firebasestorage.app",
  messagingSenderId: "847280230673",
  appId: "1:847280230673:web:e82d2fa686e31775bbfcb0",
  databaseURL: "https://pawfeeds-v2-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Declare variables to hold the app and auth instances.
let app: FirebaseApp;
let auth: Auth;

// Singleton pattern: Check if app is already initialized
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage)
  });
} else {
  app = getApp();
  auth = getAuth(app);
}

// Initialize other Firebase services
const db = getFirestore(app);
const database = getDatabase(app);
const storage = getStorage(app);
const functions = getFunctions(app, 'asia-southeast1');

// === COMPATIBILITY ADAPTER ===
// This function ensures 'complete.tsx' and 'AuthContext.tsx' continue to work
// by returning the instances we initialized above.
const initializeFirebase = () => {
  return { app, auth, db, database, functions, storage };
};

// Export individual instances (your preferred style) AND the helper function
export { app, auth, database, db, functions, initializeFirebase, storage };
