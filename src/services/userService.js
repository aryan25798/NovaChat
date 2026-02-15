import { db } from "../firebase";
import { collection, query, where, getDocs, limit, doc, updateDoc, arrayUnion, arrayRemove, documentId, orderBy, startAfter } from "firebase/firestore";

/**
 * Searches for users by email or display name using prefix search.
 * @param {string} searchTerm - The search term.
 * @param {string} currentUserId - The ID of the current user to exclude.
 * @returns {Promise<Array>} - List of found users.
 */
/**
 * Searches for users by email or display name using prefix search.
 * OPTIMIZED: Uses server-side filtering to avoid loading all users.
 * @param {string} searchTerm - The search term.
 * @param {string} currentUserId - The ID of the current user to exclude.
 * @returns {Promise<Array>} - List of found users.
 */
export const searchUsers = async (searchTerm, currentUserId) => {
    const term = (searchTerm || "").toLowerCase().trim();
    const usersRef = collection(db, "users");
    const FETCH_LIMIT = 20;

    // If no search term, return recent users (Server-side filtered)
    if (!term) {
        try {
            const q = query(
                usersRef,
                where("superAdmin", "==", false), // DB-Level Filter
                where("isAdmin", "==", false),    // DB-Level Filter
                orderBy("displayName"),
                limit(FETCH_LIMIT)
            );
            const snap = await getDocs(q);
            const users = [];
            snap.forEach(doc => {
                const data = doc.data();
                if (doc.id !== currentUserId) {
                    users.push({ id: doc.id, ...data });
                }
            });
            return users;
        } catch (e) {
            console.error("Error fetching default users:", e);
            // Fallback for missing index during deployment
            if (e.code === 'failed-precondition') {
                console.warn("Missing Index for Default Search. Please check firestore.indexes.json");
            }
            return [];
        }
    }

    const queries = [];

    if (term.includes('@')) {
        // Email Search matches do not need admin filtering if exact match, but let's be safe
        // Note: 'email' field is PII, ensure rules allow query.
        queries.push(query(
            usersRef,
            where('email', '>=', term),
            where('email', '<=', term + '\uf8ff'),
            where('superAdmin', '==', false),
            limit(FETCH_LIMIT)
        ));
    } else {
        // Priority 1: Search by searchableName (prepared field)
        // We rely on Composite Index: searchableName + superAdmin
        queries.push(query(
            usersRef,
            where('searchableName', '>=', term),
            where('searchableName', '<=', term + '\uf8ff'),
            where('superAdmin', '==', false),
            limit(FETCH_LIMIT)
        ));
    }

    try {
        const snapshots = await Promise.all(queries.map(q => getDocs(q)));
        const userMap = new Map();

        snapshots.forEach(snap => {
            snap.forEach(doc => {
                const data = doc.data();
                // Double-check just in case, but DB should have handled it
                if (doc.id !== currentUserId && data.superAdmin !== true && !data.isAdmin) {
                    userMap.set(doc.id, { id: doc.id, ...data });
                }
            });
        });

        const combined = Array.from(userMap.values());

        // Client-side sort for relevance (since we combined multiple queries)
        combined.sort((a, b) => {
            const nameA = (a.displayName || "").toLowerCase();
            const nameB = (b.displayName || "").toLowerCase();
            const startsA = nameA.startsWith(term);
            const startsB = nameB.startsWith(term);
            if (startsA && !startsB) return -1;
            if (!startsA && startsB) return 1;
            return nameA.localeCompare(nameB);
        });

        return combined.slice(0, 10);

    } catch (error) {
        console.error("Error searching users:", error);
        return [];
    }
};

/**
 * Blocks a user using Cloud Function for atomic cleanup.
 */
export const blockUser = async (currentUserId, targetUserId) => {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const functions = getFunctions();
    const blockFunc = httpsCallable(functions, 'blockUser');
    return blockFunc({ targetUserId });
};

/**
 * Unblocks a user using Cloud Function.
 */
export const unblockUser = async (currentUserId, targetUserId) => {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const functions = getFunctions();
    const unblockFunc = httpsCallable(functions, 'unblockUser');
    return unblockFunc({ targetUserId });
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

