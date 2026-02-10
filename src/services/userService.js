import { db } from "../firebase";
import { collection, query, where, getDocs, limit, orderBy, startAt, endAt } from "firebase/firestore";

/**
 * Searches for users by email or display name using prefix search.
 * @param {string} searchTerm - The search term.
 * @param {string} currentUserId - The ID of the current user to exclude.
 * @returns {Promise<Array>} - List of found users.
 */
export const searchUsers = async (searchTerm, currentUserId) => {
    if (!searchTerm || searchTerm.trim().length === 0) return [];

    const term = searchTerm.toLowerCase();
    const usersRef = collection(db, "users");
    const results = [];
    const MAX_RESULTS = 10;

    // Strategy: We can't do a perfect "OR" query with substring search in Firestore efficiently.
    // 1. We will try a PREFIX search on 'email' (common case).
    // 2. We will try a PREFIX search on 'displayName' (common case).

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
        where('email', '>=', term),
        where('email', '<=', term + '\uf8ff'),
        limit(MAX_RESULTS)
    );

    // Search by Name (Case-sensitive in Firestore unless we have a specific field)
    // We can try to capitalize the first letter to match "Aryan" if user types "aryan"
    const capitalizedTerm = term.charAt(0).toUpperCase() + term.slice(1);
    const qName = query(
        usersRef,
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
            if (doc.id !== currentUserId) userMap.set(doc.id, { id: doc.id, ...doc.data() });
        });

        nameSnap.forEach(doc => {
            if (doc.id !== currentUserId) userMap.set(doc.id, { id: doc.id, ...doc.data() });
        });

        return Array.from(userMap.values()).slice(0, MAX_RESULTS);

    } catch (error) {
        console.error("Error searching users:", error);
        return [];
    }
};
