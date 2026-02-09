import { openDB } from 'idb';

const DB_NAME = 'whatsapp-clone-media-cache';
const STORE_NAME = 'media';

// Initialize DB
const initDB = async () => {
    return openDB(DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        },
    });
};

/**
 * Tries to get a blob URL from cache. If not found, returns null.
 * @param {string} url - The Firebase Storage URL
 * @returns {Promise<string|null>} - The object URL or null
 */
export const getCachedMedia = async (url) => {
    if (!url) return null;
    try {
        const db = await initDB();
        const record = await db.get(STORE_NAME, url);

        if (record && record.blob) {
            // Create a temporary object URL for the blob
            return URL.createObjectURL(record.blob);
        }
        return null;
    } catch (error) {
        console.error("Error retrieving cached media:", error);
        return null;
    }
};

/**
 * Downloads and caches a media file.
 * @param {string} url - The remote URL
 * @returns {Promise<string>} - The local Object URL
 */
export const cacheMedia = async (url) => {
    if (!url) return null;

    try {
        // 1. Check cache first
        const cachedUrl = await getCachedMedia(url);
        if (cachedUrl) return cachedUrl;

        // 2. Fetch from network
        const response = await fetch(url);
        const blob = await response.blob();

        // 3. Store in IndexedDB
        const db = await initDB();

        // Prune before adding (Simple LRU)
        await pruneCache(db);

        await db.put(STORE_NAME, {
            blob,
            timestamp: Date.now(),
            size: blob.size
        }, url);

        return URL.createObjectURL(blob);
    } catch (error) {
        if (error.message === 'Failed to fetch' || error.message?.includes('NetworkError')) {
            console.warn(`[MediaCache] Cannot cache (likely CORS/Offline): ${url}`);
        } else {
            console.error("Error caching media:", error);
        }
        // Fallback to original URL if caching fails
        return url;
    }
};

/**
 * Enforce LRU Policy: Max 500MB or 100 items
 */
const pruneCache = async (db) => {
    try {
        const MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500MB
        const MAX_ITEMS = 100;

        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        let cursor = await store.openCursor();
        let items = [];
        let totalSize = 0;

        while (cursor) {
            items.push({ key: cursor.key, value: cursor.value });
            totalSize += (cursor.value.size || 0);
            cursor = await cursor.continue();
        }

        // Sort by timestamp (oldest first)
        items.sort((a, b) => a.value.timestamp - b.value.timestamp);

        let deletedCount = 0;

        // Evict if over limits
        while ((totalSize > MAX_SIZE_BYTES || items.length > MAX_ITEMS) && items.length > 0) {
            const itemToRemove = items.shift();
            await store.delete(itemToRemove.key);
            totalSize -= (itemToRemove.value.size || 0);
            deletedCount++;
        }

        if (deletedCount > 0) {
            console.log(`Pruned ${deletedCount} items from media cache.`);
        }

    } catch (error) {
        console.error("Error pruning cache:", error);
    }
};

/**
 * Pre-caches a list of URLs (e.g. when opening a chat)
 */
export const preCacheMedia = async (urls) => {
    urls.forEach(url => cacheMedia(url));
};
