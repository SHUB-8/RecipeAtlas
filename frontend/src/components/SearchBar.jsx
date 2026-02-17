import React, { useState } from 'react';

/**
 * Search bar with real-time filtering.
 * Passes the query up so the graph can highlight matching nodes.
 */
const SearchBar = ({ onSearch, onResultClick }) => {
    const [query, setQuery] = useState('');

    const handleChange = (e) => {
        const val = e.target.value;
        setQuery(val);
        if (onSearch) onSearch(val);
    };

    const handleClear = () => {
        setQuery('');
        if (onSearch) onSearch('');
    };

    return (
        <div className="relative flex-1 max-w-md">
            <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    type="text"
                    value={query}
                    onChange={handleChange}
                    placeholder="Search recipes, ingredients, categories…"
                    className="w-full pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 focus:border-transparent text-sm"
                />
                {query && (
                    <button
                        onClick={handleClear}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                        ✕
                    </button>
                )}
            </div>
        </div>
    );
};

export default SearchBar;
