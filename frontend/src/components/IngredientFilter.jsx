import React, { useState, useEffect, useRef } from 'react';

/**
 * Multi-select ingredient filter with autocomplete dropdown.
 * Loads ingredients_list.json for suggestions.
 * User can add multiple ingredients as chips.
 */
const IngredientFilter = ({ onFilter }) => {
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [allIngredients, setAllIngredients] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const wrapperRef = useRef(null);

    // Load ingredient list on mount
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/data/ingredients_list.json');
                if (res.ok) {
                    const data = await res.json();
                    setAllIngredients(data); // [{name, count}, ...]
                }
            } catch (err) {
                console.error('Failed to load ingredients list:', err);
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

    // Notify parent whenever selected ingredients change
    useEffect(() => {
        if (onFilter) onFilter(selected);
    }, [selected, onFilter]);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setQuery(val);

        if (val.length >= 2) {
            const q = val.toLowerCase();
            const matches = allIngredients
                .filter(ing => ing.name.includes(q) && !selected.includes(ing.name))
                .slice(0, 10);
            setSuggestions(matches);
            setShowDropdown(matches.length > 0);
        } else {
            setSuggestions([]);
            setShowDropdown(false);
        }
    };

    const addIngredient = (name) => {
        if (!selected.includes(name)) {
            setSelected([...selected, name]);
        }
        setQuery('');
        setSuggestions([]);
        setShowDropdown(false);
    };

    const removeIngredient = (name) => {
        setSelected(selected.filter(s => s !== name));
    };

    const clearAll = () => {
        setSelected([]);
        setQuery('');
    };

    return (
        <div ref={wrapperRef} className="ingredient-filter-wrapper">
            {/* Selected ingredient chips */}
            {selected.length > 0 && (
                <div className="ingredient-chips">
                    {selected.map(name => (
                        <span key={name} className="ingredient-chip">
                            {name}
                            <button
                                className="chip-remove"
                                onClick={() => removeIngredient(name)}
                            >×</button>
                        </span>
                    ))}
                    <button className="clear-all-btn" onClick={clearAll}>Clear all</button>
                </div>
            )}

            {/* Input */}
            <div className="filter-input-container">
                <span className="filter-icon">🥕</span>
                <input
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    onFocus={() => query.length >= 2 && suggestions.length > 0 && setShowDropdown(true)}
                    placeholder={selected.length > 0 ? "Add more…" : "Filter by ingredient…"}
                    className="filter-input"
                />
            </div>

            {/* Dropdown */}
            {showDropdown && suggestions.length > 0 && (
                <div className="ingredient-dropdown">
                    {suggestions.map((ing, i) => (
                        <button
                            key={i}
                            className="ingredient-suggestion"
                            onClick={() => addIngredient(ing.name)}
                        >
                            <span className="suggestion-name">{ing.name}</span>
                            <span className="suggestion-count">{ing.count.toLocaleString()} recipes</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default IngredientFilter;
