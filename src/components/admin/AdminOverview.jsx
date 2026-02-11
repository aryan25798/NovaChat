import React, { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, AreaChart, Area
} from 'recharts';
import { Activity, BarChart3, Users, Zap, Satellite, Lock } from 'lucide-react';

const GrowthChart = React.memo(({ data, hasMounted }) => (
    <div className="bg-white dark:bg-[#1f2937] p-8 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden group">
        <div className="flex items-center justify-between mb-8">
            <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">Growth Trajectory</h3>
                <p className="text-xs text-gray-400">Monthly user acquisition trend</p>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 p-2 rounded-xl">
                <Activity size={20} />
            </div>
        </div>
        <div className="h-[300px] min-h-[300px] w-full overflow-hidden">
            {hasMounted && (
                <ResponsiveContainer width="99%" height="100%" minWidth={0} debounce={50}>
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="#374151" opacity={0.05} />
                        <XAxis
                            dataKey="date"
                            tick={{ fontSize: 9, fill: '#94a3b8', fontVariant: 'small-caps', fontWeight: 'bold' }}
                            axisLine={false}
                            tickLine={false}
                            minTickGap={40}
                        />
                        <YAxis
                            tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 'bold' }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#1f2937',
                                borderRadius: '16px',
                                border: '1px solid #374151',
                                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
                            }}
                            itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="count"
                            stroke="#6366f1"
                            strokeWidth={4}
                            fillOpacity={1}
                            fill="url(#colorUsers)"
                            animationDuration={2000}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            )}
        </div>
    </div>
));

const TrafficChart = React.memo(({ data, hasMounted }) => (
    <div className="bg-white dark:bg-[#1f2937] p-8 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between mb-8">
            <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">Traffic Density</h3>
                <p className="text-xs text-gray-400">Intra-day message distribution</p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 p-2 rounded-xl">
                <BarChart3 size={20} />
            </div>
        </div>
        <div className="h-[300px] min-h-[300px] w-full overflow-hidden">
            {hasMounted && (
                <ResponsiveContainer width="99%" height="100%" minWidth={0} debounce={50}>
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="#374151" opacity={0.05} />
                        <XAxis
                            dataKey="hour"
                            tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 'bold' }}
                            axisLine={false}
                            tickLine={false}
                            interval={2}
                        />
                        <YAxis
                            tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 'bold' }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            cursor={{ fill: 'rgba(99,102,241,0.05)', radius: 8 }}
                            contentStyle={{
                                backgroundColor: '#1f2937',
                                borderRadius: '16px',
                                border: '1px solid #374151'
                            }}
                        />
                        <Bar
                            dataKey="count"
                            fill="#10b981"
                            radius={[6, 6, 0, 0]}
                            animationDuration={1500}
                        />
                    </BarChart>
                </ResponsiveContainer>
            )}
        </div>
    </div>
));

const AdminOverview = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [hasMounted, setHasMounted] = useState(false);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const getStatsFn = httpsCallable(functions, 'getAdminStats');
                const result = await getStatsFn();
                setStats(result.data);
            } catch (err) {
                console.error("Failed to fetch stats:", err);
                setError(err.message);
            } finally {
                setLoading(false);
                // Delay mounting of charts slightly after loading ends to ensure DOM reflow
                setTimeout(() => setHasMounted(true), 150);
            }
        };

        fetchStats();
    }, []);

    const SkeletonCard = () => (
        <div className="bg-white dark:bg-[#1f2937] p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm animate-pulse">
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div className="h-8 w-16 bg-gray-300 dark:bg-gray-600 rounded mb-2" />
            <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
    );

    const SkeletonChart = () => (
        <div className="bg-white dark:bg-[#1f2937] p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm h-[400px] flex flex-col animate-pulse">
            <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-8" />
            <div className="flex-1 w-full bg-gray-50 dark:bg-gray-800/50 rounded-xl" />
        </div>
    );

    if (loading) {
        return (
            <div className="p-8 space-y-8 h-full overflow-y-auto">
                <div className="space-y-2">
                    <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-4 w-64 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <SkeletonCard /> <SkeletonCard /> <SkeletonCard /> <SkeletonCard />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <SkeletonChart /> <SkeletonChart />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-12 text-center h-full flex items-center justify-center">
                <div className="bg-white dark:bg-[#1f2937] p-8 rounded-3xl border border-red-100 dark:border-red-900/30 shadow-2xl max-w-md">
                    <div className="w-16 h-16 bg-red-100 dark:bg-red-900/40 rounded-2xl flex items-center justify-center text-red-600 dark:text-red-400 mx-auto mb-6 text-2xl">⚠️</div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Neural Link Failed</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{error}</p>
                    <button onClick={() => window.location.reload()} className="px-6 py-2 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-colors">Retry Uplink</button>
                </div>
            </div>
        );
    }

    const Card = ({ title, value, subtext, icon, color, trend }) => (
        <div className="bg-white dark:bg-[#1f2937] p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden group hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300">
            <div className={`absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-125 duration-500 ${color.replace('text-', 'bg-').replace('500', '600')} rounded-full -mr-4 -mt-4`}>
                <div className="text-white">{icon}</div>
            </div>
            <div className="relative z-10">
                <div className="flex items-center justify-between mb-3 text-gray-400">
                    <span className="text-[10px] font-bold uppercase tracking-widest">{title}</span>
                    <div className={color}>{icon}</div>
                </div>
                <h3 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">{value}</h3>
                <div className={`flex items-center gap-1.5 mt-3 text-xs font-bold ${trend === 'up' ? 'text-emerald-500' : 'text-amber-500'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${trend === 'up' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    {subtext}
                </div>
            </div>
        </div>
    );

    return (
        <div className="p-6 md:p-8 h-full overflow-y-auto custom-scrollbar bg-[#f9fafb] dark:bg-[#0b0f1a] space-y-10">

            {/* Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Command Center</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">Neural telemetry and real-time system performance.</p>
                </div>
                <div className="hidden md:flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-white dark:bg-gray-800 px-4 py-2 rounded-full border border-gray-100 dark:border-gray-700">
                    Last Update: <span className="text-indigo-500">Just Now</span>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card
                    title="Total Users"
                    value={stats.totalUsers}
                    subtext="+4.2% growth"
                    icon={<Users size={24} />}
                    color="text-indigo-500"
                    trend="up"
                />
                <Card
                    title="Active Burst"
                    value={stats.activeUsers24h}
                    subtext="Real-time traffic"
                    icon={<Zap size={24} />}
                    color="text-amber-500"
                    trend="up"
                />
                <Card
                    title="Neural Traffic"
                    value={stats.totalMessages}
                    subtext="Processing load"
                    icon={<Satellite size={24} />}
                    color="text-emerald-500"
                    trend="up"
                />
                <Card
                    title="System Uptime"
                    value="99.9%"
                    subtext="Nominal status"
                    icon={<Lock size={24} />}
                    color="text-purple-500"
                    trend="up"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {stats?.charts?.userGrowth && <GrowthChart data={stats.charts.userGrowth} hasMounted={hasMounted} />}
                {stats?.charts?.messageTraffic && <TrafficChart data={stats.charts.messageTraffic} hasMounted={hasMounted} />}
            </div>

            {/* Infrastructure Section */}
            <div className="space-y-4">
                <h3 className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.3em] ml-2">Core Infrastructure Status</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                        { name: 'Firestore Database', status: stats.systemHealth.database, speed: '12ms' },
                        { name: 'Cloud Runtime', status: stats.systemHealth.functions, speed: '45ms' },
                        { name: 'Matrix Storage', status: stats.systemHealth.storage, speed: '98ms' }
                    ].map((sys, idx) => (
                        <div key={idx} className="bg-white dark:bg-[#1f2937] p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between group hover:border-indigo-500/30 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className={`w-2.5 h-2.5 rounded-full ${sys.status ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.5)]`} />
                                <div>
                                    <p className="text-sm font-bold text-gray-900 dark:text-white">{sys.name}</p>
                                    <p className="text-[10px] text-gray-400 font-mono uppercase mt-0.5 tracking-wider">Latency: {sys.speed}</p>
                                </div>
                            </div>
                            <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10 px-2 py-1 rounded-lg uppercase tracking-widest whitespace-nowrap">Nominal</span>
                        </div>
                    ))}
                </div>
            </div>


        </div>
    );
};

export default AdminOverview;
