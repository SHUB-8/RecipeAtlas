import React, { useState, useEffect, useCallback, useRef } from 'react';
import ForceGraphVisualization from './components/ForceGraphVisualization';
import RecipeDetail from './components/RecipeDetail';
import SearchBar from './components/SearchBar';
import StatsDashboard from './components/StatsDashboard';
import Breadcrumbs from './components/Breadcrumbs';
import IngredientFilter from './components/IngredientFilter';
import ExportButton from './components/ExportButton';
import './App.css';

function App() {
  const [taxonomyData, setTaxonomyData] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIngredients, setSelectedIngredients] = useState([]);
  const [breadcrumbPath, setBreadcrumbPath] = useState(['All Recipes']);
  const [statsOpen, setStatsOpen] = useState(false);
  const graphRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/data/taxonomy_tree.json');
        if (!res.ok) throw new Error('Failed to load taxonomy data');
        setTaxonomyData(await res.json());
      } catch (err) {
        console.error('Data load error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleRecipeSelect = useCallback((node) => {
    setSelectedRecipe({
      id: node.recipeId || node.id,
      title: node.name,
      name: node.name,
      ingredients: node.ingredients,
      directions: node.directions,
      similar: node.similar,
      category: node.category,
    });
  }, []);

  const handleCloseRecipe = useCallback(() => setSelectedRecipe(null), []);

  const handleBreadcrumbUpdate = useCallback((path) => {
    setBreadcrumbPath(path);
  }, []);

  const handleBreadcrumbNavigate = useCallback((index) => {
    if (graphRef.current && breadcrumbPath[index]) {
      graphRef.current.collapseToPathNode(breadcrumbPath[index]);
    }
    setBreadcrumbPath(prev => prev.slice(0, index + 1));
  }, [breadcrumbPath]);

  const handleSimilarClick = useCallback((sim) => {
    // Try to find the full recipe from graph's loaded nodes
    let fullRecipe = null;
    if (graphRef.current) {
      fullRecipe = graphRef.current.findRecipeById(sim.id);
    }
    if (fullRecipe) {
      setSelectedRecipe({
        id: fullRecipe.recipeId || fullRecipe.id,
        title: fullRecipe.name,
        name: fullRecipe.name,
        ingredients: fullRecipe.ingredients || [],
        directions: fullRecipe.directions || [],
        similar: fullRecipe.similar || [],
        category: fullRecipe.category,
      });
    } else {
      // Recipe not loaded in graph yet — show what we know
      setSelectedRecipe({
        id: sim.id,
        title: sim.name,
        name: sim.name,
        ingredients: [],
        directions: [],
        similar: [],
        category: null,
        notLoaded: true,
      });
    }
  }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-content">
          <div className="loading-spinner large" />
          <p>Loading taxonomy…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-error">
        <div className="error-card">
          <h2>⚠️ Error</h2>
          <p>{error}</p>
          <p className="error-hint">Run the backend pipeline first:</p>
          <code>cd backend && python build_taxonomy.py</code>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="header-row">
          <h1 className="app-logo">🗺️ RecipeAtlas</h1>

          {/* Universal search (categories, keywords, ingredients) */}
          <SearchBar onSearch={setSearchQuery} />

          {/* Multi-select ingredient filter */}
          <IngredientFilter onFilter={setSelectedIngredients} />

          {/* Action Buttons */}
          <div className="header-actions">
            <button
              className="action-btn deep-expand"
              onClick={() => graphRef.current && graphRef.current.deepExpandAll()}
              title="Expand all currently highlighted branches to reveal recipes"
            >
              ⚡ Deep Expand
            </button>
            <ExportButton />
            <button onClick={() => setStatsOpen(!statsOpen)} className="action-btn stats-toggle">
              📊 Stats
            </button>
          </div>
        </div>

        <div className="header-breadcrumbs">
          <Breadcrumbs path={breadcrumbPath} onNavigate={handleBreadcrumbNavigate} />
        </div>
      </header>

      <main className="app-main">
        {taxonomyData && (
          <ForceGraphVisualization
            ref={graphRef}
            rootData={taxonomyData}
            onRecipeSelect={handleRecipeSelect}
            onBreadcrumbUpdate={handleBreadcrumbUpdate}
            searchQuery={searchQuery}
            selectedIngredients={selectedIngredients}
          />
        )}

        <div className="instructions-overlay">
          <p><kbd>Click</kbd> node → expand / collapse</p>
          <p><kbd>Scroll</kbd> → zoom · <kbd>Drag</kbd> → pan</p>
          <p>Click leaf → view recipe details</p>
        </div>
      </main>

      {selectedRecipe && (
        <RecipeDetail
          recipe={selectedRecipe}
          onClose={handleCloseRecipe}
          onSimilarClick={handleSimilarClick}
        />
      )}

      <StatsDashboard isOpen={statsOpen} onToggle={() => setStatsOpen(!statsOpen)} />
    </div>
  );
}

export default App;
