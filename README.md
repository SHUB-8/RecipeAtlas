# 🍳 Recipes Taxonomy Project

A full-stack Data Science project that organizes **520,000+ recipes** from Food.com into an interactive, semantic hierarchy using AI.

---

## 🚀 Key Features

- **Massive Scale**: Processes the full Food.com dataset (500k+ recipes) using purely local compute (GPU accelerated).
- **Hybrid AI Taxonomy**: 
  - **Level 1**: Category (Metadata)
  - **Level 2**: Keyword (Metadata)
  - **Level 3**: Semantic Clusters (Sentence-BERT + HDBSCAN)
- **Lazy-Loading Architecture**: Frontend loads data on-demand (like Google Maps) to handle millions of nodes without crashing.
- **Interactive Visualization**: Custom D3.js **Force-Directed Graph** with:
  - Expand/Collapse nodes
  - Physics-based layout
  - Search & Filters
  - Similar Recipe Recommendations (Cosine Similarity)

---

## 🛠️ Tech Stack

### Backend (Python)
- **Embeddings**: `sentence-transformers/all-mpnet-base-v2` (768-dim, high accuracy)
- **Clustering**: `HDBSCAN` (Density-based clustering for semantic grouping)
- **Data Processing**: `HuggingFace Datasets` + `Pandas`
- **Output**: Pre-computed JSON fragments for lazy loading

### Frontend (React + Vite)
- **Visualization**: `D3.js` v7 (Force simulation, transitions, zoom)
- **Styling**: `Tailwind CSS` (Dark mode aesthetic)
- **Components**:
  - `ForceGraphVisualization`: The core interactive graph
  - `StatsDashboard`: Visual analytics of the taxonomy
  - `RecipeDetail`: Slide-out panel with ingredients & similarity
  - `SearchBar`: Real-time semantic filtering

---

## 🏃‍♂️ Quick Start

### 1. Backend Setup (Generate Data)

You need to download the **Food.com Recipes and Reviews** dataset from Kaggle (by irkaal).

1. Download `recipes.csv` (or `recipes.parquet` for speed!) from [Kaggle](https://www.kaggle.com/datasets/irkaal/foodcom-recipes-and-reviews)
2. Place it here: `backend/data/Food_Dataset/recipes.parquet` (or `.csv`)

Then run the pipeline (requires GPU, takes ~45 mins):

```bash
cd backend
pip install -r requirements.txt
python build_taxonomy.py
```

### 2. Frontend Setup (Run App)

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** to explore the galaxy of recipes!

---

## 📊 How It Works

1. **Ingestion**: Loads raw CSV data via HuggingFace `datasets` (handling multi-line errors).
2. **Embedding**: Encodes `Title + Ingredients` into 768-dimensional vectors using MPNet.
3. **Hierarchical Construction**:
   - Routes recipes into **Categories** (Dessert, Lunch, etc.).
   - Splits Categories into **Keywords** (Chocolate, Pasta, etc.).
   - If a Keyword group is huge (>1000 recipes), it runs **HDBSCAN** on embeddings.
   - Clusters are auto-labeled using **TF-IDF** on recipe titles (e.g., "Fudge & Brownies").
4. **Graph Generation**: The resulting tree is saved as a root skeleton + thousands of child shards.

---

## 🧠 Model Details

| Component | Choice | Reason |
|-----------|--------|--------|
| **Embedding** | `all-mpnet-base-v2` | Best-in-class semantic quality for clustering (vs. MiniLM). |
| **Clustering** | `HDBSCAN` | Handles noise/outliers better than K-Means; no need to specify 'k'. |
| **Labels** | `TF-IDF` | Extracts discriminative terms from cluster titles for auto-naming. |

---

## 📂 Project Structure

```
DSBDA_Project/
├── backend/
│   ├── build_taxonomy.py       # The brain: Pipeline script
│   └── colab_runner.py         # Run on Google Colab (Free GPU)
├── frontend/
│   ├── public/data/            # Generated data lives here (nodes/ folder)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ForceGraphVisualization.jsx  # D3 Logic
│   │   │   ├── RecipeDetail.jsx             # Slide-out panel
│   │   │   └── ...
│   │   └── App.jsx
│   └── ...
└── README.md
```