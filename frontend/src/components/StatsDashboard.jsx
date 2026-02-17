import React, { useState, useEffect } from 'react';

/**
 * Statistics dashboard sidebar.
 * Loads stats.json and displays key metrics.
 */
const StatsDashboard = ({ isOpen, onToggle }) => {
    const [stats, setStats] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/data/stats.json');
                if (res.ok) setStats(await res.json());
            } catch (err) {
                console.error('Stats load error:', err);
            }
        })();
    }, []);

    if (!stats) return null;

    const distribution = stats.categoryDistribution || {};
    const topCats = Object.entries(distribution).slice(0, 10);
    const maxCount = topCats.length > 0 ? Math.max(...topCats.map(([, v]) => v)) : 1;

    return (
        <>
            {/* Toggle button */}
            <button
                onClick={onToggle}
                className="fixed top-20 right-0 z-30 bg-white shadow-lg rounded-l-lg px-2 py-3 text-xs font-bold text-gray-600 hover:bg-gray-50 border border-r-0"
                title="Toggle Statistics"
            >
                📊
            </button>

            {/* Sidebar */}
            <div className={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-40 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'} overflow-y-auto`}>
                <div className="p-5">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-gray-800">📊 Statistics</h2>
                        <button onClick={onToggle} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                    </div>

                    {/* Key metrics */}
                    <div className="grid grid-cols-2 gap-3 mb-6">
                        <div className="bg-orange-50 rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-orange-600">{stats.totalRecipes?.toLocaleString()}</p>
                            <p className="text-xs text-gray-500">Total Recipes</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-blue-600">{stats.totalCategories}</p>
                            <p className="text-xs text-gray-500">Categories</p>
                        </div>
                        <div className="bg-green-50 rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-green-600">{stats.totalClusters}</p>
                            <p className="text-xs text-gray-500">Clusters</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-purple-600">
                                {stats.avgSilhouette ? stats.avgSilhouette.toFixed(3) : 'N/A'}
                            </p>
                            <p className="text-xs text-gray-500">Avg Silhouette</p>
                        </div>
                    </div>

                    {/* Silhouette gauge */}
                    {stats.avgSilhouette != null && (
                        <div className="mb-6">
                            <h3 className="text-sm font-semibold text-gray-700 mb-2">Cluster Quality</h3>
                            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${Math.max(0, Math.min(100, (stats.avgSilhouette + 1) * 50))}%`,
                                        background: stats.avgSilhouette > 0.5 ? '#22c55e' : stats.avgSilhouette > 0.25 ? '#f59e0b' : '#ef4444',
                                    }}
                                />
                            </div>
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>Poor (−1)</span>
                                <span>Good (1)</span>
                            </div>
                        </div>
                    )}

                    {/* Category distribution */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Categories</h3>
                        <div className="space-y-2">
                            {topCats.map(([name, count]) => (
                                <div key={name}>
                                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                                        <span className="truncate">{name}</span>
                                        <span className="font-mono">{count.toLocaleString()}</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                        <div
                                            className="h-full bg-gradient-to-r from-orange-400 to-red-400 rounded-full"
                                            style={{ width: `${(count / maxCount) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default StatsDashboard;
