"""
Generate search and ingredient indices from the taxonomy node files.
Run AFTER build_taxonomy.py has generated all node files.

Outputs:
  - frontend/public/data/ingredients_list.json       (top 2000 ingredients for autocomplete)
  - frontend/public/data/search_index.json           (categories + keywords for search)
  - frontend/public/data/ingredient_categories.json  (ingredient → list of category names)
"""

import json
import time
from pathlib import Path
from collections import Counter, defaultdict

DATA_DIR = Path("frontend/public/data")
NODES_DIR = DATA_DIR / "nodes"

def main():
    print("🔍 Generating indices from node files…")
    t0 = time.time()

    # 1. Load taxonomy_tree.json for categories
    tree = json.load(open(DATA_DIR / "taxonomy_tree.json", "r", encoding="utf-8"))
    categories = tree.get("children", [])
    print(f"   {len(categories)} categories in tree")

    # Build category slug → name mapping from childFile
    cat_slug_to_name = {}
    for cat in categories:
        cf = cat.get("childFile", "")
        if cf:
            slug = cf.replace("nodes/", "").replace(".json", "")
            cat_slug_to_name[slug] = cat["name"]

    # Build search index (categories + keywords only)
    search_index = []
    for cat in categories:
        search_index.append({
            "name": cat["name"],
            "type": "category",
            "count": cat.get("recipeCount", 0),
        })

    # 2. Scan ALL node files
    node_files = sorted(NODES_DIR.glob("*.json"))
    print(f"   {len(node_files)} node files to scan…")

    ingredient_counter = Counter()
    ingredient_categories = defaultdict(set)  # ingredient → set of category names
    scanned = 0
    total_recipes = 0

    for nf in node_files:
        try:
            data = json.load(open(nf, "r", encoding="utf-8"))
        except Exception:
            continue

        if not isinstance(data, list) or len(data) == 0:
            continue

        first = data[0]

        # Extract category name from filename
        fname = nf.stem  # e.g. "chicken__baked_chicken__cluster_0"
        cat_slug = fname.split("__")[0]
        cat_name = cat_slug_to_name.get(cat_slug, cat_slug)

        if first.get("childFile"):
            # Non-leaf file (keywords/sub-categories)
            for item in data:
                search_index.append({
                    "name": item["name"],
                    "type": "keyword",
                    "count": item.get("recipeCount", 0),
                })
        else:
            # Leaf file (recipes)
            for recipe in data:
                total_recipes += 1
                ingredients = recipe.get("ingredients", [])
                if ingredients:
                    for ing in ingredients:
                        if ing and isinstance(ing, str):
                            ing_lower = ing.strip().lower()
                            ingredient_counter[ing_lower] += 1
                            ingredient_categories[ing_lower].add(cat_name)

        scanned += 1
        if scanned % 500 == 0:
            print(f"   Scanned {scanned}/{len(node_files)} files…")

    # 3. Build outputs
    # Top 2000 ingredients for autocomplete
    top_ingredients = [{"name": ing, "count": cnt}
                       for ing, cnt in ingredient_counter.most_common(2000)]

    # Ingredient → categories mapping (for the top 2000)
    top_ing_names = {item["name"] for item in top_ingredients}
    ing_cat_map = {
        ing: sorted(list(cats))
        for ing, cats in ingredient_categories.items()
        if ing in top_ing_names
    }

    print(f"   {len(ingredient_counter)} unique ingredients found")
    print(f"   {total_recipes} total recipes scanned")
    print(f"   {len(search_index)} search index entries")
    print(f"   {len(ing_cat_map)} ingredients with category mappings")

    # 4. Save
    with open(DATA_DIR / "ingredients_list.json", "w", encoding="utf-8") as f:
        json.dump(top_ingredients, f)

    with open(DATA_DIR / "search_index.json", "w", encoding="utf-8") as f:
        json.dump(search_index, f)

    with open(DATA_DIR / "ingredient_categories.json", "w", encoding="utf-8") as f:
        json.dump(ing_cat_map, f)

    elapsed = time.time() - t0
    print(f"✅ Indices generated in {elapsed:.1f}s")
    for name in ["ingredients_list.json", "search_index.json", "ingredient_categories.json"]:
        size = (DATA_DIR / name).stat().st_size / 1024
        print(f"   → {name}: {size:.1f} KB")

if __name__ == "__main__":
    main()
