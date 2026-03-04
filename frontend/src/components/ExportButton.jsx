import React, { useState } from 'react';

/**
 * Export the full hierarchical taxonomy tree as JSON.
 * Downloads taxonomy_tree.json and all referenced node files,
 * producing a single self-contained hierarchical JSON.
 */
const ExportButton = () => {
    const [exporting, setExporting] = useState(false);

    const handleExport = async () => {
        try {
            setExporting(true);

            // Load the root taxonomy tree
            const res = await fetch('/data/taxonomy_tree.json');
            if (!res.ok) throw new Error('Failed to load taxonomy data');
            const tree = await res.json();

            // Build the full tree by resolving child files recursively
            const fullTree = await resolveTree(tree);

            // Download as JSON
            const json = JSON.stringify(fullTree, null, 2);
            const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `recipe_taxonomy_tree_${new Date().toISOString().slice(0, 10)}.json`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export error:', err);
            alert('Export failed: ' + err.message);
        } finally {
            setExporting(false);
        }
    };

    // Recursively resolve childFile references (up to 2 levels deep to keep file size reasonable)
    const resolveTree = async (node, depth = 0) => {
        const result = { ...node };

        // If this node has a childFile and we haven't gone too deep, resolve it
        if (node.childFile && depth < 2) {
            try {
                const res = await fetch(`/data/${node.childFile}`);
                if (res.ok) {
                    const children = await res.json();
                    result.children = await Promise.all(
                        children.map(child => resolveTree(child, depth + 1))
                    );
                    delete result.childFile;
                }
            } catch (err) {
                console.warn(`Could not resolve ${node.childFile}:`, err);
            }
        }

        // If children exist in the node already (root level)
        if (node.children && Array.isArray(node.children)) {
            result.children = await Promise.all(
                node.children.map(child => resolveTree(child, depth + 1))
            );
        }

        return result;
    };

    return (
        <button
            className="export-btn"
            onClick={handleExport}
            disabled={exporting}
            title="Download the hierarchical taxonomy tree as JSON"
        >
            {exporting ? '⏳ Exporting…' : '📥 Export Tree'}
        </button>
    );
};

export default ExportButton;
