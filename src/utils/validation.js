// Validation utilities for WebSocket message payloads

/**
 * Validates a property update payload
 * @param {Object} payload - The parsed payload object
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
export function validatePropertyUpdate(payload) {
    // Check objectId
    if (!payload || typeof payload.objectId !== 'string' || payload.objectId.trim() === '') {
        return { valid: false, error: 'Missing or invalid objectId' };
    }

    // Check type
    const validTypes = ['resize', 'rotate', 'update'];
    if (payload.type && !validTypes.includes(payload.type)) {
        return { valid: false, error: `Invalid type: ${payload.type}. Expected: ${validTypes.join(', ')}` };
    }

    // Check properties object
    if (!payload.properties || typeof payload.properties !== 'object') {
        return { valid: false, error: 'Missing or invalid properties object' };
    }

    const props = payload.properties;

    // Validate numeric fields if present
    const numericFields = ['width', 'height', 'rotation', 'scaleX', 'scaleY'];
    for (const field of numericFields) {
        if (props[field] !== undefined && typeof props[field] !== 'number') {
            return { valid: false, error: `Property '${field}' must be a number` };
        }
    }

    // Validate width/height are positive if present
    if (props.width !== undefined && props.width <= 0) {
        return { valid: false, error: 'width must be positive' };
    }
    if (props.height !== undefined && props.height <= 0) {
        return { valid: false, error: 'height must be positive' };
    }

    return { valid: true };
}
