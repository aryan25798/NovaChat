import React from "react";
import { FaTrash } from "react-icons/fa";
import { deleteStatus } from "../../services/adminService";

export default function StatusModerationView({ statuses, users }) {
    const handleDeleteStatus = async (docId) => {
        if (window.confirm("Delete this user's entire status update?")) {
            await deleteStatus(docId);
        }
    };

    const getUser = (uid) => users.find(u => u.id === uid) || { displayName: "Unknown" };

    return (
        <div>
            <h1>Status Moderation</h1>
            <div className="data-table-container">
                <table>
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Updates Count</th>
                            <th>Last Update</th>
                            <th>Preview</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {statuses.map(status => {
                            const user = getUser(status.userId);
                            return (
                                <tr key={status.id}>
                                    <td>
                                        <div className="user-cell">
                                            <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`} className="avatar-small" />
                                            {user.displayName}
                                        </div>
                                    </td>
                                    <td>{status.items?.length || 0} items</td>
                                    <td>{status.items?.length > 0 ? new Date(status.items[status.items.length - 1].timestamp?.toDate()).toLocaleString() : "N/A"}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 5 }}>
                                            {status.items?.slice(-3).map((item, i) => (
                                                <div key={i} style={{ width: 30, height: 30, background: '#333', borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {item.type === 'text' ? 'T' : <img src={item.content} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                                </div>
                                            ))}
                                        </div>
                                    </td>
                                    <td>
                                        <button className="action-btn delete" onClick={() => handleDeleteStatus(status.id)} title="Delete Status"><FaTrash /></button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
