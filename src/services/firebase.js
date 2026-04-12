// src/services/firebase.js
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyD3c325stAvJUh8y8VfaTwKA4UiXvwjsec",
  authDomain: "ditumap-69820.firebaseapp.com",
  projectId: "ditumap-69820",
  storageBucket: "ditumap-69820.firebasestorage.app",
  messagingSenderId: "751173132994",
  appId: "1:751173132994:web:dc3b0e1be5170a36ca515b",
  measurementId: "G-4RH31YFRX3"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({
  prompt: 'select_account'
});
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;