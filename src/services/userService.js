import { db } from "../firebase";
import { collection, query, where, getDocs, limit, doc, updateDoc, arrayUnion, arrayRemove, documentId, orderBy, startAfter } from "firebase/firestore";

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
                orderBy("displayName"),
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
        where('email', '>=', term),
        where('email', '<=', term + '\uf8ff'),
        limit(MAX_RESULTS)
    );

    // Query 2: Search by searchableName (Case-insensitive prefix)
    const qName = query(
        usersRef,
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
/**
 * Fetches multiple user profiles by ID in batches.
 * Uses firestore 'in' query to reduce network round-trips.
 * @param {string[]} userIds - Array of user IDs.
 * @returns {Promise<Array>} - Array of user objects.
 */
export const getUsersByIds = async (userIds) => {
    if (!userIds || userIds.length === 0) return [];

    // Firestore 'in' query limit is 30 (technically 10 in some older docs, but 30 is safe now for documentId).
    // Safest standard batch size is 10 to avoid any edge cases with complex queries.
    const CHUNK_SIZE = 10;
    const uniqueIds = [...new Set(userIds)];
    const chunks = [];

    for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
        chunks.push(uniqueIds.slice(i, i + CHUNK_SIZE));
    }

    try {
        const results = await Promise.all(
            chunks.map(async (chunk) => {
                const q = query(
                    collection(db, "users"),
                    where(documentId(), "in", chunk)
                );
                const snap = await getDocs(q);
                return snap.docs.map(d => ({ id: d.id, ...d.data() }));
            })
        );
        return results.flat();
    } catch (e) {
        console.error("Error fetching users batch:", e);
        return [];
    }
};

/**
 * Fetches users in pages using cursor-based pagination.
 * @param {Object} lastDoc - The last document snapshot from previous page.
 * @param {number} pageSize - Number of users per page.
 * @returns {Promise<Object>} - { users: Array, lastDoc: Object }
 */
export const getPagedUsers = async (lastDoc = null, pageSize = 20) => {
    try {
        let q = query(
            collection(db, "users"),
            orderBy("displayName"),
            limit(pageSize)
        );

        if (lastDoc) {
            q = query(q, startAfter(lastDoc));
        }

        const snapshot = await getDocs(q);
        const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        return {
            users,
            lastDoc: snapshot.docs[snapshot.docs.length - 1] || null
        };
    } catch (e) {
        console.error("Error fetching paged users:", e);
        return { users: [], lastDoc: null };
    }
};

