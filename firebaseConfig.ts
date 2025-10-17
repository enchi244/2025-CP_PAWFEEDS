import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";

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


// ** FIX: The definitive solution for initialization **
// Declare variables to hold the app and auth instances.
let app: FirebaseApp;
let auth: Auth;

// Check if a Firebase app has already been initialized.
if (!getApps().length) {
  // If not, initialize the app and auth with persistence for the first time.
  app = initializeApp(firebaseConfig);
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage)
  });
} else {
  // If an app already exists (due to hot reloading), get the existing instances.
  app = getApp();
  auth = getAuth(app);
}

// Initialize other Firebase services
const db = getFirestore(app);
const database = getDatabase(app);

// Export all the configured services
export { auth, database, db };
