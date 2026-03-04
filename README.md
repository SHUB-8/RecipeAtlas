# 🗺️ RecipeAtlas

**RecipeAtlas** is a powerful, interactive visual taxonomy of over 520,000 recipes. Built to handle massive datasets gracefully, it transforms traditional list-based recipe browsing into an engaging, physics-based graph exploration experience.

Through a custom-built data pipeline and a highly optimized front-end visualization, RecipeAtlas allows users to navigate a massive universe of culinary data seamlessly—discovering new dishes, exploring ingredients, and finding similar recipes organically.

---

## ✨ Features

- **Interactive Force-Directed Graph**: Navigate intuitively by panning, zooming, and clicking through clusters of recipes. The graph utilizes a highly tuned physics simulation (D3.js) ensuring nodes never overlap and relationships are clear.
- **Deep Search & Semantic Filtering**: Instantly filter the entire taxonomy by recipe name, category, or ingredient. The visualization dynamically updates, isolating matched branches and deep-expanding relevant subtrees without losing context. 
- **Graceful Lazy-Loading**: Designed to handle a 500k+ recipe dataset, the architecture dynamically loads detailed node branches on-demand, maintaining smooth 60fps performance without crashing the browser.
- **Smart Ingredient Cross-Referencing**: Built-in ingredient index automatically highlights clusters and corresponding leaf nodes based on ingredient searches.
- **Rich Recipe Details**: Clicking a leaf node reveals its full ingredients, cooking directions, and instantly provides similar recipe recommendations generated via backend Cosine Similarity mapping.
- **Modern Glassmorphism UI**: A clean, responsive, and visually stunning light theme utilizing backdrop filters and subtle interactive animations.
- **Visual Analytics Dashboard**: Real-time sidebar statistics showing filtering metrics and a breakdown of recipe distribution across top-level categories.

---

## 🛠️ Technology Stack

### Frontend Visualization 
- **Core**: React + Vite
- **Graph Engine**: D3.js (Force Layout) heavily customized for strict non-overlap and stable expanding/collapsing.
- **Styling**: Vanilla CSS with modern Glassmorphism aesthetics and CSS variables.

### Backend Data Pipeline (Pre-Processing)
- **Data Ingestion**: HuggingFace Datasets & Pandas (processing Kaggles's Food.com dataset).
- **Machine Learning**: 
  - `sentence-transformers/all-mpnet-base-v2` for high-accuracy semantic embeddings.
  - `HDBSCAN` for density-based semantic clustering.
  - `TF-IDF` for automatic cluster labeling.
- **Output Artifacts**: Optimized, sharded JSON payloads mapped to a root taxonomy tree to enable frontend lazy-loading.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v16+)

### Installation

1. Clone the repository.
2. Navigate to the frontend directory:
   ```bash
   cd frontend
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:5173` in your browser to begin exploring RecipeAtlas.

*(Note: The repository includes the pre-processed and sharded JSON data inside the frontend public folder, so the backend Python pipeline is not required to run the visualization).*

---

## 💡 How It Works Under The Hood

The immense scale of the Food.com dataset required a hybrid approach to visualization:

1. **Pre-computation**: Rather than calculating a million nodes on the fly, the Python backend pre-calculates the semantic relationships and shards the data into thousands of small, manageable JSON files (`taxonomy_tree.json` and the `/nodes` directory).
2. **On-Demand Hydration**: The React application loads only the root structure initially. When a user clicks a node (e.g., "Desserts" -> "Cakes"), a specific fetch request is made for that isolated shard, appending it to the active D3 simulation.
3. **Optimized Render Cycle**: Custom logic intercepting D3's `.enter()`, `.exit()`, and `.merge()` lifecycle ensures that thousands of SVG elements can be added, updated, heavily filtered, or removed instantly without causing UI freezing or layout tearing.
