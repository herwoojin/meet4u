import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
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
        return signOut(auth);
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setCurrentUser(user);
            setLoading(false);

            if (user) {
                try {
                    // Check if user document exists before writing
                    const userDocRef = doc(db, "users", user.uid);
                    const userSnapshot = await getDoc(userDocRef);

                    if (!userSnapshot.exists()) {
                        // Create new user profile if it doesn't exist
                        await setDoc(userDocRef, {
                            email: user.email,
                            displayName: user.displayName,
                            photoURL: user.photoURL,
                            createdAt: new Date().toISOString(),
                            lastSeen: new Date().toISOString(),
                            emailSanitized: user.email.replace(/\./g, '_')
                        });
                    } else {
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
        });

        return unsubscribe;
    }, []);

    const value = {
        currentUser,
        login,
        logout,
        loading,
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
