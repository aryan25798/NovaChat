import React, { useState, useEffect } from 'react';
import { FaTimes, FaEnvelope, FaInfoCircle, FaUsers, FaTrash, FaEdit, FaCheck, FaUserPlus, FaCrown, FaSignOutAlt } from 'react-icons/fa';
import { db } from "../firebase";
import { doc, getDoc, updateDoc, arrayRemove, arrayUnion, collection, getDocs } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";

export default function UserProfileModal({ user, onClose, isGroup, chatId }) {
    const [participants, setParticipants] = useState([]);
    const { currentUser } = useAuth();
    const [isAdmin, setIsAdmin] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [newName, setNewName] = useState(user.groupName || "");
    const [showAddUser, setShowAddUser] = useState(false);
    const [allUsers, setAllUsers] = useState([]);

    useEffect(() => {
        if (isGroup && user.participants) {
            // Fetch participant details
            const fetchParticipants = async () => {
                const list = [];
                for (const uid of user.participants) {
                    const snap = await getDoc(doc(db, "users", uid));
                    if (snap.exists()) {
                        list.push({ id: uid, ...snap.data(), role: user.chatRole?.[uid] || 'member' });
                    }
                }
                setParticipants(list);
            };
            fetchParticipants();

            // Check if current user is admin
            if (user.groupAdmin === currentUser.uid || user.chatRole?.[currentUser.uid] === 'admin') {
                setIsAdmin(true);
            }
        }
    }, [user, isGroup, currentUser]);

    // Fetch all users for "Add Participant"
    useEffect(() => {
        if (showAddUser) {
            const fetchAll = async () => {
                const snap = await getDocs(collection(db, "users"));
                const list = [];
                snap.forEach(d => {
                    if (d.id !== currentUser.uid && !user.participants.includes(d.id)) {
                        list.push({ id: d.id, ...d.data() });
                    }
                });
                setAllUsers(list);
            };
            fetchAll();
        }
    }, [showAddUser, user.participants]);

    const removeParticipant = async (uid) => {
        if (!isAdmin) return;
        if (window.confirm("Remove this user?")) {
            try {
                const chatRef = doc(db, "chats", chatId);
                await updateDoc(chatRef, {
                    participants: arrayRemove(uid)
                });
                setParticipants(prev => prev.filter(p => p.id !== uid));
            } catch (err) {
                console.error("Error removing participant", err);
            }
        }
    };

    const handleUpdateName = async () => {
        if (!newName.trim()) return;
        try {
            await updateDoc(doc(db, "chats", chatId), { groupName: newName });
            setIsEditing(false);
        } catch (err) { console.error("Update failed", err); }
    };

    const handlePromote = async (uid) => {
        if (!isAdmin) return;
        if (window.confirm("Make this user an Admin?")) {
            await updateDoc(doc(db, "chats", chatId), {
                [`chatRole.${uid}`]: 'admin'
            });
            setParticipants(prev => prev.map(p => p.id === uid ? { ...p, role: 'admin' } : p));
        }
    };

    const handleAddParticipant = async (uid) => {
        try {
            await updateDoc(doc(db, "chats", chatId), {
                participants: arrayUnion(uid),
                [`chatRole.${uid}`]: 'member'
            });
            setShowAddUser(false);
        } catch (err) { console.error("Add failed", err); }
    };

    const handleLeaveGroup = async () => {
        if (window.confirm("Are you sure you want to leave this group?")) {
            try {
                await updateDoc(doc(db, "chats", chatId), {
                    participants: arrayRemove(currentUser.uid)
                });
                onClose();
            } catch (err) { console.error("Leave failed", err); }
        }
    };

    if (!user) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content profile-card">
                <button className="close-btn" onClick={onClose}><FaTimes /></button>

                <div className="profile-header-img">
                    <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} alt={user.displayName} />
                </div>

                {isEditing ? (
                    <div className="name-edit-row">
                        <input value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
                        <button onClick={handleUpdateName}><FaCheck /></button>
                    </div>
                ) : (
                    <div className="name-row">
                        <h2 className="profile-name">{user.displayName || user.groupName}</h2>
                        {isGroup && isAdmin && <button className="edit-btn" onClick={() => setIsEditing(true)}><FaEdit /></button>}
                    </div>
                )}

                <div className="profile-status-bar">
                    {isGroup ? (
                        <p>{participants.length} participants</p>
                    ) : (
                        <div className="user-presence">
                            {(user.privacy?.lastSeen !== 'nobody') && (
                                <>
                                    <span className={`presence-dot ${user.isOnline ? 'online' : 'offline'}`}></span>
                                    <span>{user.isOnline ? 'Online' : `Last seen ${user.last_changed ? new Date(user.last_changed).toLocaleString() : 'recently'}`}</span>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="profile-details">
                    {!isGroup && (
                        <>
                            <div className="detail-row">
                                <FaEnvelope className="icon" />
                                <div>
                                    <label>Email</label>
                                    <p>{user.email || "Hidden"}</p>
                                </div>
                            </div>
                            <div className="detail-row">
                                <FaInfoCircle className="icon" />
                                <div>
                                    <label>About</label>
                                    <p>{user.about || "Available"}</p>
                                </div>
                            </div>
                        </>
                    )}

                    {isGroup && (
                        <div className="group-participants">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3><FaUsers /> Participants ({participants.length})</h3>
                                {isAdmin && <button className="add-btn" onClick={() => setShowAddUser(true)}><FaUserPlus /> Add</button>}
                            </div>

                            {showAddUser && (
                                <div className="add-user-dropdown">
                                    <h4>Select User to Add</h4>
                                    {allUsers.length === 0 ? <p>No users available</p> :
                                        allUsers.map(u => (
                                            <div key={u.id} className="add-user-item" onClick={() => handleAddParticipant(u.id)}>
                                                <img src={u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`} />
                                                <span>{u.displayName}</span>
                                            </div>
                                        ))
                                    }
                                    <button className="cancel-add" onClick={() => setShowAddUser(false)}>Cancel</button>
                                </div>
                            )}

                            <div className="participant-list">
                                {participants.map(p => (
                                    <div key={p.id} className="participant-item">
                                        <img src={p.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.id}`} className="tiny-avatar" />
                                        <div className="p-info">
                                            <span>{p.displayName} {p.id === currentUser.uid && "(You)"}</span>
                                            {p.role === 'admin' && <span className="admin-badge">Admin</span>}
                                        </div>
                                        {isAdmin && p.id !== currentUser.uid && (
                                            <div className="admin-actions">
                                                {p.role !== 'admin' && <button className="promote-btn" onClick={() => handlePromote(p.id)} title="Make Admin"><FaCrown /></button>}
                                                <button className="remove-btn" onClick={() => removeParticipant(p.id)} title="Remove"><FaTrash /></button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div style={{ marginTop: 20, borderTop: '1px solid #eee', paddingTop: 10 }}>
                                <button className="leave-group-btn" onClick={handleLeaveGroup}>
                                    <FaSignOutAlt /> Exit Group
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(11,20,26,0.85);
                    z-index: 3000;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    animation: fadeIn 0.1s ease;
                }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                
                .profile-card {
                    background: var(--sidebar-bg);
                    width: 400px;
                    height: auto;
                    max-height: 85vh;
                    border-radius: 3px;
                    overflow: hidden;
                    position: relative;
                    box-shadow: var(--shadow-md);
                    display: flex;
                    flex-direction: column;
                }
                
                .close-btn {
                    position: absolute;
                    top: 20px; left: 20px;
                    background: none;
                    border: none;
                    color: white;
                    font-size: 22px;
                    cursor: pointer;
                    z-index: 10;
                    text-shadow: 0 1px 3px rgba(0,0,0,0.5);
                }
                
                .profile-header-img {
                    width: 100%;
                    height: 380px;
                    background: #f0f2f5;
                    flex-shrink: 0;
                    box-shadow: inset 0 -40px 60px rgba(0,0,0,0.1);
                }
                .profile-header-img img {
                    width: 100%; height: 100%;
                    object-fit: cover;
                }
                
                .profile-name {
                    font-size: 24px;
                    padding: 20px 30px 5px;
                    color: var(--text-primary);
                    margin: 0;
                    font-weight: 400;
                }
                .profile-status-bar {
                    padding: 0 30px 20px;
                }
                .user-presence { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--text-secondary); }
                .presence-dot { width: 10px; height: 10px; border-radius: 50%; }
                .presence-dot.online { background: var(--light-green); }
                .presence-dot.offline { background: var(--text-lighter); }
                
                .profile-details {
                    padding: 0;
                    background: var(--header-bg);
                    flex: 1;
                    overflow-y: auto;
                }
                .detail-section {
                    background: var(--sidebar-bg);
                    margin-bottom: 10px;
                    padding: 14px 30px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
                }
                .detail-row {
                    display: flex;
                    align-items: center;
                    gap: 30px;
                }
                .detail-row .icon { color: var(--text-lighter); font-size: 20px; }
                .detail-row label { font-size: 14px; color: var(--teal-green); display: block; margin-bottom: 4px; }
                .detail-row p { font-size: 17px; color: var(--text-primary); margin: 0; }

                /* Group Styles */
                .group-participants { padding: 20px 30px; background: var(--sidebar-bg); }
                .group-participants h3 { font-size: 16px; font-weight: 500; color: var(--text-secondary); margin-bottom: 15px; }
                .participant-list { display: flex; flex-direction: column; gap: 0; }
                .participant-item {
                    display: flex; align-items: center; gap: 15px;
                    padding: 12px 0; border-bottom: 1px solid var(--divider);
                }
                .participant-item:last-child { border-bottom: none; }
                .tiny-avatar { width: 40px; height: 40px; border-radius: 50%; }
                .p-info { flex: 1; display: flex; flex-direction: column; }
                .p-info span { font-size: 16px; color: var(--text-primary); }
                .admin-badge {
                    font-size: 11px; color: var(--teal-green);
                    border: 1px solid var(--teal-green);
                    padding: 1px 4px; border-radius: 3px; align-self: flex-start;
                    margin-top: 2px;
                }
                .admin-actions { display: flex; gap: 8px; }
                .remove-btn { color: #ef4444; background: none; border: none; cursor: pointer; font-size: 14px; }
                .promote-btn { color: #f59e0b; background: none; border: none; cursor: pointer; font-size: 14px; }
                
                .name-row { display: flex; align-items: center; justify-content: space-between; padding-right: 20px; }
                .edit-btn { background: none; border: none; color: #666; cursor: pointer; }
                .name-edit-row { padding: 20px 30px; display: flex; gap: 10px; }
                .name-edit-row input { flex: 1; padding: 5px; border: 1px solid #ddd; border-radius: 4px; }
                
                .add-btn { background: none; border: none; color: var(--teal-green); cursor: pointer; display: flex; align-items: center; gap: 5px; font-weight: 500; }
                
                .add-user-dropdown {
                    background: #f9f9f9; padding: 10px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #eee;
                }
                .add-user-item { display: flex; align-items: center; gap: 10px; padding: 8px; cursor: pointer; border-radius: 4px; }
                .add-user-item:hover { background: #eee; }
                .add-user-item img { width: 30px; height: 30px; border-radius: 50%; }
                .cancel-add { margin-top: 5px; width: 100%; border: none; background: none; color: #666; cursor: pointer; font-size: 12px; }

                .leave-group-btn {
                    width: 100%; padding: 10px;
                    border: 1px solid #ef4444; color: #ef4444;
                    background: none; border-radius: 6px;
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                    cursor: pointer; transition: background 0.2s;
                }
                .leave-group-btn:hover { background: #fef2f2; }
            `}</style>
        </div>
    );
}
