import React, { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import * as d3 from 'd3';

const NODE_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F1948A', '#82E0AA',
];

const ForceGraphVisualization = forwardRef(({
    rootData,
    onRecipeSelect,
    onBreadcrumbUpdate,
    searchQuery,
    selectedIngredients = [],
}, ref) => {
    const containerRef = useRef(null);
    const svgRef = useRef(null);
    const simulationRef = useRef(null);

    const nodesRef = useRef([]);
    const linksRef = useRef([]);
    const expandedRef = useRef(new Set());
    const visibleIdsRef = useRef(new Set()); // Tracks currently visible filtered nodes

    useImperativeHandle(ref, () => ({
        collapseToPathNode: (name) => {
            const d = nodesRef.current.find(n => n.name === name);
            if (d) collapseNode(d);
        },
        findRecipeById: (id) => {
            return nodesRef.current.find(n => n.isLeaf && (n.recipeId === id || n.id === id)) || null;
        },
        deepExpandAll: async () => {
            setLoading(true);
            let fetchCount = 0;
            const MAX_FETCHES = 25;
            try {
                let keepGoing = true;
                while (keepGoing && fetchCount < MAX_FETCHES) {
                    applyFilters();
                    const toExpand = nodesRef.current.filter(n =>
                        !n.isLeaf && visibleIdsRef.current.has(n.id) && !expandedRef.current.has(n.id)
                    );
                    if (toExpand.length === 0) { keepGoing = false; break; }
                    const batch = toExpand.slice(0, 5);
                    await Promise.all(batch.map(n => expandNode(n, true)));
                    fetchCount += batch.length;
                }
            } finally {
                setLoading(false);
                updateGraph();
            }
        },
    }));

    // Ingredient → categories index
    const ingCatMapRef = useRef({});

    const [loading, setLoading] = useState(false);
    const [dimensions, setDimensions] = useState({ width: 960, height: 700 });
    const [filterStats, setFilterStats] = useState(null);

    // Keep callback refs fresh
    const onRecipeSelectRef = useRef(onRecipeSelect);
    const onBreadcrumbRef = useRef(onBreadcrumbUpdate);
    useEffect(() => { onRecipeSelectRef.current = onRecipeSelect; }, [onRecipeSelect]);
    useEffect(() => { onBreadcrumbRef.current = onBreadcrumbUpdate; }, [onBreadcrumbUpdate]);

    // Keep filter refs fresh
    const searchRef = useRef('');
    const ingredientsRef = useRef([]);
    useEffect(() => { searchRef.current = (searchQuery || '').toLowerCase().trim(); }, [searchQuery]);
    useEffect(() => { ingredientsRef.current = selectedIngredients || []; }, [selectedIngredients]);

    // ── Load ingredient→categories index ──────────────────────────
    useEffect(() => {
        fetch('/data/ingredient_categories.json')
            .then(r => r.json())
            .then(data => {
                const map = {};
                for (const [ing, cats] of Object.entries(data)) {
                    map[ing] = new Set(cats);
                }
                ingCatMapRef.current = map;
            })
            .catch(err => console.error('ingredient_categories load error:', err));
    }, []);

    // ── Responsive sizing ────────────────────────────────────────
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            if (width > 0 && height > 0) setDimensions({ width, height });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // ── Lazy-load children from JSON ─────────────────────────────
    const fetchChildren = useCallback(async (childFile) => {
        try {
            setLoading(true);
            const res = await fetch(`/data/${childFile}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            console.error('Fetch error:', err);
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    // ── Helpers ───────────────────────────────────────────────────
    function getRadius(d) {
        if (d.isLeaf) return 6;
        const c = d.recipeCount || d.childCount || 1;
        return Math.max(14, Math.min(42, Math.sqrt(c) * 1.8));
    }
    function getColor(d) {
        if (d.color) return d.color;
        if (d.isLeaf) return '#FFA07A';
        return NODE_COLORS[Math.abs(hashCode(d.name || '')) % NODE_COLORS.length];
    }
    function hashCode(s) {
        let h = 0;
        for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
        return h;
    }
    function slugify(s) { return (s || '').replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 30); }

    function ticked() {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        svg.selectAll('.link-line')
            .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
        svg.selectAll('.node-group')
            .attr('transform', d => `translate(${d.x},${d.y})`);
    }

    // ════════════════════════════════════════════════════════════════
    //  UNIVERSAL FILTER — applies search + ingredients simultaneously
    //  Search text matches: node name, category, AND ingredients
    //  Propagates UP (ancestors) and DOWN (all descendants of matches)
    // ════════════════════════════════════════════════════════════════
    function applyFilters() {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        const query = searchRef.current;
        const ings = ingredientsRef.current;
        const hasSearch = query.length > 0;
        const hasIngredients = ings.length > 0;

        if (!hasSearch && !hasIngredients) {
            setFilterStats(null);
            svg.selectAll('.node-group')
                .transition().duration(300)
                .style('opacity', 1).style('pointer-events', 'auto');
            svg.selectAll('.link-line')
                .transition().duration(300)
                .style('opacity', 0.4);
            return;
        }

        // ── Step 1: Allowed categories from ingredient→category index ──
        let allowedCatNames = null;
        if (hasIngredients) {
            const first = ings[0].toLowerCase();
            const firstCats = ingCatMapRef.current[first];
            if (firstCats) {
                allowedCatNames = new Set(firstCats);
                for (let i = 1; i < ings.length; i++) {
                    const cats = ingCatMapRef.current[ings[i].toLowerCase()];
                    if (!cats) { allowedCatNames = new Set(); break; }
                    allowedCatNames = new Set([...allowedCatNames].filter(c => cats.has(c)));
                }
            } else {
                allowedCatNames = new Set();
            }
        }

        // ── Step 2: Mark DIRECTLY matching nodes ────────────────────
        // A node "directly matches" if its own data matches the filters.
        // We will separately propagate to ancestors/descendants.
        const directMatchIds = new Set();

        nodesRef.current.forEach(n => {
            if (n.id === 'root') return; // root handled separately

            if (n.isLeaf) {
                // Leaf must pass BOTH search and ingredients
                let passSearch = true;
                if (hasSearch) {
                    const nm = (n.name || '').toLowerCase();
                    const cat = (n.category || '').toLowerCase();
                    const ingMatch = n.ingredients && n.ingredients.some(x => x.toLowerCase().includes(query));
                    passSearch = nm.includes(query) || cat.includes(query) || ingMatch;
                }
                let passIng = true;
                if (hasIngredients) {
                    if (!n.ingredients) passIng = false;
                    else {
                        const nodeIngs = n.ingredients.map(x => x.toLowerCase());
                        passIng = ings.every(sel => nodeIngs.some(ni => ni.includes(sel.toLowerCase())));
                    }
                }
                if (passSearch && passIng) directMatchIds.add(n.id);
            } else {
                // Non-leaf: check name against search
                let match = false;
                if (hasSearch && n.name && n.name.toLowerCase().includes(query)) {
                    match = true;
                }
                // Check if this category is allowed by ingredient filter
                if (hasIngredients && allowedCatNames) {
                    if (allowedCatNames.has(n.name)) match = true;
                }
                // Also check if search text matches as an ingredient→category lookup
                // e.g. user searches "chicken" → find categories that have "chicken" as ingredient
                if (hasSearch && !match) {
                    const searchCats = ingCatMapRef.current[query];
                    if (searchCats && searchCats.has(n.name)) match = true;
                }
                if (match) directMatchIds.add(n.id);
            }
        });

        // ── Step 3: Propagate UP — ancestors of direct matches ──────
        const visibleIds = new Set(directMatchIds);
        visibleIds.add('root'); // root always visible

        directMatchIds.forEach(id => {
            let node = nodesRef.current.find(n => n.id === id);
            while (node && node.parentId) {
                visibleIds.add(node.parentId);
                node = nodesRef.current.find(n => n.id === node.parentId);
            }
        });

        // ── Step 4: Propagate DOWN — all descendants of matching non-leaf nodes
        // If "Chicken" category matches, show ALL loaded children/grandchildren/etc.
        function addAllDescendants(parentId) {
            nodesRef.current.forEach(n => {
                if (n.parentId === parentId && !visibleIds.has(n.id)) {
                    visibleIds.add(n.id);
                    if (!n.isLeaf) addAllDescendants(n.id);
                }
            });
        }

        directMatchIds.forEach(id => {
            const node = nodesRef.current.find(n => n.id === id);
            if (node && !node.isLeaf) {
                addAllDescendants(id);
            }
        });

        // Count
        const allLeafCount = nodesRef.current.filter(n => n.isLeaf).length;
        const matchLeafCount = nodesRef.current.filter(n => n.isLeaf && visibleIds.has(n.id)).length;
        setFilterStats({ matching: matchLeafCount, total: allLeafCount });

        visibleIdsRef.current = visibleIds; // Store for export

        // ── Step 5: Apply opacity (NAMED transition to avoid conflict with exit) ──
        // Build a set of current node IDs so we skip exiting DOM elements
        const currentNodeIds = new Set(nodesRef.current.map(n => n.id));

        svg.selectAll('.node-group').each(function (d) {
            if (!currentNodeIds.has(d.id)) return; // skip exiting nodes!
            const show = visibleIds.has(d.id);
            d3.select(this)
                .transition('filter').duration(300)
                .style('opacity', show ? 1 : 0.06)
                .style('pointer-events', show ? 'auto' : 'none');
        });

        svg.selectAll('.link-line').each(function (d) {
            const sId = d.source.id || d.source;
            const tId = d.target.id || d.target;
            if (!currentNodeIds.has(sId) && !currentNodeIds.has(tId)) return; // skip exiting
            const show = visibleIds.has(sId) && visibleIds.has(tId);
            d3.select(this)
                .transition('filter').duration(300)
                .style('opacity', show ? 0.4 : 0.02);
        });
    }

    // Re-apply on filter changes
    useEffect(() => { applyFilters(); }, [searchQuery]);
    useEffect(() => { applyFilters(); }, [selectedIngredients]);

    // ── Click handler ─────────────────────────────────────────────
    async function handleNodeClick(event, d) {
        event.stopPropagation();
        if (d.isLeaf) {
            if (onRecipeSelectRef.current) onRecipeSelectRef.current(d);
            return;
        }
        if (expandedRef.current.has(d.id)) {
            collapseNode(d);
        } else {
            await expandNode(d);
        }
    }

    async function expandNode(d, skipUpdate = false) {
        if (expandedRef.current.has(d.id)) return;

        let children = d.children;
        if (d.childFile && !children) {
            children = await fetchChildren(d.childFile);
            d.children = children;
        }
        if (!children || children.length === 0) return;

        expandedRef.current.add(d.id);

        const newNodes = [];
        const newLinks = [];
        const angleStep = (2 * Math.PI) / children.length;

        children.forEach((child, i) => {
            const childId = `${d.id}__${slugify(child.name || 'item')}__${i}`;
            if (nodesRef.current.find(n => n.id === childId)) return;

            const isLeaf = !child.childFile && !child.children;
            const angle = angleStep * i;
            const spread = 120 + Math.random() * 40;

            newNodes.push({
                id: childId,
                name: child.name || 'Untitled',
                depth: d.depth + 1,
                parentId: d.id,
                childFile: child.childFile || null,
                children: child.children || null,
                recipeCount: child.recipeCount || child.size || 0,
                childCount: child.childCount || 0,
                isLeaf,
                x: d.x + Math.cos(angle) * spread,
                y: d.y + Math.sin(angle) * spread,
                color: isLeaf ? '#FFA07A' : NODE_COLORS[(d.depth + 1 + i) % NODE_COLORS.length],
                ...(isLeaf ? {
                    ingredients: child.ingredients,
                    directions: child.directions,
                    similar: child.similar,
                    category: child.category,
                    recipeId: child.id,
                } : {}),
                silhouette: child.silhouette,
            });
            newLinks.push({ source: d.id, target: childId });
        });

        nodesRef.current = [...nodesRef.current, ...newNodes];
        linksRef.current = [...linksRef.current, ...newLinks];

        if (onBreadcrumbRef.current && !skipUpdate) {
            onBreadcrumbRef.current(getAncestorPath(d));
        }

        if (!skipUpdate) updateGraph();
    }

    function collapseNode(d) {
        const toRemove = new Set();
        function collect(parentId) {
            nodesRef.current.forEach(n => {
                if (n.parentId === parentId && !toRemove.has(n.id)) {
                    toRemove.add(n.id);
                    expandedRef.current.delete(n.id);
                    collect(n.id);
                }
            });
        }
        collect(d.id);
        expandedRef.current.delete(d.id);

        nodesRef.current = nodesRef.current.filter(n => !toRemove.has(n.id));
        linksRef.current = linksRef.current.filter(l => {
            const s = l.source.id || l.source;
            const t = l.target.id || l.target;
            return !toRemove.has(s) && !toRemove.has(t);
        });

        if (onBreadcrumbRef.current) {
            onBreadcrumbRef.current(getAncestorPath(d));
        }

        updateGraph();
    }

    function getAncestorPath(d) {
        const path = [d.name || d.id];
        let cur = d;
        while (cur.parentId) {
            cur = nodesRef.current.find(n => n.id === cur.parentId);
            if (!cur) break;
            path.unshift(cur.name || cur.id);
        }
        return path;
    }

    // ── Update D3 graph ──────────────────────────────────────────
    function updateGraph() {
        const sim = simulationRef.current;
        if (!sim || !svgRef.current) return;
        const svg = d3.select(svgRef.current);

        // --- Links ---
        const linkG = svg.select('.links');
        const linkSel = linkG.selectAll('line')
            .data(linksRef.current, d => `${d.source.id || d.source}-${d.target.id || d.target}`);

        linkSel.exit().remove(); // Immediate removal — no transition

        linkSel.enter().append('line')
            .attr('class', 'link-line')
            .attr('stroke', 'rgba(255,255,255,0.15)')
            .attr('stroke-width', 1.5)
            .attr('opacity', 0)
            .transition('enter').duration(400).attr('opacity', 0.4);

        // --- Nodes ---
        const nodeG = svg.select('.nodes');
        const nodeSel = nodeG.selectAll('.node-group')
            .data(nodesRef.current, d => d.id);

        nodeSel.exit().remove(); // Immediate removal — no transition

        const enter = nodeSel.enter().append('g')
            .attr('class', 'node-group')
            .attr('cursor', 'pointer')
            .attr('opacity', 0)
            .on('click', (e, d) => handleNodeClick(e, d))
            .call(d3.drag()
                .on('start', (e, d) => {
                    if (!e.active) sim.alphaTarget(0.3).restart();
                    d.fx = d.x; d.fy = d.y;
                })
                .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
                .on('end', (e, d) => {
                    if (!e.active) sim.alphaTarget(0);
                    d.fx = null; d.fy = null;
                })
            );

        enter.append('circle')
            .attr('class', 'node-circle')
            .attr('r', 0)
            .attr('fill', d => getColor(d))
            .attr('stroke', 'rgba(255,255,255,0.3)')
            .attr('stroke-width', 2)
            .attr('filter', 'url(#drop-shadow)')
            .transition().duration(500)
            .attr('r', d => getRadius(d));

        enter.append('text')
            .attr('class', 'node-label')
            .attr('dy', d => getRadius(d) + 14)
            .attr('text-anchor', 'middle')
            .attr('font-size', d => d.isLeaf ? '9px' : '12px')
            .attr('font-weight', d => d.isLeaf ? 'normal' : '600')
            .attr('fill', '#e0e0e0')
            .text(d => {
                const n = d.name || '';
                return n.length > 22 ? n.slice(0, 19) + '…' : n;
            });

        // Pill Badge for recipe count
        const badgeG = enter.filter(d => !d.isLeaf && d.recipeCount).append('g')
            .attr('transform', d => `translate(0, ${getRadius(d) + 26})`);

        badgeG.append('rect')
            .attr('rx', 8).attr('ry', 8)
            .attr('x', -24).attr('y', -8)
            .attr('width', 48).attr('height', 16)
            .attr('fill', 'rgba(0,0,0,0.4)')
            .attr('stroke', 'rgba(255,255,255,0.2)');

        badgeG.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.3em')
            .attr('font-size', '9px')
            .attr('fill', '#fff')
            .text(d => {
                const c = d.recipeCount;
                return c >= 1000 ? `${(c / 1000).toFixed(1)}k` : c;
            });

        // Expand Ring indicator instead of confusing dot
        enter.filter(d => !d.isLeaf).append('circle')
            .attr('class', 'expand-ring')
            .attr('r', d => getRadius(d) + 4)
            .attr('fill', 'none')
            .attr('stroke', d => expandedRef.current.has(d.id) ? '#4ade80' : 'rgba(255,255,255,0.4)')
            .attr('stroke-width', d => expandedRef.current.has(d.id) ? 2 : 1)
            .attr('stroke-dasharray', d => expandedRef.current.has(d.id) ? 'none' : '4 4');

        enter.append('title').text(d => {
            let tip = d.name || '';
            if (d.recipeCount) tip += `\n${d.recipeCount.toLocaleString()} recipes`;
            if (d.isLeaf && d.ingredients) tip += `\nIngredients: ${d.ingredients.slice(0, 5).join(', ')}`;
            return tip;
        });

        enter.transition('enter').duration(500).attr('opacity', 1);

        // --- Simulation ---
        sim.nodes(nodesRef.current);
        sim.force('link').links(linksRef.current);
        sim.alpha(0.5).restart();

        // Apply filters after render
        setTimeout(() => applyFilters(), 80);
    }

    // ── Initialize ───────────────────────────────────────────────
    useEffect(() => {
        if (!rootData) return;
        const { width, height } = dimensions;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        // Defs
        const defs = svg.append('defs');
        const shadow = defs.append('filter').attr('id', 'drop-shadow');
        shadow.append('feDropShadow')
            .attr('dx', 0).attr('dy', 2).attr('stdDeviation', 3)
            .attr('flood-color', 'rgba(0,0,0,0.4)');

        const g = svg.append('g').attr('class', 'graph-container');
        g.append('g').attr('class', 'links');
        g.append('g').attr('class', 'nodes');

        // Zoom
        const zoom = d3.zoom().scaleExtent([0.1, 5])
            .on('zoom', e => g.attr('transform', e.transform));
        svg.call(zoom);
        svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2));

        // Root node — NOT pinned, free to move with forces
        const rootNode = {
            id: 'root',
            name: rootData.name,
            depth: 0,
            childFile: null,
            children: rootData.children || [],
            recipeCount: rootData.totalRecipes,
            isLeaf: false,
            x: 0, y: 0,
            color: '#FF6B6B',
        };
        nodesRef.current = [rootNode];
        linksRef.current = [];
        expandedRef.current = new Set();

        // Simulation — highly tuned for robust spreading with zero overlap
        const simulation = d3.forceSimulation()
            .force('link', d3.forceLink().id(d => d.id).distance(160).strength(0.8))
            .force('charge', d3.forceManyBody().strength(-1000).distanceMax(600))
            .force('collision', d3.forceCollide().radius(d => getRadius(d) + 40).iterations(4))
            .force('center', d3.forceCenter(0, 0).strength(0.08))
            .alphaDecay(0.015)
            .on('tick', ticked);

        simulationRef.current = simulation;
        updateGraph();

        return () => simulation.stop();
    }, [rootData, dimensions]);

    return (
        <div ref={containerRef} className="graph-container-wrapper">
            {loading && (
                <div className="graph-loading-indicator">
                    <div className="loading-spinner" /> Loading…
                </div>
            )}
            {filterStats && (
                <div className="graph-filter-badge">
                    {filterStats.matching > 0
                        ? `✅ ${filterStats.matching} of ${filterStats.total} recipes match`
                        : filterStats.total > 0
                            ? `⚠️ No matches in ${filterStats.total} loaded recipes — try expanding more`
                            : `ℹ️ Expand categories to see filtered recipes`
                    }
                </div>
            )}
            <svg
                ref={svgRef}
                width={dimensions.width}
                height={dimensions.height}
                viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
                className="force-graph-svg"
            />
        </div>
    );
});

export default ForceGraphVisualization;
