import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { storage } from '../firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import imageCompression from 'browser-image-compression';

const FileUploadContext = createContext();

export const useFileUpload = () => useContext(FileUploadContext);

export const FileUploadProvider = ({ children }) => {
    const [uploads, setUploads] = useState({});
    const uploadTasksRef = useRef({});

    const startUpload = useCallback(async (file, path, metadata = {}, uploadId = uuidv4()) => {
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
                fileSize: file.size,
                path: path
            }
        }));

        let processedFile = file;
        let dimensions = null;

        // Detect dimensions and compress if it's an image
        if (file.type.startsWith('image/')) {
            try {
                dimensions = await new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve({ width: img.width, height: img.height });
                    img.onerror = () => resolve(null);
                    img.src = URL.createObjectURL(file);
                });

                const options = {
                    maxSizeMB: 1,
                    maxWidthOrHeight: 1600,
                    useWebWorker: true,
                    initialQuality: 0.8
                };
                processedFile = await imageCompression(file, options);
            } catch (error) {
                console.warn("Compression / Dimension check failed", error);
            }
        }

        // Before starting, check if it was cancelled during compression
        let isCancelled = false;
        setUploads(prev => {
            if (!prev[uploadId] || prev[uploadId].status === 'cancelled') {
                isCancelled = true;
            }
            return prev;
        });

        if (isCancelled) return { uploadId, uploadTask: null };

        const storageRef = ref(storage, path);
        const uploadTask = uploadBytesResumable(storageRef, processedFile, metadata);

        // Store task ref
        uploadTasksRef.current[uploadId] = uploadTask;

        // Update state to uploading
        setUploads(prev => ({
            ...prev,
            [uploadId]: {
                ...prev[uploadId],
                fileSize: processedFile.size,
                status: 'uploading',
                width: dimensions?.width,
                height: dimensions?.height
            }
        }));

        // Listen for state changes (throttle updates)
        let lastUpdate = 0;
        uploadTask.on('state_changed',
            (snapshot) => {
                const now = Date.now();
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;

                // Emit at most every 200ms or on key events to reduce flickering
                if (now - lastUpdate > 200 || progress === 0 || progress >= 100) {
                    lastUpdate = now;
                    setUploads(prev => {
                        // Don't update if already removed or cancelled
                        if (!prev[uploadId]) return prev;
                        return {
                            ...prev,
                            [uploadId]: {
                                ...prev[uploadId],
                                progress,
                                status: snapshot.state === 'paused' ? 'paused' : 'uploading'
                            }
                        };
                    });
                }
            },
            (error) => {
                console.error("Upload error:", error);
                setUploads(prev => {
                    if (!prev[uploadId]) return prev;
                    return {
                        ...prev,
                        [uploadId]: {
                            ...prev[uploadId],
                            status: error.code === 'storage/canceled' ? 'cancelled' : 'error',
                            error: error.message
                        }
                    };
                });
                delete uploadTasksRef.current[uploadId];
            },
            async () => {
                try {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    setUploads(prev => {
                        if (!prev[uploadId]) return prev;
                        return {
                            ...prev,
                            [uploadId]: {
                                ...prev[uploadId],
                                progress: 100,
                                status: 'completed',
                                url: downloadURL
                            }
                        };
                    });
                } catch (e) {
                    console.error("Failed to get download URL", e);
                } finally {
                    delete uploadTasksRef.current[uploadId];
                }
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

    const value = useMemo(() => ({
        uploads,
        startUpload,
        pauseUpload,
        resumeUpload,
        cancelUpload,
        clearCompleted,
        removeUpload
    }), [uploads, startUpload, pauseUpload, resumeUpload, cancelUpload, clearCompleted, removeUpload]);

    return (
        <FileUploadContext.Provider value={value}>
            {children}
        </FileUploadContext.Provider>
    );
};
