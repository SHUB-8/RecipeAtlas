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
    const topCats = Object.entries(distribution).slice(0, 15);
    const maxCount = topCats.length > 0 ? Math.max(...topCats.map(([, v]) => v)) : 1;

    return (
        <>
            {/* Sidebar */}
            <div className={`stats-sidebar ${isOpen ? 'open' : ''}`}>
                <div className="stats-content">
                    <div className="stats-header">
                        <h2>📊 Taxonomy Statistics</h2>
                        <button onClick={onToggle} className="stats-close-btn">✕</button>
                    </div>

                    {/* Key metrics */}
                    <div className="stats-grid">
                        <div className="stat-card stat-orange">
                            <p className="stat-value">{stats.totalRecipes?.toLocaleString()}</p>
                            <p className="stat-label">Total Recipes</p>
                        </div>
                        <div className="stat-card stat-blue">
                            <p className="stat-value">{stats.totalCategories}</p>
                            <p className="stat-label">Categories</p>
                        </div>
                        <div className="stat-card stat-green">
                            <p className="stat-value">{stats.totalClusters}</p>
                            <p className="stat-label">Clusters</p>
                        </div>
                        <div className="stat-card stat-purple">
                            <p className="stat-value">
                                {stats.avgSilhouette ? stats.avgSilhouette.toFixed(3) : 'N/A'}
                            </p>
                            <p className="stat-label">Avg Silhouette</p>
                        </div>
                    </div>

                    {/* Silhouette gauge */}
                    {stats.avgSilhouette != null && (
                        <div className="silhouette-section">
                            <h3>Cluster Quality</h3>
                            <div className="gauge-track">
                                <div
                                    className="gauge-fill"
                                    style={{
                                        width: `${Math.max(0, Math.min(100, (stats.avgSilhouette + 1) * 50))}%`,
                                        background: stats.avgSilhouette > 0.5 ? '#22c55e' : stats.avgSilhouette > 0.25 ? '#f59e0b' : '#ef4444',
                                    }}
                                />
                            </div>
                            <div className="gauge-labels">
                                <span>Poor (−1)</span>
                                <span>Good (1)</span>
                            </div>
                        </div>
                    )}

                    {/* Category distribution */}
                    <div className="distribution-section">
                        <h3>Top Categories</h3>
                        <div className="distribution-bars">
                            {topCats.map(([name, count]) => (
                                <div key={name} className="dist-bar-row">
                                    <div className="dist-bar-label">
                                        <span className="dist-name">{name}</span>
                                        <span className="dist-count">{count.toLocaleString()}</span>
                                    </div>
                                    <div className="dist-track">
                                        <div
                                            className="dist-fill"
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
