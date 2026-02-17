import React, { useState } from 'react';

/**
 * Ingredient filter — type an ingredient to highlight matching recipes.
 */
const IngredientFilter = ({ onFilter }) => {
    const [ingredient, setIngredient] = useState('');

    const handleChange = (e) => {
        const val = e.target.value;
        setIngredient(val);
        if (onFilter) onFilter(val);
    };

    const handleClear = () => {
        setIngredient('');
        if (onFilter) onFilter('');
    };

    return (
        <div className="relative max-w-xs">
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">🥕</span>
                <input
                    type="text"
                    value={ingredient}
                    onChange={handleChange}
                    placeholder="Filter by ingredient…"
                    className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-400 focus:border-transparent text-sm"
                />
                {ingredient && (
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

export default IngredientFilter;
