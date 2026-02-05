import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "aiplatform-27f9b.firebaseapp.com",
  projectId: "aiplatform-27f9b",
  storageBucket: "aiplatform-27f9b.firebasestorage.app",
  messagingSenderId: "431062941637",
  appId: "1:431062941637:web:0fc920a2323fe7665455ac",
  measurementId: "G-T9CWJZLDZS"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const db = getFirestore(app);

export { db };