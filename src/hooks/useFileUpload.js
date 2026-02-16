import { useState, useCallback, useRef } from 'react';
import { storage } from '../firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import imageCompression from 'browser-image-compression';

/**
 * @deprecated Use FileUploadContext instead. This hook duplicates upload logic
 * that is already centralized in FileUploadContext.jsx. Migrate callers to
 * useContext(FileUploadContext) and remove this file.
 */
export const useFileUpload = () => {
    const [uploads, setUploads] = useState({});
    const uploadTasksRef = useRef({});

    const startUpload = useCallback(async (file, path, metadata = {}) => {
        const uploadId = uuidv4();

        // Initial state: Compressing
        setUploads(prev => ({
            ...prev,
            [uploadId]: {
                id: uploadId,
                fileName: file.name,
                progress: 0,
                status: 'compressing',
                error: null,
                url: null,
                fileType: file.type,
                fileSize: file.size
            }
        }));

        let processedFile = file;

        // Compress if it's an image
        if (file.type.startsWith('image/')) {
            try {
                const options = {
                    maxSizeMB: 1,
                    maxWidthOrHeight: 1920,
                    useWebWorker: true
                };
                processedFile = await imageCompression(file, options);
                console.log(`Compressed: ${file.size} -> ${processedFile.size}`);
            } catch (error) {
                console.warn("Compression failed, using original file", error);
            }
        }

        const storageRef = ref(storage, path);
        const uploadTask = uploadBytesResumable(storageRef, processedFile, metadata);

        // Store task ref
        uploadTasksRef.current[uploadId] = uploadTask;

        // Update state to uploading
        setUploads(prev => ({
            ...prev,
            [uploadId]: {
                ...prev[uploadId],
                fileSize: processedFile.size, // Update with compressed size
                status: 'uploading'
            }
        }));


        // Listen for state changes
        let lastUpdate = 0;
        uploadTask.on('state_changed',
            (snapshot) => {
                const now = Date.now();
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;

                // Throttle updates to once every 300ms, but always allow 0% and 100% (or very close to it)
                if (now - lastUpdate > 300 || progress === 0 || progress >= 100) {
                    lastUpdate = now;
                    setUploads(prev => ({
                        ...prev,
                        [uploadId]: {
                            ...prev[uploadId],
                            progress,
                            status: snapshot.state === 'paused' ? 'paused' : 'uploading'
                        }
                    }));
                }
            },
            (error) => {
                console.error("Upload error:", error);
                setUploads(prev => ({
                    ...prev,
                    [uploadId]: {
                        ...prev[uploadId],
                        status: 'error',
                        error: error.message
                    }
                }));
                delete uploadTasksRef.current[uploadId];
            },
            async () => {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                setUploads(prev => ({
                    ...prev,
                    [uploadId]: {
                        ...prev[uploadId],
                        progress: 100,
                        status: 'completed',
                        url: downloadURL
                    }
                }));
            }
        );

        return { uploadId, uploadTask };
    }, []);

    const pauseUpload = useCallback((uploadId) => {
        const task = uploadTasksRef.current[uploadId];
        if (task) {
            task.pause();
            setUploads(prev => ({
                ...prev,
                [uploadId]: { ...prev[uploadId], status: 'paused' }
            }));
        }
    }, []);

    const resumeUpload = useCallback((uploadId) => {
        const task = uploadTasksRef.current[uploadId];
        if (task) {
            task.resume();
            setUploads(prev => ({
                ...prev,
                [uploadId]: { ...prev[uploadId], status: 'uploading' }
            }));
        }
    }, []);

    const cancelUpload = useCallback((uploadId) => {
        const task = uploadTasksRef.current[uploadId];
        if (task) {
            task.cancel();
            setUploads(prev => ({
                ...prev,
                [uploadId]: { ...prev[uploadId], status: 'cancelled' }
            }));
            delete uploadTasksRef.current[uploadId];
        }
    }, []);

    const clearCompleted = useCallback(() => {
        setUploads(prev => {
            const newUploads = { ...prev };
            Object.keys(newUploads).forEach(key => {
                if (newUploads[key].status === 'completed' || newUploads[key].status === 'cancelled') {
                    delete newUploads[key];
                    if (uploadTasksRef.current[key]) {
                        delete uploadTasksRef.current[key];
                    }
                }
            });
            return newUploads;
        });
    }, []);

    const removeUpload = useCallback((uploadId) => {
        setUploads(prev => {
            const newUploads = { ...prev };
            delete newUploads[uploadId];
            return newUploads;
        });
        if (uploadTasksRef.current[uploadId]) {
            delete uploadTasksRef.current[uploadId];
        }
    }, []);

    return {
        uploads,
        startUpload,
        pauseUpload,
        resumeUpload,
        cancelUpload,
        clearCompleted,
        removeUpload
    };
};
