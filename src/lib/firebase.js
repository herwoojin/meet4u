import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import { getMessaging } from "firebase/messaging"; // Added Messaging import

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB4b-G7Ps-hnQiwZhjBOWE6tpxnRw7a4iE",
    authDomain: "gen-lang-client-0283055211.firebaseapp.com",
    projectId: "gen-lang-client-0283055211",
    storageBucket: "gen-lang-client-0283055211.firebasestorage.app",
    messagingSenderId: "997651572284",
    appId: "1:997651572284:web:e7ed3b4a88e480b0eac539",
    measurementId: "G-D210VT6KP7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const messaging = getMessaging(app); // Initialized Messaging
