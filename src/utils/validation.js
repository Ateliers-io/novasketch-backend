// validation.js: Server-side validation for WebSocket property update messages.
//
// When a client sends a type-3 message (resize/rotate), we validate the
// payload structure before rebroadcasting to other clients. This prevents
// malformed data from corrupting other clients' state. 
//
// Used by: server.js (case 3 in the WS message handler)

const ALLOWED_TYPES = ['resize', 'rotate', 'move', 'group', 'frame_meta'];

const isNumeric = (value) => value !== undefined && typeof value === 'number';

const validateResize = (properties) => {
    const { width, height, radius } = properties;
    if (!isNumeric(width) && !isNumeric(height) && !isNumeric(radius)) {
        return { valid: false, error: 'Resize must include numeric width, height, or radius' };
    }
    return null;
};

const validateRotate = (properties) => {
    if (!isNumeric(properties.rotation)) {
        return { valid: false, error: 'Rotate must include numeric rotation' };
    }
    return null;
};

const validateGroup = (properties) => {
    const { parentId, childrenIds } = properties;
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

    return null;
};

const validateFrameMeta = (properties) => {
    const { name, ownerId, assignedUserIds } = properties;
    const hasName = name !== undefined;
    const hasOwnerId = ownerId !== undefined;
    const hasAssignedUserIds = assignedUserIds !== undefined;

    if (!hasName && !hasOwnerId && !hasAssignedUserIds) {
        return { valid: false, error: 'Frame meta update must include name, ownerId, or assignedUserIds' };
    }

    if (hasName && typeof name !== 'string') {
        return { valid: false, error: 'name must be a string' };
    }

    if (hasOwnerId && ownerId !== null && typeof ownerId !== 'string') {
        return { valid: false, error: 'ownerId must be a string or null' };
    }

    if (hasAssignedUserIds) {
        if (!Array.isArray(assignedUserIds)) {
            return { valid: false, error: 'assignedUserIds must be an array' };
        }
        if (assignedUserIds.some(id => typeof id !== 'string')) {
            return { valid: false, error: 'Every assignedUserIds entry must be a string' };
        }
    }

    return null;
};

const TYPE_VALIDATORS = {
    resize: validateResize,
    rotate: validateRotate,
    group: validateGroup,
    frame_meta: validateFrameMeta,
};

export const validatePropertyUpdate = (data) => {
    if (!data || typeof data !== 'object') {
        return { valid: false, error: 'Payload must be an object' };
    }

    if (!data.objectId || typeof data.objectId !== 'string') {
        return { valid: false, error: 'Missing or invalid objectId' };
    }

    if (!data.type || !ALLOWED_TYPES.includes(data.type)) {
        return { valid: false, error: `Invalid type: ${data.type}. Expected one of: ${ALLOWED_TYPES.join(', ')}` };
    }

    if (!data.properties || typeof data.properties !== 'object') {
        return { valid: false, error: 'Missing or invalid properties object' };
    }

    // Delegate to type-specific validator (if one exists)
    const typeValidator = TYPE_VALIDATORS[data.type];
    if (typeValidator) {
        const typeError = typeValidator(data.properties);
        if (typeError) {
            return typeError;
        }
    }

    return { valid: true };
};
