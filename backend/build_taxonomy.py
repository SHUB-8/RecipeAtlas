"""
Automated Poly-Hierarchical Taxonomy Generation for Recipe Dataset
==================================================================
Transforms raw recipe data into an interactive hierarchy using a hybrid approach:
  Level 1  →  Category   (from RecipeCategory metadata)
  Level 2  →  Keyword    (from discriminative Keywords metadata)
  Level 3  →  Semantic Cluster  (Sentence-BERT embeddings + HDBSCAN, TF-IDF labels)

Dataset : Food.com (AkashPS11/recipes_data_food.com on HuggingFace)
Output  : Lazy-loadable JSON files in backend/data/
"""

import json
import sys
import time
import warnings
from collections import Counter
from pathlib import Path

import hdbscan
import numpy as np
import pandas as pd
import torch
from datasets import load_dataset
from sentence_transformers import SentenceTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import silhouette_score
from sklearn.metrics.pairwise import cosine_similarity

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SAMPLE_SIZE = None                     # None = ALL recipes
EMBEDDING_MODEL = "sentence-transformers/all-mpnet-base-v2"   # 768-dim, high quality
OUTPUT_DIR = Path("frontend/public/data")

# Hierarchy parameters — intentionally generous to keep ALL types
MIN_CATEGORY_SIZE    = 5        # min recipes to create a category node
MIN_KEYWORD_FREQ     = 5        # min recipe count for a keyword bucket
MIN_KEYWORD_GROUP    = 5        # min recipes to form a keyword node
CLUSTER_THRESHOLD    = 30       # run HDBSCAN when group exceeds this
HDBSCAN_MIN_CLUSTER  = 8        # HDBSCAN min_cluster_size
TOP_SIMILAR          = 5        # number of similar recipes to pre-compute

# Generic keywords to skip at Level 2 (they don't discriminate)
IGNORE_KEYWORDS = {
    "Recipes", "Recipe", "Weeknight", "Healthy", "Simple", "Easy",
    "Dietary", "Low Protein", "Low Cholesterol", "Very Low Carbs",
    "Low Carb", "High Fiber", "High Protein", "Low Sodium",
    "Free Of...", "No Shell Fish", "No Meat", "Inexpensive",
    "< 4 Hours", "< 60 Mins", "< 30 Mins", "< 15 Mins",
    "Time-To-Make", "Course", "Cuisine", "Preparation",
    "For Large Groups", "Small Batch", "Number Of Servings",
}


# ---------------------------------------------------------------------------
# Helper — parse R-style vectors   c("A", "B", "C")
# ---------------------------------------------------------------------------
def parse_r_vector(text):
    """Parse an R vector string like 'c("a", "b")' into a Python list."""
    # If already a list/array (e.g. from Parquet), just return it
    if isinstance(text, (list, tuple, np.ndarray)):
        # Filter None/NaN/empty strings
        return [str(x) for x in text if x and pd.notna(x)]
    
    if pd.isna(text) or text == "NA" or text == "c()":
        return []
    if text.startswith("c("):
        inner = text[2:-1]
        parts = inner.split(', "')
        return [p.replace('"', "").strip() for p in parts]
    return [val]


def slugify(text: str) -> str:
    """Make a string safe for filenames."""
    import re
    if not text:
        return "unknown"
    return re.sub(r"[^a-z0-9]+", "_", str(text).lower()).strip("_")


# ---------------------------------------------------------------------------
# Main builder class
# ---------------------------------------------------------------------------
class HybridTaxonomyBuilder:
    """Builds a Category → Keyword → Semantic-Cluster hierarchy."""

    def __init__(self, sample_size: int | None = SAMPLE_SIZE):
        self.sample_size = sample_size
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._model = None
        self.recipes: pd.DataFrame | None = None
        self.embeddings: np.ndarray | None = None
        self.stats: dict = {}
        print(f"⚙️  Device: {self.device.upper()}")
        if self.device == "cuda":
            print(f"   GPU: {torch.cuda.get_device_name(0)}")

    # -- lazy model loader --------------------------------------------------
    @property
    def model(self) -> SentenceTransformer:
        if self._model is None:
            print(f"📦 Loading model: {EMBEDDING_MODEL}")
            self._model = SentenceTransformer(EMBEDDING_MODEL, device=self.device)
        return self._model

    # -- Step 1 : Load & clean data ----------------------------------------
    def load_data(self) -> "HybridTaxonomyBuilder":
        """Download the Food.com CSV and prepare a cleaned DataFrame."""
        label = f"{self.sample_size:,}" if self.sample_size else "ALL"
        t0 = time.time()
        try:
            # Check for manually downloaded Kaggle dataset in backend/data/Food_Dataset/
            # Prioritize Parquet for speed!
            ds_dir = Path("backend/data")
            parquet_path = ds_dir / "recipes.parquet"
            csv_path = ds_dir / "recipes.csv"
            
            if parquet_path.exists():
                print(f"✅ Found Kaggle Parquet: {parquet_path}")
                # Load parquet - much faster and type-safe
                df = pd.read_parquet(parquet_path)
                if self.sample_size:
                    df = df.head(self.sample_size * 2)
            elif csv_path.exists():
                print(f"✅ Found Kaggle CSV: {csv_path}")
                nrows = self.sample_size * 2 if self.sample_size else None
                df = pd.read_csv(csv_path, nrows=nrows, low_memory=False, on_bad_lines='skip')
            else:
                print("❌ No data found! Please place 'recipes.parquet' or 'recipes.csv'")
                print("   in backend/data/Food_Dataset/")
                sys.exit(1)
                
        except Exception as exc:
            print(f"❌ Failed to load data: {exc}")
            sys.exit(1)

        # Rename columns to match internal schema
        # The Kaggle dataset (irkaal) has: RecipeId, Name, RecipeCategory, Keywords, RecipeIngredientParts, RecipeInstructions
        df = df.rename(columns={
            "RecipeId": "id",
            "Name": "title",
            "RecipeCategory": "category",
            "Keywords": "keywords",
            "RecipeIngredientParts": "ingredients",
            "RecipeInstructions": "directions",
        })

        df = df.dropna(subset=["title", "category"])
        df = df[df["title"].str.len() > 3]

        print("   Parsing metadata …")
        df["keywords_list"]    = df["keywords"].apply(parse_r_vector)
        df["ingredients_list"] = df["ingredients"].apply(parse_r_vector)
        df["directions_list"]  = df["directions"].apply(parse_r_vector)

        if self.sample_size:
            df = df.head(self.sample_size)
        self.recipes = df.reset_index(drop=True)
        print(f"✅ Loaded {len(self.recipes):,} recipes in {time.time()-t0:.1f}s")
        return self

    # -- Step 2 : Compute embeddings ----------------------------------------
    def compute_embeddings(self) -> "HybridTaxonomyBuilder":
        """Encode recipe text with Sentence-BERT."""
        print("🧠 Computing embeddings …")
        t0 = time.time()
        
        def safe_join(x, limit):
            if isinstance(x, (list, tuple, np.ndarray)):
                # Filter out None/NaN/empty strings inside the list
                items = [str(k) for k in list(x)[:limit] if k and pd.notna(k)]
                return " ".join(items)
            return ""
            
        texts = (
            self.recipes["title"]
            + " " + self.recipes["keywords_list"].apply(lambda x: safe_join(x, 5))
            + " " + self.recipes["ingredients_list"].apply(lambda x: safe_join(x, 8))
        )
        self.embeddings = self.model.encode(
            texts.tolist(),
            batch_size=256 if self.device == "cuda" else 64,
            show_progress_bar=True,
            convert_to_numpy=True,
        )
        print(f"✅ Embeddings shape: {self.embeddings.shape} in {time.time()-t0:.1f}s")
        return self

    # -- Step 3 : Build hierarchy  ------------------------------------------
    def build_hierarchy(self) -> dict:
        """Build the full tree and save per-node JSON files (lazy-load)."""
        print("🏗️  Building hierarchy …")
        nodes_dir = OUTPUT_DIR / "nodes"
        nodes_dir.mkdir(parents=True, exist_ok=True)

        # --- Level 1: ALL categories (no cap) ---
        cat_counts = self.recipes["category"].value_counts()
        cats = cat_counts[cat_counts >= MIN_CATEGORY_SIZE].index.tolist()
        print(f"   {len(cats)} categories found")

        root = {
            "name": "All Recipes",
            "children": [],
            "totalRecipes": len(self.recipes),
        }

        total_clusters = 0
        silhouette_scores = []

        for ci, cat in enumerate(cats):
            cat_df = self.recipes[self.recipes["category"] == cat]
            cat_slug = slugify(cat)

            # Build Level-2 keyword nodes for this category
            cat_children = self._build_keyword_level(
                cat, cat_df, cat_slug, nodes_dir,
                silhouette_scores,
            )

            # Count clusters in this category
            for kw_node in cat_children:
                if "childFile" in kw_node:
                    total_clusters += 1

            # Save category children to lazy-load file
            cat_file = f"{cat_slug}.json"
            with open(nodes_dir / cat_file, "w", encoding="utf-8") as f:
                json.dump(cat_children, f, ensure_ascii=False)

            # Add compact category node to root
            root["children"].append({
                "name": cat,
                "childFile": f"nodes/{cat_file}",
                "recipeCount": len(cat_df),
                "childCount": len(cat_children),
            })

            if (ci + 1) % 10 == 0:
                print(f"   Processed {ci+1}/{len(cats)} categories …")

        # --- Compute global stats ---
        self.stats = {
            "totalRecipes": len(self.recipes),
            "totalCategories": len(cats),
            "totalClusters": total_clusters,
            "categoryDistribution": {
                cat: int(cnt) for cat, cnt in cat_counts.head(30).items()
            },
            "avgSilhouette": float(np.mean(silhouette_scores)) if silhouette_scores else None,
            "silhouetteScores": len(silhouette_scores),
        }

        return root

    def _build_keyword_level(
        self, cat: str, cat_df: pd.DataFrame, cat_slug: str,
        nodes_dir: Path, silhouette_scores: list,
    ) -> list[dict]:
        """Create Level-2 keyword nodes for one category."""
        all_kw = [k for kws in cat_df["keywords_list"] for k in kws]
        kw_counts = Counter(all_kw)
        ignore = IGNORE_KEYWORDS | {cat}

        # Take ALL keywords above threshold (no cap!)
        subtypes = [
            k for k, v in kw_counts.most_common()
            if k not in ignore and v >= MIN_KEYWORD_FREQ
        ]

        assigned: set[int] = set()
        cat_children: list[dict] = []

        for kw in subtypes:
            matches = cat_df[cat_df["keywords_list"].apply(lambda x, _kw=kw: _kw in x)]
            matches = matches[~matches.index.isin(assigned)]
            if len(matches) < MIN_KEYWORD_GROUP:
                continue

            kw_slug = f"{cat_slug}__{slugify(kw)}"
            subset_idx = matches.index.tolist()

            # Build Level-3: cluster or flat leaves
            kw_children = self._build_cluster_level(
                kw, subset_idx, kw_slug, nodes_dir, silhouette_scores,
            )

            # Save keyword children
            kw_file = f"{kw_slug}.json"
            with open(nodes_dir / kw_file, "w", encoding="utf-8") as f:
                json.dump(kw_children, f, ensure_ascii=False)

            cat_children.append({
                "name": kw,
                "childFile": f"nodes/{kw_file}",
                "recipeCount": len(matches),
                "childCount": len(kw_children),
            })
            assigned.update(subset_idx)

        # Remainder → "Other" node
        general = cat_df[~cat_df.index.isin(assigned)]
        if not general.empty:
            gen_slug = f"{cat_slug}__other"
            gen_children = self._build_leaf_list(general.index.tolist())
            gen_file = f"{gen_slug}.json"
            with open(nodes_dir / gen_file, "w", encoding="utf-8") as f:
                json.dump(gen_children, f, ensure_ascii=False)
            cat_children.append({
                "name": f"Other {cat}",
                "childFile": f"nodes/{gen_file}",
                "recipeCount": len(general),
                "childCount": len(gen_children),
            })

        return cat_children

    def _build_cluster_level(
        self, kw: str, indices: list[int], kw_slug: str,
        nodes_dir: Path, silhouette_scores: list,
    ) -> list[dict]:
        """Optionally cluster a keyword group into semantic sub-groups."""
        if len(indices) <= CLUSTER_THRESHOLD:
            return self._build_leaf_list(indices)

        # Run HDBSCAN
        sub_emb = self.embeddings[indices]
        if len(indices) < HDBSCAN_MIN_CLUSTER * 2:
            return self._build_leaf_list(indices)

        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=HDBSCAN_MIN_CLUSTER,
            min_samples=max(1, HDBSCAN_MIN_CLUSTER // 2),
            metric="euclidean",
        )
        labels = clusterer.fit_predict(sub_emb)
        unique_labels = set(labels) - {-1}

        if len(unique_labels) <= 1:
            return self._build_leaf_list(indices)

        # Compute silhouette score for this clustering
        valid_mask = labels != -1
        if valid_mask.sum() > 1 and len(set(labels[valid_mask])) > 1:
            try:
                score = silhouette_score(sub_emb[valid_mask], labels[valid_mask])
                silhouette_scores.append(score)
            except Exception:
                score = None
        else:
            score = None

        # Build cluster nodes with TF-IDF auto-labels
        cluster_nodes = []
        for label_id in sorted(unique_labels):
            cluster_idx = [indices[i] for i, l in enumerate(labels) if l == label_id]
            label_name = self._generate_cluster_label(cluster_idx, kw)

            cl_slug = f"{kw_slug}__cl{label_id}"
            cl_children = self._build_leaf_list(cluster_idx)
            cl_file = f"{cl_slug}.json"
            with open(nodes_dir / cl_file, "w", encoding="utf-8") as f:
                json.dump(cl_children, f, ensure_ascii=False)

            cluster_nodes.append({
                "name": label_name,
                "childFile": f"nodes/{cl_file}",
                "recipeCount": len(cluster_idx),
                "childCount": len(cl_children),
                "silhouette": round(score, 3) if score else None,
            })

        # Noise → flat "Misc" node
        noise_idx = [indices[i] for i, l in enumerate(labels) if l == -1]
        if noise_idx:
            misc_slug = f"{kw_slug}__misc"
            misc_children = self._build_leaf_list(noise_idx)
            misc_file = f"{misc_slug}.json"
            with open(nodes_dir / misc_file, "w", encoding="utf-8") as f:
                json.dump(misc_children, f, ensure_ascii=False)
            cluster_nodes.append({
                "name": f"Misc {kw}",
                "childFile": f"nodes/{misc_file}",
                "recipeCount": len(noise_idx),
                "childCount": len(misc_children),
            })

        return cluster_nodes

    # -- TF-IDF cluster labeling -------------------------------------------
    def _generate_cluster_label(self, indices: list[int], parent_kw: str) -> str:
        """Generate a descriptive label for a cluster using TF-IDF on titles."""
        titles = self.recipes.iloc[indices]["title"].tolist()
        if len(titles) < 3:
            return titles[0] if titles else parent_kw

        try:
            vectorizer = TfidfVectorizer(
                max_features=50, stop_words="english",
                max_df=0.8, min_df=2,
            )
            tfidf = vectorizer.fit_transform(titles)
            feature_names = vectorizer.get_feature_names_out()
            mean_scores = np.asarray(tfidf.mean(axis=0)).flatten()
            top_idx = mean_scores.argsort()[-3:][::-1]
            top_words = [feature_names[i].title() for i in top_idx]
            # Filter out the parent keyword to avoid redundancy
            top_words = [w for w in top_words if w.lower() != parent_kw.lower()]
            label = " & ".join(top_words[:2]) if top_words else parent_kw
            return label
        except Exception:
            return f"{parent_kw} Group"

    # -- Leaf helpers -------------------------------------------------------
    def _build_leaf_list(self, indices: list[int]) -> list[dict]:
        """Create leaf nodes with similar-recipe IDs."""
        leaves = []
        # Pre-compute similarity for this batch
        if len(indices) > 1:
            sub_emb = self.embeddings[indices]
            sim_matrix = cosine_similarity(sub_emb)
        else:
            sim_matrix = None

        for local_i, global_i in enumerate(indices):
            row = self.recipes.iloc[global_i]
            leaf: dict = {
                "name": row["title"],
                "size": 1,
                "id": int(row["id"]),
                "ingredients": row["ingredients_list"],
                "directions": row["directions_list"],
                "category": row["category"],
            }
            # Add top-5 similar recipes
            if sim_matrix is not None and len(indices) > TOP_SIMILAR:
                sims = sim_matrix[local_i]
                sims[local_i] = -1  # exclude self
                top_k = np.argsort(sims)[-TOP_SIMILAR:][::-1]
                leaf["similar"] = [
                    {
                        "id": int(self.recipes.iloc[indices[k]]["id"]),
                        "name": self.recipes.iloc[indices[k]]["title"],
                    }
                    for k in top_k
                ]
            leaves.append(leaf)
        return leaves

    # -- Step 4 : Save outputs ----------------------------------------------
    def save(self, root: dict) -> None:
        """Write root tree and stats."""
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        # Root tree (compact — just categories + keywords, no recipes)
        root_path = OUTPUT_DIR / "taxonomy_tree.json"
        with open(root_path, "w", encoding="utf-8") as f:
            json.dump(root, f, indent=2, ensure_ascii=False)
        print(f"✅ Root tree → {root_path}")

        # Stats
        stats_path = OUTPUT_DIR / "stats.json"
        with open(stats_path, "w", encoding="utf-8") as f:
            json.dump(self.stats, f, indent=2, ensure_ascii=False)
        print(f"✅ Stats     → {stats_path}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main():
    builder = HybridTaxonomyBuilder()
    builder.load_data()
    builder.compute_embeddings()
    tree = builder.build_hierarchy()
    builder.save(tree)
    print("🎉 Pipeline complete!")


if __name__ == "__main__":
    main()
