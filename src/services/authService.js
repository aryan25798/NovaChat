import { auth, db, storage } from "../firebase";
import {
    ref,
    uploadBytes,
    getDownloadURL
} from "firebase/storage";
import {
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    onAuthStateChanged
} from "firebase/auth";
import {
    doc,
    setDoc,
    getDoc,
    updateDoc,
    serverTimestamp
} from "firebase/firestore";

export const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // Check if user exists, if not create
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            await setDoc(userRef, {
                uid: user.uid,
                displayName: user.displayName,
                searchableName: (user.displayName || '').toLowerCase(),
                email: user.email,
                photoURL: user.photoURL,
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp(),
                isOnline: true,
                status: "Hey there! I am using WhatsApp."
            });
        } else {
            await updateDoc(userRef, {
                lastLogin: serverTimestamp(),
                isOnline: true,
                photoURL: user.photoURL // Update photo if changed on Google
            });
        }

        return user;
    } catch (error) {
        console.error("Login failed:", error);
        throw error;
    }
};

export const logoutUser = async (uid) => {
    try {
        if (uid) {
            await updateDoc(doc(db, "users", uid), {
                isOnline: false,
                lastSeen: serverTimestamp()
            });
        }
        await signOut(auth);
    } catch (error) {
        console.error("Logout failed:", error);
        throw error;
    }
};

export const updateUserProfile = async (uid, data) => {
    try {
        // Auto-sync searchableName when displayName changes
        if (data.displayName) {
            data.searchableName = data.displayName.toLowerCase();
        }
        await updateDoc(doc(db, "users", uid), data);
    } catch (error) {
        console.error("Profile update failed:", error);
        throw error;
    }
};

export const getUserProfile = async (uid) => {
    try {
        const docSnap = await getDoc(doc(db, "users", uid));
        return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
        console.error("Get user failed:", error);
        throw error;
    }
};

export const uploadProfilePhoto = async (uid, file) => {
    try {
        const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!ALLOWED_TYPES.includes(file.type)) {
            throw new Error('Invalid file type. Please upload a JPEG, PNG, GIF, or WebP image.');
        }
        const MAX_SIZE = 10 * 1024 * 1024; // 10MB
        if (file.size > MAX_SIZE) {
            throw new Error('File too large. Maximum size is 10MB.');
        }

        const fileRef = ref(storage, `profiles/${uid}_${Date.now()}`);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);

        await updateDoc(doc(db, "users", uid), {
            photoURL: url
        });

        return url;
    } catch (error) {
        console.error("Photo upload failed:", error);
        throw error;
    }
};
