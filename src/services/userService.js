import { db } from "../firebase";
import { collection, query, where, getDocs, limit, doc, updateDoc, arrayUnion, arrayRemove, documentId, orderBy, startAfter } from "firebase/firestore";

/**
 * Searches for users by email or display name using prefix search with pagination.
 * @param {string} searchTerm - The search term.
 * @param {string} currentUserId - The ID of the current user to exclude.
 * @param {Object} lastDoc - The last document snapshot for pagination.
 * @param {number} pageSize - Number of results to fetch.
 * @returns {Promise<Object>} - { users: Array, lastDoc: Object }
 */
export const searchUsersPaged = async (searchTerm, currentUserId, lastDoc = null, pageSize = 20) => {
    const term = (searchTerm || "").toLowerCase().trim();
    if (!term) return { users: [], lastDoc: null };

    const usersRef = collection(db, "users");
    // We fetch more to account for in-memory filtering of system/self users
    const FETCH_LIMIT = pageSize + 10;

    // Determine query strategy
    const qBase = query(
        usersRef,
        term.includes('@')
            ? where('email', '>=', term)
            : where('searchableName', '>=', term),
        term.includes('@')
            ? where('email', '<=', term + '\uf8ff')
            : where('searchableName', '<=', term + '\uf8ff'),
        orderBy(term.includes('@') ? 'email' : 'searchableName'),
        limit(FETCH_LIMIT)
    );

    const q = lastDoc ? query(qBase, startAfter(lastDoc)) : qBase;

    try {
        const snap = await getDocs(q);
        const users = [];
        let finalLastDoc = snap.docs[snap.docs.length - 1] || null;

        snap.forEach(doc => {
            const data = doc.data();
            // Filter system/self users
            const isSystemUser = doc.id.toLowerCase().includes('gemini') ||
                doc.id.toLowerCase().includes('admin') ||
                (data.displayName && (
                    data.displayName.toLowerCase().includes('gemini') ||
                    data.displayName.toLowerCase().includes('admin')
                ));

            if (doc.id !== currentUserId && !data.superAdmin && !data.isAdmin && !isSystemUser) {
                users.push({ id: doc.id, ...data });
            }
        });

        return {
            users: users.slice(0, pageSize),
            lastDoc: finalLastDoc
        };
    } catch (error) {
        console.error("Error searching users paged:", error);
        return { users: [], lastDoc: null };
    }
};

/**
 * LEGACY: Kept for compatibility, but searchUsersPaged is preferred for scale.
 */
export const searchUsers = async (searchTerm, currentUserId) => {
    const { users } = await searchUsersPaged(searchTerm, currentUserId, null, 10);
    return users;
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
        console.debug("[UserFetch] Fetching paged users. LastDoc:", !!lastDoc);
        let q = query(
            collection(db, "users"),
            orderBy("displayName"),
            limit(pageSize + 10)
        );

        if (lastDoc) {
            q = query(q, startAfter(lastDoc));
        }

        const snapshot = await getDocs(q);
        console.debug(`[UserFetch] Received ${snapshot.size} users from Firestore.`);

        const users = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(u => {
                const isSystemUser = u.id.toLowerCase().includes('gemini') ||
                    u.id.toLowerCase().includes('admin') ||
                    (u.displayName && (
                        u.displayName.toLowerCase().includes('gemini') ||
                        u.displayName.toLowerCase().includes('admin')
                    ));
                return u.id !== currentUserId && !u.superAdmin && !u.isAdmin && !isSystemUser;
            })
            .slice(0, pageSize);

        return {
            users,
            lastDoc: snapshot.docs[snapshot.docs.length - 1] || null
        };
    } catch (e) {
        console.error("Error fetching paged users:", e);
        return { users: [], lastDoc: null };
    }
};

