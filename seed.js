// Import the functions you need
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, getDocs, query } = require('firebase/firestore');

// TODO: COPY YOUR FIREBASE CONFIG HERE
const firebaseConfig = {
  apiKey: "AIzaSyD6qqin2W1UpqCbtudFN6cMHo8S3jtqz0c",
  authDomain: "pawfeeds-v2.firebaseapp.com",
  projectId: "pawfeeds-v2",
  storageBucket: "pawfeeds-v2.firebasestorage.app",
  messagingSenderId: "847280230673",
  appId: "1:847280230673:web:e82d2fa686e31775bbfcb0",
  databaseURL: "https://pawfeeds-v2-default-rtdb.asia-southeast1.firebasedatabase.app"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- UPDATED SEED DATA ---
// Removed `defaultAge`, Added `defaultKcal`
const BREED_SEED_DATA = [
  // Small
  { name: 'Chihuahua', size: 'Small', defaultWeight: 2.5, defaultKcal: 400, defaultActivity: 'Normal', defaultNeuterStatus: 'Neutered/Spayed' },
  { name: 'Pug', size: 'Small', defaultWeight: 7, defaultKcal: 380, defaultActivity: 'Normal', defaultNeuterStatus: 'Neutered/Spayed' },
  { name: 'Shih Tzu', size: 'Small', defaultWeight: 6, defaultKcal: 390, defaultActivity: 'Low', defaultNeuterStatus: 'Neutered/Spayed' },
  { name: 'Poodle (Toy)', size: 'Small', defaultWeight: 3, defaultKcal: 410, defaultActivity: 'Normal', defaultNeuterStatus: 'Neutered/Spayed' },
  { name: 'Yorkshire Terrier', size: 'Small', defaultWeight: 3, defaultKcal: 400, defaultActivity: 'Normal', defaultNeuterStatus: 'Neutered/Spayed' },

  // Medium
  { name: 'Beagle', size: 'Medium', defaultWeight: 12, defaultKcal: 390, defaultActivity: 'High', defaultNeuterStatus: 'Neutered/Spayed' },
  { name: 'Cocker Spaniel', size: 'Medium', defaultWeight: 14, defaultKcal: 385, defaultActivity: 'Normal', defaultNeuterStatus: 'Neutered/Spayed' },
  { name: 'Bulldog', size: 'Medium', defaultWeight: 23, defaultKcal: 380, defaultActivity: 'Low', defaultNeuterStatus: 'Neutered/Spayed' },
  { name: 'Golden Retriever', size: 'Medium', defaultWeight: 30, defaultKcal: 370, defaultActivity: 'High', defaultNeuterStatus: 'Neutered/Spayed' },
  { name: 'Siberian Husky', size: 'Medium', defaultWeight: 22, defaultKcal: 400, defaultActivity: 'High', defaultNeuterStatus: 'Neutered/Spayed' },

  // Large
  { name: 'German Shepherd', size: 'Large', defaultWeight: 34, defaultKcal: 370, defaultActivity: 'High', defaultNeuterStatus: 'Neutered/Spayed' },
  { name: 'Labrador Retriever', size: 'Large', defaultWeight: 32, defaultKcal: 375, defaultActivity: 'High', defaultNeuterStatus: 'Neutered/Spayed' },
  { name: 'Great Dane', size: 'Large', defaultWeight: 65, defaultKcal: 390, defaultActivity: 'Normal', defaultNeuterStatus: 'Neutered/Spayed' },
  { name: 'Rottweiler', size: 'Large', defaultWeight: 50, defaultKcal: 380, defaultActivity: 'Normal', defaultNeuterStatus: 'Neutered/Spayed' },
];

async function seedDatabase() {
  const breedsRef = collection(db, 'dogBreeds');
  
  const q = query(breedsRef);
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    console.log('Database already seeded. Aborting. Please delete the "dogBreeds" collection from your Firebase console to re-seed.');
    return;
  }

  console.log('Seeding dogBreeds collection...');
  for (const breed of BREED_SEED_DATA) {
    await addDoc(breedsRef, breed);
    console.log(`Added ${breed.name}`);
  }
  console.log('Seeding complete!');
}

seedDatabase().then(() => {
  process.exit(0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});