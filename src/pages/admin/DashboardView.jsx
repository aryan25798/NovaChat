import React from "react";
import { FaUsers, FaChartPie, FaCircleNotch, FaCheck } from "react-icons/fa";

export default function DashboardView({ stats, users }) {
    return (
        <div>
            <h1>Dashboard Overview</h1>
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon"><FaUsers /></div>
                    <div className="stat-info"><h3>{stats.totalUsers}</h3><p>Total Users</p></div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ color: '#25d366', background: 'rgba(37,211,102,0.2)' }}><FaChartPie /></div>
                    <div className="stat-info"><h3>{stats.onlineUsers}</h3><p>Online Now</p></div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ color: '#ff0080', background: 'rgba(255,0,128,0.2)' }}><FaCircleNotch /></div>
                    <div className="stat-info"><h3>{stats.totalStatus}</h3><p>Active Statuses</p></div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ color: '#34b7f1', background: 'rgba(52,183,241,0.2)' }}><FaCheck /></div>
                    <div className="stat-info"><h3>{stats.totalChats}</h3><p>Active Chats</p></div>
                </div>
            </div>
        </div>
    );
}
