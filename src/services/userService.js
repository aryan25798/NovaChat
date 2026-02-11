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

    // If no search term, return recent users (excluding superAdmins)
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
                if (doc.id !== currentUserId) {
                    users.push({ id: doc.id, ...doc.data() });
                }
            });
            return users;
        } catch (e) {
            console.error("Error fetching default users:", e);
            return [];
        }
    }

    // Note: This requires the fields in Firestore to be stored in a way that allows case-insensitive search
    // OR we assume the user types exact case (bad UX). 
    // Best practice: Store 'searchableName' and 'searchableEmail' in lowercase.
    // For now, we will assume standard storage and try a "best effort" with >= and <= 
    // However, since we can't change the DB schema easily without a migration script,
    // we will stick to the "client-side filtering of limited results" if the dataset was small,
    // BUT the audit said this is critical.

    // OPTION A (Correct Scalable Way):
    // Use `where('email', '>=', term).where('email', '<=', term + '\uf8ff')`
    // This only works if `term` matches the case in DB. 
    // We will assume emails are stored lowercased (standard practice).

    // Search by Email
    const qEmail = query(
        usersRef,
        where('superAdmin', '==', false),
        where('email', '>=', term),
        where('email', '<=', term + '\uf8ff'),
        limit(MAX_RESULTS)
    );

    // Search by Name
    const capitalizedTerm = term.charAt(0).toUpperCase() + term.slice(1);
    const qName = query(
        usersRef,
        where('superAdmin', '==', false),
        where('displayName', '>=', capitalizedTerm),
        where('displayName', '<=', capitalizedTerm + '\uf8ff'),
        limit(MAX_RESULTS)
    );

    try {
        const [emailSnap, nameSnap] = await Promise.all([
            getDocs(qEmail),
            getDocs(qName)
        ]);

        const userMap = new Map();

        emailSnap.forEach(doc => {
            const data = doc.data();
            // SECURITY: Exclude Super Admins if requester is not an admin (enforced by rules too, but better here)
            if (doc.id !== currentUserId && !data.superAdmin) {
                userMap.set(doc.id, { id: doc.id, ...data });
            }
        });

        nameSnap.forEach(doc => {
            const data = doc.data();
            if (doc.id !== currentUserId && !data.superAdmin) {
                userMap.set(doc.id, { id: doc.id, ...data });
            }
        });

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
