import React from 'react';

/**
 * Export the current subtree as CSV.
 * Recursively collects all loaded leaf nodes.
 */
const ExportButton = ({ nodes }) => {
    const handleExport = () => {
        if (!nodes || nodes.length === 0) return;

        // Collect only leaf nodes
        const leaves = nodes.filter(n => n.isLeaf);
        if (leaves.length === 0) {
            alert('No recipes loaded yet. Expand some nodes first!');
            return;
        }

        // Build CSV
        const headers = ['Title', 'Category', 'Ingredients', 'Directions'];
        const rows = leaves.map(leaf => [
            `"${(leaf.name || '').replace(/"/g, '""')}"`,
            `"${(leaf.category || '').replace(/"/g, '""')}"`,
            `"${(leaf.ingredients || []).join('; ').replace(/"/g, '""')}"`,
            `"${(leaf.directions || []).join('; ').replace(/"/g, '""')}"`,
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `recipe_export_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <button
            onClick={handleExport}
            className="flex items-center gap-1 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium shadow-sm"
            title="Export loaded recipes as CSV"
        >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export CSV
        </button>
    );
};

export default ExportButton;
