import auth from '@react-native-firebase/auth';
import database from '@react-native-firebase/database';
import firestore from '@react-native-firebase/firestore';

// These are now the pre-initialized native instances
// No need to explicitly call getApp() or initializeApp here,
// the native SDK handles it via google-services.json / GoogleService-Info.plist
const db = firestore();
const authInstance = auth();
const rtdbInstance = database();

// Export the instances directly
export { authInstance as auth, db, rtdbInstance as rtdb };
