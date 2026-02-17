import React, { useState, useEffect, useCallback, useRef } from 'react';
import ForceGraphVisualization from './components/ForceGraphVisualization';
import RecipeDetail from './components/RecipeDetail';
import SearchBar from './components/SearchBar';
import StatsDashboard from './components/StatsDashboard';
import Breadcrumbs from './components/Breadcrumbs';
import IngredientFilter from './components/IngredientFilter';
import ExportButton from './components/ExportButton';
import './App.css';

/**
 * Root component.
 * Loads the taxonomy tree (lazy-loadable root)
 * and composes all UI components.
 */
function App() {
  const [taxonomyData, setTaxonomyData] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [ingredientFilter, setIngredientFilter] = useState('');
  const [breadcrumbPath, setBreadcrumbPath] = useState(['All Recipes']);
  const [statsOpen, setStatsOpen] = useState(false);
  const graphNodesRef = useRef([]);

  /* ── Load taxonomy root on mount ─────────────────────────────── */
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

  /* ── Handlers ───────────────────────────────────────────────── */
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
    // Breadcrumb navigation — could trigger collapse in graph
    // For now, just truncate the path display
    setBreadcrumbPath(prev => prev.slice(0, index + 1));
  }, []);

  const handleSimilarClick = useCallback((sim) => {
    // Show similar recipe details if available
    setSelectedRecipe({
      id: sim.id,
      title: sim.name,
      name: sim.name,
      ingredients: [],
      directions: [],
      similar: [],
    });
  }, []);

  /* ── Render states ──────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-orange-500 mx-auto mb-4" />
          <p className="text-gray-300 text-lg">Loading taxonomy…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center p-8 bg-gray-800 rounded-xl shadow-2xl max-w-md border border-gray-700">
          <h2 className="text-2xl font-bold text-red-400 mb-4">Error</h2>
          <p className="text-gray-300 mb-4">{error}</p>
          <p className="text-sm text-gray-500">Run the backend pipeline first:</p>
          <code className="block mt-2 p-3 bg-gray-900 rounded text-xs text-green-400">
            cd backend && python build_taxonomy.py
          </code>
        </div>
      </div>
    );
  }

  /* ── Main layout ────────────────────────────────────────────── */
  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white overflow-hidden">
      {/* Header */}
      <header className="bg-gray-800/90 backdrop-blur-md border-b border-gray-700 z-20">
        <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
          {/* Logo */}
          <h1 className="text-xl font-bold bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent whitespace-nowrap">
            🍳 Recipe Taxonomy
          </h1>

          {/* Search */}
          <SearchBar
            onSearch={setSearchQuery}
          />

          {/* Ingredient filter */}
          <IngredientFilter
            onFilter={setIngredientFilter}
          />

          {/* Export */}
          <ExportButton nodes={graphNodesRef.current} />

          {/* Stats toggle */}
          <button
            onClick={() => setStatsOpen(!statsOpen)}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
          >
            📊 Stats
          </button>
        </div>

        {/* Breadcrumbs */}
        <div className="px-4 pb-2">
          <Breadcrumbs
            path={breadcrumbPath}
            onNavigate={handleBreadcrumbNavigate}
          />
        </div>
      </header>

      {/* Graph */}
      <main className="flex-1 relative overflow-hidden">
        {taxonomyData && (
          <ForceGraphVisualization
            rootData={taxonomyData}
            onRecipeSelect={handleRecipeSelect}
            onBreadcrumbUpdate={handleBreadcrumbUpdate}
            searchQuery={searchQuery}
            ingredientFilter={ingredientFilter}
          />
        )}

        {/* Instructions overlay (fades after first interaction) */}
        <div className="absolute bottom-4 left-4 bg-gray-800/90 backdrop-blur rounded-lg px-4 py-3 text-sm text-gray-400 border border-gray-700">
          <p><kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-xs">Click</kbd> node → expand/collapse</p>
          <p><kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-xs">Scroll</kbd> → zoom · <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-xs">Drag</kbd> → pan</p>
          <p>Click leaf → recipe details</p>
        </div>
      </main>

      {/* Recipe detail panel (slide-in) */}
      {selectedRecipe && (
        <RecipeDetail
          recipe={selectedRecipe}
          onClose={handleCloseRecipe}
          onSimilarClick={handleSimilarClick}
        />
      )}

      {/* Stats dashboard sidebar */}
      <StatsDashboard
        isOpen={statsOpen}
        onToggle={() => setStatsOpen(!statsOpen)}
      />
    </div>
  );
}

export default App;
