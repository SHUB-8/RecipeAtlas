import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as d3 from 'd3';

/**
 * ForceGraphVisualization
 * -----------------------
 * Interactive expand/collapse force-directed graph.
 *
 * - Starts with a single root node.
 * - Click a node to expand it (fetch children via lazy-load JSON files).
 * - Sibling/unrelated nodes dim/blur when a branch is focused.
 * - Leaf nodes (recipes) trigger onRecipeSelect callback.
 */

const WIDTH = 960;
const HEIGHT = 700;
const NODE_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F1948A', '#82E0AA',
];

const ForceGraphVisualization = ({
    rootData,
    onRecipeSelect,
    onBreadcrumbUpdate,
    searchQuery,
    ingredientFilter,
}) => {
    const svgRef = useRef(null);
    const simulationRef = useRef(null);
    const nodesRef = useRef([]);       // live D3 node data
    const linksRef = useRef([]);       // live D3 link data
    const expandedRef = useRef(new Set());
    const focusPathRef = useRef([]);   // path of currently focused nodes
    const [loading, setLoading] = useState(false);

    // Stable callback refs
    const onRecipeSelectRef = useRef(onRecipeSelect);
    const onBreadcrumbRef = useRef(onBreadcrumbUpdate);
    useEffect(() => { onRecipeSelectRef.current = onRecipeSelect; }, [onRecipeSelect]);
    useEffect(() => { onBreadcrumbRef.current = onBreadcrumbUpdate; }, [onBreadcrumbUpdate]);

    // ── Lazy-load children from JSON file ─────────────────────────
    const fetchChildren = useCallback(async (childFile) => {
        try {
            setLoading(true);
            const res = await fetch(`/data/${childFile}`);
            if (!res.ok) throw new Error(`Failed to load ${childFile}`);
            return await res.json();
        } catch (err) {
            console.error('Lazy-load error:', err);
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    // ── Initialize D3 Force Simulation ────────────────────────────
    useEffect(() => {
        if (!rootData) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        // Defs for blur filter and glow
        const defs = svg.append('defs');
        const blurFilter = defs.append('filter').attr('id', 'blur-dim');
        blurFilter.append('feGaussianBlur').attr('stdDeviation', 1.5);

        const glowFilter = defs.append('filter').attr('id', 'glow');
        glowFilter.append('feGaussianBlur').attr('stdDeviation', 3).attr('result', 'glow');
        const merge = glowFilter.append('feMerge');
        merge.append('feMergeNode').attr('in', 'glow');
        merge.append('feMergeNode').attr('in', 'SourceGraphic');

        // Container groups
        const g = svg.append('g').attr('class', 'graph-container');
        const linkGroup = g.append('g').attr('class', 'links');
        const nodeGroup = g.append('g').attr('class', 'nodes');

        // Zoom
        const zoom = d3.zoom()
            .scaleExtent([0.2, 4])
            .on('zoom', (e) => g.attr('transform', e.transform));
        svg.call(zoom);
        // Center initial view
        svg.call(zoom.transform, d3.zoomIdentity.translate(WIDTH / 2, HEIGHT / 2));

        // Root node
        const rootNode = {
            id: 'root',
            name: rootData.name,
            depth: 0,
            childFile: null,
            children: rootData.children || [],
            recipeCount: rootData.totalRecipes,
            isLeaf: false,
            x: 0, y: 0,
            fx: 0, fy: 0,  // pin root
            color: '#FF6B6B',
        };
        nodesRef.current = [rootNode];
        linksRef.current = [];
        expandedRef.current = new Set();
        focusPathRef.current = ['root'];

        // Force simulation
        const simulation = d3.forceSimulation()
            .force('link', d3.forceLink().id(d => d.id).distance(100).strength(0.5))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('collision', d3.forceCollide().radius(d => getRadius(d) + 10))
            .force('x', d3.forceX(0).strength(0.05))
            .force('y', d3.forceY(0).strength(0.05))
            .alphaDecay(0.02)
            .on('tick', () => ticked(linkGroup, nodeGroup));

        simulationRef.current = simulation;

        // Initial render
        updateGraph(simulation, linkGroup, nodeGroup, svg, zoom);

        return () => simulation.stop();
    }, [rootData]);

    // ── Update search highlighting ────────────────────────────────
    useEffect(() => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        const query = (searchQuery || '').toLowerCase();

        svg.selectAll('.node-group').each(function (d) {
            const match = !query || d.name.toLowerCase().includes(query);
            d3.select(this).select('circle')
                .attr('filter', match ? null : 'url(#blur-dim)')
                .attr('opacity', match ? 1 : 0.3);
            d3.select(this).select('text')
                .attr('opacity', match ? 1 : 0.2);
        });
    }, [searchQuery]);

    // ── Update ingredient filter highlighting ─────────────────────
    useEffect(() => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        const filter = (ingredientFilter || '').toLowerCase();

        svg.selectAll('.node-group').each(function (d) {
            if (!filter || !d.isLeaf) {
                d3.select(this).select('circle').attr('stroke', null).attr('stroke-width', null);
                return;
            }
            const hasIngredient = d.ingredients &&
                d.ingredients.some(ing => ing.toLowerCase().includes(filter));
            d3.select(this).select('circle')
                .attr('stroke', hasIngredient ? '#FFD700' : null)
                .attr('stroke-width', hasIngredient ? 3 : null)
                .attr('opacity', hasIngredient ? 1 : 0.2);
        });
    }, [ingredientFilter]);

    // ── Helper: node radius based on recipe count ─────────────────
    function getRadius(d) {
        if (d.isLeaf) return 6;
        const count = d.recipeCount || d.childCount || 1;
        return Math.max(10, Math.min(40, Math.sqrt(count) * 1.5));
    }

    // ── Helper: get color for a node ──────────────────────────────
    function getColor(d) {
        if (d.color) return d.color;
        if (d.isLeaf) return '#FFA07A';
        return NODE_COLORS[Math.abs(hashCode(d.name)) % NODE_COLORS.length];
    }

    function hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    // ── Tick function ─────────────────────────────────────────────
    function ticked(linkGroup, nodeGroup) {
        linkGroup.selectAll('line')
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        nodeGroup.selectAll('.node-group')
            .attr('transform', d => `translate(${d.x},${d.y})`);
    }

    // ── Click handler: expand / collapse / show recipe ────────────
    async function handleNodeClick(event, d, simulation, linkGroup, nodeGroup, svg, zoom) {
        event.stopPropagation();

        // Leaf node → show recipe
        if (d.isLeaf) {
            if (onRecipeSelectRef.current) onRecipeSelectRef.current(d);
            return;
        }

        const nodeId = d.id;

        // If already expanded → collapse
        if (expandedRef.current.has(nodeId)) {
            collapseNode(d, simulation, linkGroup, nodeGroup, svg, zoom);
            return;
        }

        // Expand node
        let children = d.children;
        if (d.childFile && !children) {
            children = await fetchChildren(d.childFile);
            d.children = children;
        }

        if (!children || children.length === 0) return;

        expandedRef.current.add(nodeId);

        // Add child nodes
        const newNodes = [];
        const newLinks = [];
        const angle_step = (2 * Math.PI) / children.length;

        children.forEach((child, i) => {
            const childId = `${nodeId}__${slugify(child.name)}__${i}`;
            // Don't add if already exists
            if (nodesRef.current.find(n => n.id === childId)) return;

            const isLeaf = !child.childFile && !child.children;
            const angle = angle_step * i;
            const dist = 80 + Math.random() * 40;

            const childNode = {
                id: childId,
                name: child.name,
                depth: d.depth + 1,
                parentId: nodeId,
                childFile: child.childFile || null,
                children: child.children || null,
                recipeCount: child.recipeCount || child.size || 0,
                childCount: child.childCount || 0,
                isLeaf,
                x: d.x + Math.cos(angle) * dist,
                y: d.y + Math.sin(angle) * dist,
                color: isLeaf ? '#FFA07A' : NODE_COLORS[(d.depth + 1 + i) % NODE_COLORS.length],
                // Leaf data
                ...(isLeaf ? {
                    ingredients: child.ingredients,
                    directions: child.directions,
                    similar: child.similar,
                    category: child.category,
                    recipeId: child.id,
                } : {}),
                silhouette: child.silhouette,
            };
            newNodes.push(childNode);
            newLinks.push({ source: nodeId, target: childId });
        });

        nodesRef.current = [...nodesRef.current, ...newNodes];
        linksRef.current = [...linksRef.current, ...newLinks];

        // Update focus path
        focusPathRef.current = getAncestorPath(d);

        // Dim unrelated nodes
        applyFocus(svg);

        // Update breadcrumbs
        if (onBreadcrumbRef.current) {
            const path = getAncestorPath(d).map(id =>
                nodesRef.current.find(n => n.id === id)?.name || id
            );
            onBreadcrumbRef.current(path);
        }

        updateGraph(simulation, linkGroup, nodeGroup, svg, zoom);
    }

    // ── Collapse a node ───────────────────────────────────────────
    function collapseNode(d, simulation, linkGroup, nodeGroup, svg, zoom) {
        const toRemove = new Set();
        function collectDescendants(nodeId) {
            nodesRef.current.forEach(n => {
                if (n.parentId === nodeId && !toRemove.has(n.id)) {
                    toRemove.add(n.id);
                    expandedRef.current.delete(n.id);
                    collectDescendants(n.id);
                }
            });
        }
        collectDescendants(d.id);
        expandedRef.current.delete(d.id);

        nodesRef.current = nodesRef.current.filter(n => !toRemove.has(n.id));
        linksRef.current = linksRef.current.filter(
            l => !toRemove.has(l.target.id || l.target) && !toRemove.has(l.source.id || l.source)
        );

        focusPathRef.current = getAncestorPath(d);
        applyFocus(svg);

        if (onBreadcrumbRef.current) {
            const path = getAncestorPath(d).map(id =>
                nodesRef.current.find(n => n.id === id)?.name || id
            );
            onBreadcrumbRef.current(path);
        }

        updateGraph(simulation, linkGroup, nodeGroup, svg, zoom);
    }

    // ── Focus / dim helpers ───────────────────────────────────────
    function getAncestorPath(d) {
        const path = [d.id];
        let current = d;
        while (current.parentId) {
            path.unshift(current.parentId);
            current = nodesRef.current.find(n => n.id === current.parentId);
            if (!current) break;
        }
        return path;
    }

    function applyFocus(svg) {
        const focusSet = new Set(focusPathRef.current);
        // Also include direct children of the last focused node
        const lastFocused = focusPathRef.current[focusPathRef.current.length - 1];
        nodesRef.current.forEach(n => {
            if (n.parentId === lastFocused) focusSet.add(n.id);
        });

        svg.selectAll('.node-group').each(function (d) {
            const inFocus = focusSet.has(d.id);
            d3.select(this).transition().duration(300)
                .attr('opacity', inFocus ? 1 : 0.15);
        });
        svg.selectAll('.link-line').each(function (d) {
            const srcId = d.source.id || d.source;
            const tgtId = d.target.id || d.target;
            const inFocus = focusSet.has(srcId) && focusSet.has(tgtId);
            d3.select(this).transition().duration(300)
                .attr('opacity', inFocus ? 0.6 : 0.05);
        });
    }

    // ── Update D3 graph ───────────────────────────────────────────
    function updateGraph(simulation, linkGroup, nodeGroup, svg, zoom) {
        // Links
        const linkSel = linkGroup.selectAll('line')
            .data(linksRef.current, d => `${d.source.id || d.source}-${d.target.id || d.target}`);
        linkSel.exit().transition().duration(300).attr('opacity', 0).remove();
        linkSel.enter()
            .append('line')
            .attr('class', 'link-line')
            .attr('stroke', '#999')
            .attr('stroke-opacity', 0.4)
            .attr('stroke-width', 1.5)
            .attr('opacity', 0)
            .transition().duration(500).attr('opacity', 0.4);

        // Nodes
        const nodeSel = nodeGroup.selectAll('.node-group')
            .data(nodesRef.current, d => d.id);

        nodeSel.exit().transition().duration(300)
            .attr('opacity', 0)
            .attr('transform', d => `translate(${d.x},${d.y}) scale(0)`)
            .remove();

        const enter = nodeSel.enter()
            .append('g')
            .attr('class', 'node-group')
            .attr('cursor', 'pointer')
            .attr('opacity', 0)
            .on('click', (event, d) =>
                handleNodeClick(event, d, simulation, linkGroup, nodeGroup, svg, zoom)
            )
            .call(d3.drag()
                .on('start', (e, d) => {
                    if (!e.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x; d.fy = d.y;
                })
                .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
                .on('end', (e, d) => {
                    if (!e.active) simulation.alphaTarget(0);
                    if (d.id !== 'root') { d.fx = null; d.fy = null; }
                })
            );

        // Circle
        enter.append('circle')
            .attr('r', 0)
            .attr('fill', d => getColor(d))
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .transition().duration(500)
            .attr('r', d => getRadius(d));

        // Label
        enter.append('text')
            .attr('dy', d => getRadius(d) + 14)
            .attr('text-anchor', 'middle')
            .attr('font-size', d => d.isLeaf ? '9px' : '11px')
            .attr('font-weight', d => d.isLeaf ? 'normal' : 'bold')
            .attr('fill', '#333')
            .text(d => d.name.length > 20 ? d.name.slice(0, 17) + '…' : d.name);

        // Recipe count badge (for non-leaf)
        enter.filter(d => !d.isLeaf && d.recipeCount)
            .append('text')
            .attr('dy', '0.35em')
            .attr('text-anchor', 'middle')
            .attr('font-size', '9px')
            .attr('fill', '#fff')
            .attr('font-weight', 'bold')
            .text(d => {
                const c = d.recipeCount;
                return c >= 1000 ? `${(c / 1000).toFixed(1)}k` : c;
            });

        // Expanded indicator
        enter.filter(d => !d.isLeaf)
            .append('circle')
            .attr('r', 4)
            .attr('cx', d => getRadius(d) - 2)
            .attr('cy', d => -(getRadius(d) - 2))
            .attr('fill', d => expandedRef.current.has(d.id) ? '#4CAF50' : '#ccc')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1);

        enter.transition().duration(500).attr('opacity', 1);

        // Tooltip
        enter.append('title')
            .text(d => {
                let tip = d.name;
                if (d.recipeCount) tip += `\n${d.recipeCount.toLocaleString()} recipes`;
                if (d.silhouette) tip += `\nCluster quality: ${d.silhouette}`;
                if (d.isLeaf && d.ingredients) tip += `\n${d.ingredients.slice(0, 3).join(', ')}…`;
                return tip;
            });

        // Update simulation
        simulation.nodes(nodesRef.current);
        simulation.force('link').links(linksRef.current);
        simulation.alpha(0.5).restart();
    }

    function slugify(text) {
        return text.replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 30);
    }

    return (
        <div className="relative w-full h-full">
            {loading && (
                <div className="absolute top-2 right-2 bg-orange-500 text-white px-3 py-1 rounded-full text-sm animate-pulse z-10">
                    Loading…
                </div>
            )}
            <svg
                ref={svgRef}
                width={WIDTH}
                height={HEIGHT}
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="w-full h-full bg-gray-50 rounded-lg"
            />
        </div>
    );
};

export default ForceGraphVisualization;
