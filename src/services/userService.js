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
    // Increase limit slightly to allow for in-memory filtering of admins/self
    const FETCH_LIMIT = 20;

    // If no search term, return recent users
    if (!term) {
        try {
            // simplified query to avoid index issues with 'superAdmin'
            const q = query(
                usersRef,
                orderBy("displayName"),
                limit(FETCH_LIMIT)
            );
            const snap = await getDocs(q);
            const users = [];
            snap.forEach(doc => {
                const data = doc.data();
                // Robust in-memory filtering
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

    const queries = [];

    // Strategy: Search strictly by email if '@' is present, otherwise search both name and email (if possible) or just name.
    // We remove 'superAdmin' check from DB query to ensure we don't miss records lacking that field.

    if (term.includes('@')) {
        queries.push(query(
            usersRef,
            where('email', '>=', term),
            where('email', '<=', term + '\uf8ff'),
            limit(FETCH_LIMIT)
        ));
    } else {
        // Priority 1: Search by searchableName (case-insensitive prepared field)
        queries.push(query(
            usersRef,
            where('searchableName', '>=', term),
            where('searchableName', '<=', term + '\uf8ff'),
            limit(FETCH_LIMIT)
        ));

        // Priority 2: Also try searching by email prefix if it looks like a partial email (optional but helpful)
        if (term.length > 2) {
            queries.push(query(
                usersRef,
                where('email', '>=', term),
                where('email', '<=', term + '\uf8ff'),
                limit(FETCH_LIMIT)
            ));
        }
    }

    try {
        const snapshots = await Promise.all(queries.map(q => getDocs(q)));
        const userMap = new Map();

        snapshots.forEach(snap => {
            snap.forEach(doc => {
                const data = doc.data();
                // Strict In-Memory Filtering
                if (doc.id !== currentUserId && data.superAdmin !== true && !data.isAdmin) {
                    userMap.set(doc.id, { id: doc.id, ...data });
                }
            });
        });

        const combined = Array.from(userMap.values());

        // Sort by name match relevance (starts with > contains)
        combined.sort((a, b) => {
            const nameA = (a.displayName || "").toLowerCase();
            const nameB = (b.displayName || "").toLowerCase();
            const startsA = nameA.startsWith(term);
            const startsB = nameB.startsWith(term);
            if (startsA && !startsB) return -1;
            if (!startsA && startsB) return 1;
            return nameA.localeCompare(nameB);
        });

        return combined.slice(0, 10); // Return top 10

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
            // where("superAdmin", "==", false), // REMOVED: In-memory filtering is safer for mixed data
            // where("isAdmin", "==", false), // REMOVED: Move more filtering to client to avoid index explosions
            orderBy("displayName"),
            limit(pageSize + 10) // Fetch slightly more to account for self/admin filtering
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

