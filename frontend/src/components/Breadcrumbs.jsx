import React from 'react';

/**
 * Breadcrumb trail showing the navigation path through the taxonomy.
 * Each crumb is clickable to navigate back.
 */
const Breadcrumbs = ({ path, onNavigate }) => {
    if (!path || path.length === 0) return null;

    return (
        <nav className="flex items-center space-x-1 text-sm overflow-x-auto py-1 px-2 bg-white/80 backdrop-blur rounded-lg shadow-sm">
            {path.map((name, i) => (
                <React.Fragment key={i}>
                    {i > 0 && <span className="text-gray-400 mx-1">›</span>}
                    <button
                        onClick={() => onNavigate && onNavigate(i)}
                        className={`whitespace-nowrap px-2 py-1 rounded transition-colors ${i === path.length - 1
                                ? 'bg-orange-100 text-orange-700 font-semibold'
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                    >
                        {name.length > 25 ? name.slice(0, 22) + '…' : name}
                    </button>
                </React.Fragment>
            ))}
        </nav>
    );
};

export default Breadcrumbs;
