import { useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../services/firebase';

export default function useAuth() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u ?? null);
      if (u) {
        try {
          const snap = await getDoc(doc(db, 'admins', u.email));
          if (snap.exists()) {
            setIsAdmin(true);
            setAdminRole(snap.data().role ?? 'editor');
          } else {
            setIsAdmin(false);
            setAdminRole(null);
          }
        } catch (error) {
          console.error('Error checking admin status:', error);
          setIsAdmin(false);
          setAdminRole(null);
        }
      } else {
        setIsAdmin(false);
        setAdminRole(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  function loginWithGoogle() {
    return signInWithPopup(auth, googleProvider)
      .then(result => {
        return result;
      })
      .catch(error => {
        console.error('Google sign in error:', error);
        throw error;
      });
  }

  function loginWithEmail(email, password) {
    return signInWithEmailAndPassword(auth, email, password)
      .then(result => {
        return result;
      })
      .catch(error => {
        console.error('Email sign in error:', error);
        throw error;
      });
  }

  function registerWithEmail(email, password, displayName) {
    return createUserWithEmailAndPassword(auth, email, password)
      .then(cred => updateProfile(cred.user, { displayName }));
  }

  function resetPassword(email) {
    return sendPasswordResetEmail(auth, email);
  }

  function logout() {
    setIsAdmin(false);
    setAdminRole(null);
    return signOut(auth);
  }

  return {
    user, loading, isAdmin, adminRole,
    loginWithGoogle, loginWithEmail,
    registerWithEmail, resetPassword, logout
  };
}
