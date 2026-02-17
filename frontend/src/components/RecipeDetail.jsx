import React from 'react';

/**
 * Recipe detail panel — slides in from the right.
 * Shows ingredients, directions, and similar recipes.
 */
const RecipeDetail = ({ recipe, onClose, onSimilarClick }) => {
    if (!recipe) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-start z-10">
                <div>
                    <h2 className="text-xl font-bold text-gray-800">{recipe.title || recipe.name}</h2>
                    {recipe.category && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
                            {recipe.category}
                        </span>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 p-1"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div className="px-6 py-4 space-y-6">
                {/* Ingredients */}
                {recipe.ingredients && recipe.ingredients.length > 0 && (
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                            🥘 Ingredients
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {recipe.ingredients.map((ing, i) => (
                                <span
                                    key={i}
                                    className="px-2 py-1 bg-green-50 text-green-700 text-sm rounded-full border border-green-200 cursor-default hover:bg-green-100 transition-colors"
                                >
                                    {ing}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Directions */}
                {recipe.directions && recipe.directions.length > 0 && (
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                            📝 Directions
                        </h3>
                        <ol className="space-y-2">
                            {recipe.directions.map((step, i) => (
                                <li key={i} className="flex gap-3 text-sm text-gray-600">
                                    <span className="flex-shrink-0 w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs font-bold">
                                        {i + 1}
                                    </span>
                                    <span>{step}</span>
                                </li>
                            ))}
                        </ol>
                    </div>
                )}

                {/* Similar Recipes */}
                {recipe.similar && recipe.similar.length > 0 && (
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                            🔗 Similar Recipes
                        </h3>
                        <div className="space-y-2">
                            {recipe.similar.map((sim, i) => (
                                <button
                                    key={i}
                                    onClick={() => onSimilarClick && onSimilarClick(sim)}
                                    className="w-full text-left px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 transition-colors"
                                >
                                    {sim.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-3 flex justify-end">
                <button
                    onClick={onClose}
                    className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium"
                >
                    Close
                </button>
            </div>
        </div>
    );
};

export default RecipeDetail;
