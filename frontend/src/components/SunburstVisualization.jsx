import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

/**
 * Zoomable Sunburst chart powered by D3.js.
 *
 * Props
 * -----
 * data           – hierarchical JSON (root → categories → keywords → recipes)
 * onRecipeSelect – callback fired when a leaf (recipe) arc is clicked
 */
const SunburstVisualization = ({ data, onRecipeSelect }) => {
    const svgRef = useRef(null);
    const onRecipeSelectRef = useRef(onRecipeSelect);

    // Keep the ref up-to-date without triggering re-renders
    useEffect(() => {
        onRecipeSelectRef.current = onRecipeSelect;
    }, [onRecipeSelect]);

    useEffect(() => {
        if (!data) return;

        // ── Setup ──────────────────────────────────────────────────────────
        d3.select(svgRef.current).selectAll('*').remove();

        const width = 800;
        const radius = width / 6;

        const color = d3.scaleOrdinal(
            d3.quantize(d3.interpolateRainbow, data.children.length + 1),
        );

        // ── Hierarchy & partition ──────────────────────────────────────────
        const hierarchy = d3
            .hierarchy(data)
            .sum((d) => d.size || 1)
            .sort((a, b) => b.value - a.value);

        const root = d3
            .partition()
            .size([2 * Math.PI, hierarchy.height + 1])(hierarchy);

        root.each((d) => (d.current = d));

        // ── Arc generator ──────────────────────────────────────────────────
        const arc = d3
            .arc()
            .startAngle((d) => d.x0)
            .endAngle((d) => d.x1)
            .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.005))
            .padRadius(radius * 1.5)
            .innerRadius((d) => d.y0 * radius)
            .outerRadius((d) => Math.max(d.y0 * radius, d.y1 * radius - 1));

        // ── SVG canvas ─────────────────────────────────────────────────────
        const svg = d3
            .select(svgRef.current)
            .attr('viewBox', [-width / 2, -width / 2, width, width])
            .style('font', '10px sans-serif');

        // ── Draw arcs ──────────────────────────────────────────────────────
        const path = svg
            .append('g')
            .selectAll('path')
            .data(root.descendants().slice(1))
            .join('path')
            .attr('fill', (d) => {
                while (d.depth > 1) d = d.parent;
                return color(d.data.name);
            })
            .attr('fill-opacity', (d) =>
                arcVisible(d.current) ? (d.children ? 0.6 : 0.4) : 0,
            )
            .attr('pointer-events', (d) =>
                arcVisible(d.current) ? 'auto' : 'none',
            )
            .attr('d', (d) => arc(d.current))
            .style('cursor', 'pointer');

        // Branch arcs → zoom on click
        path
            .filter((d) => d.children)
            .on('click', clicked);

        // Leaf arcs → show recipe details
        path
            .filter((d) => !d.children)
            .on('click', (_event, d) => {
                if (onRecipeSelectRef.current) onRecipeSelectRef.current(d.data);
            });

        // Tooltip (native browser tooltip via <title>)
        path
            .append('title')
            .text(
                (d) =>
                    `${d
                        .ancestors()
                        .map((n) => n.data.name)
                        .reverse()
                        .join(' / ')}\n${d.value?.toLocaleString()} recipes`,
            );

        // ── Labels ─────────────────────────────────────────────────────────
        const label = svg
            .append('g')
            .attr('pointer-events', 'none')
            .attr('text-anchor', 'middle')
            .style('user-select', 'none')
            .selectAll('text')
            .data(root.descendants().slice(1))
            .join('text')
            .attr('dy', '0.35em')
            .attr('fill-opacity', (d) => +labelVisible(d.current))
            .attr('transform', (d) => labelTransform(d.current))
            .text((d) =>
                d.data.name.length > 15
                    ? d.data.name.slice(0, 12) + '…'
                    : d.data.name,
            );

        // ── Center circle (click to zoom out) ──────────────────────────────
        const parent = svg
            .append('circle')
            .datum(root)
            .attr('r', radius)
            .attr('fill', 'none')
            .attr('pointer-events', 'all')
            .on('click', clicked);

        const centerText = svg
            .append('text')
            .attr('text-anchor', 'middle')
            .attr('pointer-events', 'none')
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .text(root.data.name);

        // ── Zoom transition ────────────────────────────────────────────────
        function clicked(_event, p) {
            parent.datum(p.parent || root);
            centerText.text(p.data.name);

            root.each(
                (d) =>
                (d.target = {
                    x0:
                        Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) *
                        2 *
                        Math.PI,
                    x1:
                        Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) *
                        2 *
                        Math.PI,
                    y0: Math.max(0, d.y0 - p.depth),
                    y1: Math.max(0, d.y1 - p.depth),
                }),
            );

            const t = svg.transition().duration(750);

            path
                .transition(t)
                .tween('data', (d) => {
                    const i = d3.interpolate(d.current, d.target);
                    return (t) => (d.current = i(t));
                })
                .filter(function (d) {
                    return (
                        +this.getAttribute('fill-opacity') || arcVisible(d.target)
                    );
                })
                .attr('fill-opacity', (d) =>
                    arcVisible(d.target) ? (d.children ? 0.6 : 0.4) : 0,
                )
                .attr('pointer-events', (d) =>
                    arcVisible(d.target) ? 'auto' : 'none',
                )
                .attrTween('d', (d) => () => arc(d.current));

            label
                .filter(function (d) {
                    return (
                        +this.getAttribute('fill-opacity') || labelVisible(d.target)
                    );
                })
                .transition(t)
                .attr('fill-opacity', (d) => +labelVisible(d.target))
                .attrTween('transform', (d) => () => labelTransform(d.current));
        }

        // ── Visibility helpers ─────────────────────────────────────────────
        function arcVisible(d) {
            return d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
        }

        function labelVisible(d) {
            return d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
        }

        function labelTransform(d) {
            const x = ((d.x0 + d.x1) / 2) * (180 / Math.PI);
            const y = ((d.y0 + d.y1) / 2) * radius;
            return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
        }
    }, [data]);  // only rebuild chart when data changes

    return (
        <div className="flex justify-center items-center w-full h-full overflow-hidden">
            <svg ref={svgRef} className="w-full max-w-[800px] h-[800px]" />
        </div>
    );
};

export default SunburstVisualization;
