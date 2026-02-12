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
                where("superAdmin", "==", false),
                orderBy("displayName"),
                limit(MAX_RESULTS)
            );
            const snap = await getDocs(q);
            const users = [];
            snap.forEach(doc => {
                const data = doc.data();
                if (doc.id !== currentUserId && !data.isAdmin && data.superAdmin !== true) {
                    users.push({ id: doc.id, ...data });
                }
            });
            return users;
        } catch (e) {
            console.error("Error fetching default users:", e);
            return [];
        }
    }

    // HEURISTIC OPTIMIZATION:
    // 1. If term contains '@', it's likely an email -> Only search email.
    // 2. Otherwise, search 'searchableName' (prefix).
    // 3. Drop legacy 'displayName' search to save resources.

    const queries = [];

    if (term.includes('@')) {
        queries.push(query(
            usersRef,
            where("superAdmin", "==", false),
            where('email', '>=', term),
            where('email', '<=', term + '\uf8ff'),
            limit(MAX_RESULTS)
        ));
    } else {
        queries.push(query(
            usersRef,
            where("superAdmin", "==", false),
            where('searchableName', '>=', term),
            where('searchableName', '<=', term + '\uf8ff'),
            limit(MAX_RESULTS)
        ));
    }

    try {
        const snapshots = await Promise.all(queries.map(q => getDocs(q)));
        const userMap = new Map();

        snapshots.forEach(snap => {
            snap.forEach(doc => {
                const data = doc.data();
                if (doc.id !== currentUserId && data.superAdmin !== true && !data.isAdmin) {
                    userMap.set(doc.id, { id: doc.id, ...data });
                }
            });
        });

        const combined = Array.from(userMap.values());
        // STRICTURE LIMIT for 10k+ users: only return TOP 20
        return combined.slice(0, MAX_RESULTS);

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
 * @param {string} currentUserId - The ID of the current user to exclude.
 * @returns {Promise<Object>} - { users: Array, lastDoc: Object }
 */
export const getPagedUsers = async (lastDoc = null, pageSize = 15, currentUserId = null) => {
    try {
        let q = query(
            collection(db, "users"),
            where("superAdmin", "==", false),
            where("isAdmin", "==", false), // Move more filtering to server
            orderBy("displayName"),
            limit(pageSize + 5) // Fetch slightly more to account for self-filtering
        );

        if (lastDoc) {
            q = query(q, startAfter(lastDoc));
        }

        const snapshot = await getDocs(q);
        const users = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(u => u.id !== currentUserId) // Only filter self in memory
            .slice(0, pageSize); // Ensure we return exact page size

        return {
            users,
            lastDoc: snapshot.docs[snapshot.docs.length - 1] || null
        };
    } catch (e) {
        console.error("Error fetching paged users:", e);
        if (e.code === 'failed-precondition') {
            console.warn("Firestore index missing! Falling back to simpler query.");
            // Fallback: simpler search without composite index
            try {
                const q = query(collection(db, "users"), limit(pageSize));
                const snapshot = await getDocs(q);
                return {
                    users: snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.id !== currentUserId),
                    lastDoc: snapshot.docs[snapshot.docs.length - 1] || null
                };
            } catch (inner) {
                return { users: [], lastDoc: null };
            }
        }
        return { users: [], lastDoc: null };
    }
};

