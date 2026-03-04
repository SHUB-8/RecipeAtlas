import React from 'react';

/**
 * Breadcrumb trail showing the navigation path through the taxonomy.
 */
const Breadcrumbs = ({ path, onNavigate }) => {
    if (!path || path.length === 0) return null;

    return (
        <nav className="breadcrumb-nav">
            {path.map((name, i) => (
                <React.Fragment key={i}>
                    {i > 0 && <span className="breadcrumb-sep">›</span>}
                    <button
                        onClick={() => onNavigate && onNavigate(i)}
                        className={`breadcrumb-item ${i === path.length - 1 ? 'active' : ''}`}
                    >
                        {name.length > 25 ? name.slice(0, 22) + '…' : name}
                    </button>
                </React.Fragment>
            ))}
        </nav>
    );
};

export default Breadcrumbs;
