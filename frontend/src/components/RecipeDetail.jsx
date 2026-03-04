import React from 'react';

/**
 * Recipe detail panel — slides in from the right.
 * Shows ingredients, directions, and similar recipes.
 */
const RecipeDetail = ({ recipe, onClose, onSimilarClick }) => {
    if (!recipe) return null;

    return (
        <div className="recipe-overlay" onClick={onClose}>
            <div className="recipe-panel" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="recipe-header">
                    <div>
                        <h2 className="recipe-title">{recipe.title || recipe.name}</h2>
                        {recipe.category && (
                            <span className="recipe-category-badge">{recipe.category}</span>
                        )}
                    </div>
                    <button onClick={onClose} className="recipe-close-btn">
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="recipe-body">
                    {/* Not loaded message */}
                    {recipe.notLoaded && (
                        <div className="recipe-section" style={{
                            textAlign: 'center', padding: '2rem 1rem',
                            color: '#94a3b8', fontSize: '0.9rem'
                        }}>
                            <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</p>
                            <p>This recipe hasn't been loaded in the graph yet.</p>
                            <p style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                                Expand the category branch containing this recipe to view its full details.
                            </p>
                        </div>
                    )}
                    {/* Ingredients */}
                    {recipe.ingredients && recipe.ingredients.length > 0 && (
                        <div className="recipe-section">
                            <h3 className="recipe-section-title">🥘 Ingredients</h3>
                            <div className="ingredient-tags">
                                {recipe.ingredients.map((ing, i) => (
                                    <span key={i} className="ingredient-tag">{ing}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Directions */}
                    {recipe.directions && recipe.directions.length > 0 && (
                        <div className="recipe-section">
                            <h3 className="recipe-section-title">📝 Directions</h3>
                            <ol className="directions-list">
                                {recipe.directions.map((step, i) => (
                                    <li key={i} className="direction-step">
                                        <span className="step-number">{i + 1}</span>
                                        <span className="step-text">{step}</span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}

                    {/* Similar Recipes */}
                    {recipe.similar && recipe.similar.length > 0 && (
                        <div className="recipe-section">
                            <h3 className="recipe-section-title">🔗 Similar Recipes</h3>
                            <div className="similar-list">
                                {recipe.similar.map((sim, i) => (
                                    <button
                                        key={i}
                                        onClick={() => onSimilarClick && onSimilarClick(sim)}
                                        className="similar-recipe-btn"
                                    >
                                        {sim.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="recipe-footer">
                    <button onClick={onClose} className="recipe-close-footer-btn">Close</button>
                </div>
            </div>
        </div>
    );
};

export default RecipeDetail;
