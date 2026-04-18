import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(() => {
        // Check sessionStorage for admin session on init
        return sessionStorage.getItem('meet4u_admin') === 'true';
    });
    const [activeChatUser, setActiveChatUser] = useState(null); // { email, name }

    const openChat = (user) => {
        setActiveChatUser(user);
    };

    const closeChat = () => {
        setActiveChatUser(null);
    };

    const login = () => {
        return signInWithPopup(auth, googleProvider);
    };

    const logout = () => {
        sessionStorage.removeItem('meet4u_admin');
        setIsAdmin(false);
        return signOut(auth);
    };

    // Admin login with hardcoded credentials
    const adminLogin = (id, password) => {
        if (id === 'admin' && password === 'admin1234') {
            sessionStorage.setItem('meet4u_admin', 'true');
            setIsAdmin(true);
            return true;
        }
        return false;
    };

    const adminLogout = () => {
        sessionStorage.removeItem('meet4u_admin');
        setIsAdmin(false);
    };

    const updateUserProfile = async (patch) => {
        if (!currentUser?.uid) return;
        await setDoc(doc(db, 'users', currentUser.uid), patch, { merge: true });
        setUserProfile(prev => ({ ...(prev || {}), ...patch }));
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setCurrentUser(user);
            if (!user) {
                setUserProfile(null);
                setLoading(false);
                return;
            }

            if (user) {
                try {
                    // Check if user document exists before writing
                    const userDocRef = doc(db, "users", user.uid);
                    const userSnapshot = await getDoc(userDocRef);

                    if (!userSnapshot.exists()) {
                        // Create new user profile if it doesn't exist
                        const newProfile = {
                            email: user.email,
                            displayName: user.displayName,
                            photoURL: user.photoURL,
                            role: 'user',
                            preferredLanguage: 'ko',
                            createdAt: new Date().toISOString(),
                            lastSeen: new Date().toISOString(),
                            emailSanitized: user.email.replace(/\./g, '_')
                        };
                        await setDoc(userDocRef, newProfile);
                        setUserProfile(newProfile);
                        setIsAdmin(false);
                    } else {
                        const userData = userSnapshot.data();
                        if (userData.role === 'admin') {
                            setIsAdmin(true);
                        }
                        setUserProfile(userData);
                        
                        // Note: sessionStorage admin status is preserved via useState init
                        // Only update lastSeen and photoURL (if changed) to avoid overwriting custom displayName
                        await setDoc(userDocRef, {
                            lastSeen: new Date().toISOString(),
                            emailSanitized: user.email.replace(/\./g, '_'),
                            // Optional definition: could also sync photoURL if we want auth to be source of truth for photo
                            photoURL: user.photoURL
                        }, { merge: true });
                    }
                } catch (error) {
                    console.error("Error syncing user profile:", error);
                }
            }
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const value = {
        currentUser,
        userProfile,
        login,
        logout,
        loading,
        isAdmin,
        adminLogin,
        adminLogout,
        activeChatUser,
        openChat,
        closeChat
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
