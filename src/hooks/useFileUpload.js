import { useState, useCallback, useRef } from 'react';
import { storage } from '../firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';

export const useFileUpload = () => {
    const [uploads, setUploads] = useState({});
    const uploadTasksRef = useRef({});

    const startUpload = useCallback((file, path, metadata = {}) => {
        const uploadId = uuidv4();
        const storageRef = ref(storage, path);
        const uploadTask = uploadBytesResumable(storageRef, file, metadata);

        // Store task ref for control (pause/resume/cancel)
        uploadTasksRef.current[uploadId] = uploadTask;

        // Initialize state
        setUploads(prev => ({
            ...prev,
            [uploadId]: {
                id: uploadId,
                fileName: file.name,
                progress: 0,
                status: 'uploading', // uploading, paused, error, completed, cancelled
                error: null,
                url: null,
                fileType: file.type,
                fileSize: file.size
            }
        }));

        // Listen for state changes
        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploads(prev => ({
                    ...prev,
                    [uploadId]: {
                        ...prev[uploadId],
                        progress,
                        status: snapshot.state === 'paused' ? 'paused' : 'uploading'
                    }
                }));
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
                // We don't delete the task immediately so the UI can show "Completed"
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
