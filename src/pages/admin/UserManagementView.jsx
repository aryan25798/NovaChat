import React, { useState } from "react";
import { FaSearch, FaBan, FaTrash } from "react-icons/fa";
import { toggleUserBan, deleteUserAndData } from "../../services/adminService";

export default function UserManagementView({ users }) {
    const [searchTerm, setSearchTerm] = useState("");

    const handleToggleBan = async (uid, currentStatus) => {
        if (window.confirm(`${currentStatus ? 'Unban' : 'Ban'} this user?`)) {
            try {
                await toggleUserBan(uid, currentStatus);
            } catch (err) {
                console.error("Ban update failed:", err);
            }
        }
    }

    const filteredUsers = users.filter(u =>
        u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleDeleteUser = async (uid) => {
        if (window.confirm("Danger: Nuke this user? This will delete their account, chats, and messages.")) {
            try {
                await deleteUserAndData(uid);
                alert("User NUKED successfully.");
            } catch (err) {
                console.error("Nuke failed:", err);
                alert("Nuke partial failure: " + err.message);
            }
        }
    };

    return (
        <div>
            <h1>User Management</h1>
            <div className="data-table-container">
                <div className="table-header">
                    <h3>All Users</h3>
                    <div className="search-bar">
                        <FaSearch />
                        <input
                            type="text"
                            placeholder="Search users..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Email</th>
                            <th>Status / Location</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers.map(user => (
                            <tr key={user.id}>
                                <td>
                                    <div className="user-cell">
                                        <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`} className="avatar-small" />
                                        {user.displayName}
                                    </div>
                                </td>
                                <td>{user.email}</td>
                                <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span className={`badge ${user.isOnline ? 'online' : 'offline'}`}>
                                            {user.isOnline ? 'Online' : 'Offline'}
                                        </span>
                                        {user.lastLoginLocation && (
                                            <small style={{ color: '#8696a0', fontSize: '11px' }}>
                                                📍 {user.lastLoginLocation.lat.toFixed(4)}, {user.lastLoginLocation.lng.toFixed(4)}
                                            </small>
                                        )}
                                        {user.deletionRequested && (
                                            <span className="badge danger animate-pulse" style={{ fontSize: '10px', marginTop: '4px' }}>
                                                ⚠️ DELETION REQUESTED
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td>
                                    <button
                                        className={`action-btn ${user.isBanned ? 'unban' : 'ban'}`}
                                        onClick={() => handleToggleBan(user.id, user.isBanned)}
                                        title={user.isBanned ? "Unban User" : "Ban User"}
                                    >
                                        <FaBan style={{ color: user.isBanned ? '#ffbc00' : '#ef4444' }} />
                                    </button>
                                    <button
                                        className={`action-btn delete ${user.deletionRequested ? 'urgent-nuke' : ''}`}
                                        onClick={() => handleDeleteUser(user.id)}
                                        title="Nuke User"
                                        style={user.deletionRequested ? { backgroundColor: '#ef4444', color: 'white' } : {}}
                                    >
                                        <FaTrash />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
