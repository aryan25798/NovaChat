import { db } from "../firebase";
import { collection, query, where, getDocs, limit, doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

/**
 * Searches for users by email or display name using prefix search.
 * @param {string} searchTerm - The search term.
 * @param {string} currentUserId - The ID of the current user to exclude.
 * @returns {Promise<Array>} - List of found users.
 */
export const searchUsers = async (searchTerm, currentUserId) => {
    const term = (searchTerm || "").toLowerCase().trim();
    const usersRef = collection(db, "users");
    const MAX_RESULTS = 20;

    // If no search term, return recent users
    if (!term) {
        try {
            const q = query(
                usersRef,
                where("superAdmin", "==", false),
                limit(MAX_RESULTS)
            );
            const snap = await getDocs(q);
            const users = [];
            snap.forEach(doc => {
                const data = doc.data();
                if (doc.id !== currentUserId && !data.isAdmin) {
                    users.push({ id: doc.id, ...data });
                }
            });
            return users;
        } catch (e) {
            console.error("Error fetching default users:", e);
            return [];
        }
    }

    // STRATEGY: Use `searchableName` (lowercase) for a single name query.
    // This replaces 3 case-variant displayName queries with 1.
    // Admin filtering is done client-side (trivial for ≤20 results).

    // Query 1: Search by Email (emails are always stored lowercase)
    const qEmail = query(
        usersRef,
        where('superAdmin', '==', false),
        where('email', '>=', term),
        where('email', '<=', term + '\uf8ff'),
        limit(MAX_RESULTS)
    );

    // Query 2: Search by searchableName (single lowercase query)
    const qName = query(
        usersRef,
        where('superAdmin', '==', false),
        where('searchableName', '>=', term),
        where('searchableName', '<=', term + '\uf8ff'),
        limit(MAX_RESULTS)
    );

    try {
        const [emailSnap, nameSnap] = await Promise.all([
            getDocs(qEmail),
            getDocs(qName)
        ]);

        const userMap = new Map();

        // Client-side filtering: exclude self, admins, superAdmins
        const addToMap = (snap) => {
            snap.forEach(doc => {
                const data = doc.data();
                if (doc.id !== currentUserId && !data.superAdmin && !data.isAdmin) {
                    userMap.set(doc.id, { id: doc.id, ...data });
                }
            });
        };

        addToMap(emailSnap);
        addToMap(nameSnap);

        return Array.from(userMap.values()).slice(0, MAX_RESULTS);

    } catch (error) {
        console.error("Error searching users:", error);
        return [];
    }
};

/**
 * Blocks a user.
 * @param {string} currentUserId 
 * @param {string} targetUserId 
 */
export const blockUser = async (currentUserId, targetUserId) => {
    const userRef = doc(db, "users", currentUserId);
    await updateDoc(userRef, {
        blockedUsers: arrayUnion(targetUserId)
    });
};

/**
 * Unblocks a user.
 * @param {string} currentUserId 
 * @param {string} targetUserId 
 */
export const unblockUser = async (currentUserId, targetUserId) => {
    const userRef = doc(db, "users", currentUserId);
    await updateDoc(userRef, {
        blockedUsers: arrayRemove(targetUserId)
    });
};
