import React, { useState, useEffect } from "react";
import { FaTrash } from "react-icons/fa";
import { subscribeToChatMessages, deleteChatPermanently, deleteMessagePermanently } from "../../services/adminService";

export default function SpyView({ chats, users, currentUser }) {
    const [selectedChat, setSelectedChat] = useState(null);
    const [messages, setMessages] = useState([]);

    useEffect(() => {
        if (!selectedChat) return;
        const unsub = subscribeToChatMessages(selectedChat.id, (msgs) => {
            setMessages(msgs);
        });
        return () => unsub();
    }, [selectedChat]);

    const getUserName = (uid) => {
        const u = users.find(user => user.id === uid);
        return u ? u.displayName : "Unknown";
    }

    const getChatName = (chat) => {
        if (chat.groupName) return `Group: ${chat.groupName}`;
        const names = chat.participants.map(p => getUserName(p)).join(", ");
        return names || "Chat";
    }

    const handleDeleteChat = async (e, chatId) => {
        e.stopPropagation();
        const confirmMsg = currentUser?.isSuperAdmin
            ? "PERMANENTLY delete this entire chat from the database? This cannot be undone."
            : "Delete this entire chat?";

        if (window.confirm(confirmMsg)) {
            await deleteChatPermanently(chatId);
            if (selectedChat?.id === chatId) setSelectedChat(null);
        }
    }

    const handleDeleteMessage = async (msgId) => {
        const confirmMsg = currentUser?.isSuperAdmin
            ? "PERMANENTLY delete this message from the database?"
            : "Delete this message?";

        if (window.confirm(confirmMsg)) {
            await deleteMessagePermanently(selectedChat.id, msgId);
        }
    }

    return (
        <div style={{ height: '100%' }}>
            <h1>Surveillance Mode</h1>
            <div className="spy-layout">
                <div className="spy-sidebar">
                    {chats.map(chat => (
                        <div key={chat.id} className={`spy-item ${selectedChat?.id === chat.id ? 'active' : ''}`} onClick={() => setSelectedChat(chat)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <p style={{ fontWeight: 'bold', margin: '0 0 5px 0' }}>{getChatName(chat)}</p>
                                    <p style={{ fontSize: '0.8rem', color: '#888', margin: 0 }}>
                                        {chat.lastMessage?.text || "No messages"}
                                    </p>
                                    {chat.deletedBy && Object.keys(chat.deletedBy).length > 0 && (
                                        <div style={{ marginTop: '5px', fontSize: '0.75rem', color: '#ff4b4b', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                            <span>🗑️ Deleted by:</span>
                                            {Object.keys(chat.deletedBy).map(uid => (
                                                <span key={uid} style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1px 4px', borderRadius: '3px' }}>
                                                    {getUserName(uid)}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button className="action-btn delete" onClick={(e) => handleDeleteChat(e, chat.id)}><FaTrash /></button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="spy-main">
                    {selectedChat ? (
                        <>
                            <div className="table-header"><h3>Monitoring: {getChatName(selectedChat)}</h3></div>
                            <div className="spy-msg-list">
                                {messages.map(msg => (
                                    <div key={msg.id} className={`spy-message ${msg.isSoftDeleted ? 'deleted' : ''}`}>
                                        <div style={{ fontWeight: 'bold', color: '#00a884', display: 'flex', justifyContent: 'space-between' }}>
                                            {getUserName(msg.senderId)}
                                            <button onClick={() => handleDeleteMessage(msg.id)} style={{ border: 'none', background: 'none', color: '#666', cursor: 'pointer' }}><FaTrash size={12} /></button>
                                        </div>
                                        <div>{msg.isSoftDeleted ? (
                                            <div className="spy-message deleted" style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px dashed #ef4444', padding: '8px', borderRadius: '4px' }}>
                                                <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.7rem', display: 'block', marginBottom: '4px' }}>[USER DELETED]</span>
                                                <div style={{ opacity: 0.8 }}>{msg.text || (msg.mediaUrl ? "[Media Attachment]" : "")}</div>
                                            </div>
                                        ) : (
                                            <div>{msg.text}</div>
                                        )}</div>

                                        {msg.mediaUrl && <div style={{ fontSize: '0.8rem', color: '#aaa' }}>[Media Attachment]</div>}

                                        <div className="spy-meta">
                                            <span>{msg.timestamp?.toDate().toLocaleString()}</span>
                                            <span>{msg.read ? "Read" : "Delivered"}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555' }}>
                            <p>Select a chat to inspect</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
