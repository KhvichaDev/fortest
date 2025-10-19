// Function to generate the status badge content and tooltip for a given patch ID.
function generatePatchStatusBadge(patchId, getPatchStatusInfo) {
    // We assume statusBadge is a DOM element that needs to be updated.
    const statusBadge = document.createElement('span'); 

    // --- Get patch status and build tooltip ---
    const statusInfo = getPatchStatusInfo(patchId);
    
    let statusText = 'Pending';
    let statusClass = 'status-pending';
    let timestampText = '';
    let tooltip = 'This patch has not been applied yet.';

    if (statusInfo) {
        // Set main status text
        if (statusInfo.status === 'success') {
            statusText = 'Applied';
            statusClass = 'status-success';
        } else if (statusInfo.status === 'error') {
            statusText = 'Failed';
            statusClass = 'status-error';
        }
        
        // Add timestamp
        if (statusInfo.timestamp) {
            const date = new Date(statusInfo.timestamp);
            timestampText = ` | ${date.toLocaleString()}`; 
        }

        // Build detailed tooltip from results if they exist
        if (statusInfo.results) {
            const { created, modified, deleted, errors, skipped } = statusInfo.results;
            let tooltipParts = [];

            const successCount = (created?.length || 0) + (modified?.length || 0) + (deleted?.length || 0);
            if (successCount > 0) {
                 tooltipParts.push(
                    `SUCCESS (${successCount}):\n` +
                    `${(created || []).map(f => `  - Created: ${f}`).join('\n')}\n` +
                    `${(modified || []).map(f => `  - Modified: ${f}`).join('\n')}\n` +
                    `${(deleted || []).map(f => `  - Deleted: ${f}`).join('\n')}`.trim()
                 );
            }

            if (errors && errors.length > 0) {
                tooltipParts.push(`ERRORS (${errors.length}):\n${errors.map(e => `  - ${e.filePath}: ${e.message}`).join('\n')}`);
            }

            if (skipped && skipped.length > 0) {
                tooltipParts.push(`SKIPPED (${skipped.length}):\n${skipped.map(s => `  - ${s.message}`).join('\n')}`);
            }
            
            if(tooltipParts.length > 0) {
                tooltip = tooltipParts.join('\n\n');
            } else if (statusInfo.status === 'success') {
                tooltip = 'Patch applied successfully, but no detailed results were recorded.';
            } else if (statusInfo.status === 'error') {
                tooltip = 'Patch failed, but no detailed error information was recorded.';
            }
        }
    }

    statusBadge.textContent = statusText + timestampText;
    statusBadge.className = 'gpus-patch-status-badge ' + statusClass;
    statusBadge.title = tooltip; // Apply the generated tooltip

    return statusBadge;
}