import React, { useState, useRef, useEffect } from 'react';

/**
 * Universal SearchBar.
 * Type anything: category name, keyword, or ingredient.
 * Shows matching entries from the search index.
 * The search text is passed to ForceGraph as a filter.
 */
const SearchBar = ({ onSearch, taxonomyChildren = [] }) => {
    const [query, setQuery] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [searchIndex, setSearchIndex] = useState([]);
    const [ingredientsList, setIngredientsList] = useState([]);
    const wrapperRef = useRef(null);
    const debounceRef = useRef(null);

    // Load search index on mount
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/data/search_index.json');
                if (res.ok) setSearchIndex(await res.json());
            } catch (err) {
                console.error('Failed to load search data:', err);
            }
        })();
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleChange = (e) => {
        const val = e.target.value;
        setQuery(val);

        // Debounce search
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            if (onSearch) onSearch(val);
        }, 300);

        if (val.length >= 2) {
            const q = val.toLowerCase();
            const results = [];

            // Search categories/keywords
            for (const item of searchIndex) {
                if (item.name && item.name.toLowerCase().includes(q)) {
                    results.push(item);
                    if (results.length >= 10) break;
                }
            }

            setSuggestions(results);
            setShowDropdown(results.length > 0);
        } else {
            setSuggestions([]);
            setShowDropdown(false);
        }
    };

    const handleSelect = (item) => {
        setQuery(item.name);
        setShowDropdown(false);
        if (onSearch) onSearch(item.name);
    };

    const handleClear = () => {
        setQuery('');
        if (onSearch) onSearch('');
        setSuggestions([]);
        setShowDropdown(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            setShowDropdown(false);
            if (onSearch) onSearch(query);
        }
    };

    const typeLabel = (type) => {
        switch (type) {
            case 'category': return '📁';
            case 'keyword': return '🏷️';
            case 'ingredient': return '🥕';
            default: return '🔍';
        }
    };

    return (
        <div ref={wrapperRef} className="search-bar-wrapper">
            <div className="search-input-container">
                <svg className="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    type="text"
                    value={query}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                    placeholder="Search categories, keywords, ingredients…"
                    className="search-input"
                />
                {query && (
                    <button onClick={handleClear} className="search-clear-btn">✕</button>
                )}
            </div>

            {showDropdown && suggestions.length > 0 && (
                <div className="search-dropdown">
                    {suggestions.map((item, i) => (
                        <button
                            key={i}
                            className="search-suggestion"
                            onClick={() => handleSelect(item)}
                        >
                            <span className="suggestion-type">{typeLabel(item.type)}</span>
                            <span className="suggestion-name">{item.name}</span>
                            {item.count != null && (
                                <span className="suggestion-count">
                                    {item.count.toLocaleString()}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SearchBar;
