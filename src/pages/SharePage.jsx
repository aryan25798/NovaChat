import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../firebase';
import { collection, query, where, getDocs, orderBy, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { FaPaperPlane, FaSpinner, FaImage, FaTimes } from 'react-icons/fa';
import Layout from '../layouts/MainLayout';

const SharePage = () => {
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [sharedData, setSharedData] = useState(null);
    const [sharedMediaBlob, setSharedMediaBlob] = useState(null);
    const [chats, setChats] = useState([]);
    const [selectedChats, setSelectedChats] = useState([]);
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [error, setError] = useState('');

    useEffect(() => {
        const loadSharedContent = async () => {
            try {
                // Check if we have shared data in cache
                if ('caches' in window) {
                    const cache = await caches.open('share-target-cache');
                    const response = await cache.match('/api/share-data');

                    if (response) {
                        const data = await response.json();
                        setSharedData(data);

                        if (data.hasMedia) {
                            const mediaResponse = await cache.match('/api/share-media');
                            if (mediaResponse) {
                                const blob = await mediaResponse.blob();
                                setSharedMediaBlob(blob);
                            }
                        }

                        // Cleanup cache after reading
                        // await cache.delete('/api/share-data');
                        // await cache.delete('/api/share-media');
                    } else {
                        // No data found, redirect to home
                        navigate('/');
                        return;
                    }
                }
            } catch (err) {
                console.error("Error loading shared content:", err);
                setError("Failed to load shared content.");
            } finally {
                setLoading(false);
            }
        };

        const loadChats = async () => {
            if (!currentUser) return;
            try {
                // Determine if we are in share mode first
                // Better parallel execution:
                // loadSharedContent is critical. loadChats is needed only if we have content.
            } catch (err) {
                console.error("Error loading chats:", err);
            }
        };

        if (currentUser) {
            loadSharedContent();

            // Fetch recent chats efficiently
            const fetchChats = async () => {
                const q = query(
                    collection(db, 'chats'),
                    where('participants', 'array-contains', currentUser.uid),
                    orderBy('lastMessageTime', 'desc')
                    // limit(10) // Optional limit
                );
                const snapshot = await getDocs(q);

                // Process chats to get display names
                const chatList = await Promise.all(snapshot.docs.map(async (doc) => {
                    const chatData = doc.data();
                    let name = 'Chat';
                    let photo = null;

                    if (chatData.isGroup) {
                        name = chatData.groupName;
                        photo = chatData.groupPhoto;
                    } else {
                        const otherId = chatData.participants.find(p => p !== currentUser.uid);
                        // In a real app we'd fetch the user profile. 
                        // For now we might rely on cached profiles or just use ID if simple.
                        // Ideally we fetch user data.
                        const userDoc = await getDocs(query(collection(db, 'users'), where('uid', '==', otherId)));
                        if (!userDoc.empty) {
                            const userData = userDoc.docs[0].data();
                            name = userData.displayName;
                            photo = userData.photoURL;
                        }
                    }
                    return { id: doc.id, ...chatData, displayName: name, photoURL: photo };
                }));
                setChats(chatList);
            };
            fetchChats();
        }

    }, [currentUser, navigate]);

    const toggleChat = (chatId) => {
        setSelectedChats(prev =>
            prev.includes(chatId)
                ? prev.filter(id => id !== chatId)
                : [...prev, chatId]
        );
    };

    const handleSend = async () => {
        if (selectedChats.length === 0) return;
        setSending(true);

        try {
            let mediaUrl = null;
            let mediaType = null;

            if (sharedMediaBlob) {
                // Upload media
                const fileExt = sharedMediaBlob.type.split('/')[1] || 'bin';
                const fileName = `shared_${Date.now()}.${fileExt}`;
                const storageRef = ref(storage, `chat_media/${fileName}`);
                await uploadBytes(storageRef, sharedMediaBlob);
                mediaUrl = await getDownloadURL(storageRef);
                mediaType = sharedMediaBlob.type.startsWith('image') ? 'image' : 'video'; // Simple check
            }

            // Send to all selected chats
            const promises = selectedChats.map(async (chatId) => {
                const messageData = {
                    text: sharedData.text || '',
                    senderId: currentUser.uid,
                    senderName: currentUser.displayName, // Ideally from profile
                    senderPhoto: currentUser.photoURL,
                    timestamp: serverTimestamp(),
                    read: false,
                    delivered: false,
                    type: mediaUrl ? 'media' : 'text',
                };

                if (mediaUrl) {
                    messageData.mediaUrl = mediaUrl;
                    messageData.mediaType = mediaType;
                }

                const messagesRef = collection(db, 'chats', chatId, 'messages');
                await addDoc(messagesRef, messageData);

                // Update last message
                await updateDoc(doc(db, 'chats', chatId), {
                    lastMessage: mediaUrl ? (mediaType === 'image' ? '📷 Image' : '🎥 Video') : (sharedData.text || 'Shared content'),
                    lastMessageTime: serverTimestamp(),
                    [`unreadCount.${chatId}`]: 1 // Simplified: logic needs to increment per participant
                });
            });

            await Promise.all(promises);

            // Cleanup cache on success
            if ('caches' in window) {
                const cache = await caches.open('share-target-cache');
                await cache.delete('/api/share-data');
                await cache.delete('/api/share-media');
            }

            navigate('/');

        } catch (err) {
            console.error("Error sending shared content:", err);
            setError("Failed to send content.");
            setSending(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-background text-primary">
                <FaSpinner className="animate-spin text-4xl" />
            </div>
        );
    }

    if (!sharedData) return null;

    return (
        <div className="flex flex-col h-[100dvh] bg-surface text-text-1">
            {/* Header */}
            <div className="h-16 px-4 flex items-center bg-surface-elevated border-b border-border/30 shadow-sm shrink-0">
                <Button variant="ghost" className="mr-2" onClick={() => navigate('/')}>
                    <FaTimes />
                </Button>
                <h1 className="text-lg font-semibold flex-1">Share to...</h1>
            </div>

            {/* Content Preview */}
            <div className="p-4 bg-background/50 border-b border-border/30 shrink-0">
                <div className="bg-surface p-3 rounded-lg shadow-sm border border-border/50 flex gap-3">
                    {sharedMediaBlob ? (
                        <div className="w-16 h-16 bg-black/10 rounded-md flex items-center justify-center shrink-0 overflow-hidden">
                            {sharedMediaBlob.type.startsWith('image') ? (
                                <img src={URL.createObjectURL(sharedMediaBlob)} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <FaImage className="text-text-2" />
                            )}
                        </div>
                    ) : null}
                    <div className="flex-1 min-w-0">
                        {sharedData.text && (
                            <p className="text-sm line-clamp-3 whitespace-pre-wrap">{sharedData.text}</p>
                        )}
                        {!sharedData.text && !sharedData.hasMedia && (
                            <p className="text-sm italic text-text-2">No content</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Chat Selection */}
            <div className="flex-1 overflow-y-auto p-2">
                <h2 className="px-2 py-2 text-xs font-bold text-primary uppercase tracking-wider">Recent Chats</h2>
                {chats.map(chat => (
                    <div
                        key={chat.id}
                        onClick={() => toggleChat(chat.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors mb-1 ${selectedChats.includes(chat.id)
                                ? 'bg-primary/10 border border-primary/30'
                                : 'hover:bg-surface-elevated border border-transparent'
                            }`}
                    >
                        <div className="relative">
                            <Avatar src={chat.photoURL} alt={chat.displayName} size="md" />
                            {selectedChats.includes(chat.id) && (
                                <div className="absolute -bottom-1 -right-1 bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center text-xs border-2 border-surface">
                                    ✓
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-text-1 truncate">{chat.displayName}</h3>
                            <p className="text-xs text-text-2 truncate">
                                {chat.isGroup ? 'Group' : 'Private Chat'}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer Action */}
            <div className="p-4 bg-surface-elevated border-t border-border/30 shrink-0">
                <Button
                    className="w-full rounded-full h-12 text-[15px] font-semibold shadow-premium"
                    disabled={selectedChats.length === 0 || sending}
                    onClick={handleSend}
                >
                    {sending ? (
                        <FaSpinner className="animate-spin mr-2" />
                    ) : (
                        <FaPaperPlane className="mr-2" />
                    )}
                    Send to {selectedChats.length} chat{selectedChats.length !== 1 ? 's' : ''}
                </Button>
            </div>
        </div>
    );
};

export default SharePage;
