// validation.js: Server-side validation for WebSocket property update messages.
//
// When a client sends a type-3 message (resize/rotate), we validate the
// payload structure before rebroadcasting to other clients. This prevents
// malformed data from corrupting other clients' state. 
//
// Used by: server.js (case 3 in the WS message handler)

export const validatePropertyUpdate = (data) => {
    if (!data || typeof data !== 'object') {
        return { valid: false, error: 'Payload must be an object' };
    }

    if (!data.objectId || typeof data.objectId !== 'string') {
        return { valid: false, error: 'Missing or invalid objectId' };
    }

    // Only allow known changes - don't relay arbitrary payloads
    const allowedTypes = ['resize', 'rotate', 'move', 'group'];
    if (!data.type || !allowedTypes.includes(data.type)) {
        return { valid: false, error: `Invalid type: ${data.type}. Expected one of: ${allowedTypes.join(', ')}` };
    }

    if (!data.properties || typeof data.properties !== 'object') {
        return { valid: false, error: 'Missing or invalid properties object' };
    }

    // Type-specific validation - ensure numeric fields are actually numbers
    if (data.type === 'resize') {
        const { width, height, radius } = data.properties;
        // At least one dimension must be present
        const hasValidDimension = (width !== undefined && typeof width === 'number') ||
            (height !== undefined && typeof height === 'number') ||
            (radius !== undefined && typeof radius === 'number');
        if (!hasValidDimension) {
            return { valid: false, error: 'Resize must include numeric width, height, or radius' };
        }
    }

    if (data.type === 'rotate') {
        if (data.properties.rotation === undefined || typeof data.properties.rotation !== 'number') {
            return { valid: false, error: 'Rotate must include numeric rotation' };
        }
    }

    if (data.type === 'group') {
        const { parentId, childrenIds } = data.properties;
        const hasParentId = parentId !== undefined;
        const hasChildrenIds = childrenIds !== undefined;

        if (!hasParentId && !hasChildrenIds) {
            return { valid: false, error: 'Group must include parentId or childrenIds' };
        }

        if (hasParentId && parentId !== null && typeof parentId !== 'string') {
            return { valid: false, error: 'parentId must be a string or null' };
        }

        if (hasChildrenIds) {
            if (!Array.isArray(childrenIds)) {
                return { valid: false, error: 'childrenIds must be an array' };
            }
            if (childrenIds.some(id => typeof id !== 'string')) {
                return { valid: false, error: 'Every childrenIds entry must be a string' };
            }
        }
    }

    return { valid: true };
};
