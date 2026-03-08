// validation.regression.test.js: Regression tests for validatePropertyUpdate().
//
// Key behaviours:
//  - Rejects non-object payloads
//  - Rejects missing/invalid objectId
//  - Rejects unknown or missing type
//  - Accepts all ALLOWED_TYPES: resize, rotate, move, group, frame_meta
//  - 'move' has no TYPE_VALIDATOR and passes with any properties (including empty {})
//  - All other types have specific property validators

import { validatePropertyUpdate } from '../../src/utils/validation.js';

describe('validatePropertyUpdate – payload structure', () => {
    it('rejects null payload', () => {
        const result = validatePropertyUpdate(null);
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/object/i);
    });

    it('rejects non-object payload (string)', () => {
        const result = validatePropertyUpdate('bad');
        expect(result.valid).toBe(false);
    });

    it('rejects non-object payload (number)', () => {
        const result = validatePropertyUpdate(42);
        expect(result.valid).toBe(false);
    });

    it('rejects missing objectId', () => {
        const result = validatePropertyUpdate({ type: 'move', properties: {} });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/objectId/i);
    });

    it('rejects numeric objectId', () => {
        const result = validatePropertyUpdate({ objectId: 123, type: 'move', properties: {} });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/objectId/i);
    });

    it('rejects empty-string objectId', () => {
        const result = validatePropertyUpdate({ objectId: '', type: 'move', properties: {} });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/objectId/i);
    });

    it('rejects missing type', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', properties: {} });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/type/i);
    });

    it('rejects unknown type', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'unknown', properties: {} });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/invalid type/i);
    });

    it('rejects empty type string', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: '', properties: {} });
        expect(result.valid).toBe(false);
    });
});

// ------------------------------------------------
// 'move' type is allowed but has no TYPE_VALIDATOR
// ------------------------------------------------
describe('validatePropertyUpdate – type: move', () => {
    it('accepts move with empty properties', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'move', properties: {} });
        expect(result.valid).toBe(true);
    });

    it('accepts move with x/y coordinates', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'move', properties: { x: 10, y: 20 } });
        expect(result.valid).toBe(true);
    });

    it('accepts move with arbitrary properties (no validator)', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'move', properties: { anything: 'goes' } });
        expect(result.valid).toBe(true);
    });
});

// -------------
// 'resize' type
// -------------
describe('validatePropertyUpdate – type: resize', () => {
    it('accepts resize with width', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'resize', properties: { width: 200 } });
        expect(result.valid).toBe(true);
    });

    it('accepts resize with height', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'resize', properties: { height: 150 } });
        expect(result.valid).toBe(true);
    });

    it('accepts resize with radius', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'resize', properties: { radius: 50 } });
        expect(result.valid).toBe(true);
    });

    it('accepts resize with width and height', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'resize', properties: { width: 100, height: 60 } });
        expect(result.valid).toBe(true);
    });

    it('rejects resize with no numeric dimension', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'resize', properties: {} });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/resize/i);
    });

    it('rejects resize with string width', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'resize', properties: { width: '100' } });
        expect(result.valid).toBe(false);
    });

    it('rejects resize with null dimensions', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'resize', properties: { width: null } });
        expect(result.valid).toBe(false);
    });
});

// -------------
// 'rotate' type
// -------------
describe('validatePropertyUpdate – type: rotate', () => {
    it('accepts rotate with numeric rotation', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'rotate', properties: { rotation: 90 } });
        expect(result.valid).toBe(true);
    });

    it('accepts rotate with 0 rotation', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'rotate', properties: { rotation: 0 } });
        expect(result.valid).toBe(true);
    });

    it('accepts rotate with negative rotation', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'rotate', properties: { rotation: -45 } });
        expect(result.valid).toBe(true);
    });

    it('accepts rotate with float rotation', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'rotate', properties: { rotation: 22.5 } });
        expect(result.valid).toBe(true);
    });

    it('rejects rotate with missing rotation', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'rotate', properties: {} });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/rotation/i);
    });

    it('rejects rotate with string rotation', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'rotate', properties: { rotation: '90deg' } });
        expect(result.valid).toBe(false);
    });
});

// ------------
// 'group' type
// ------------
describe('validatePropertyUpdate – type: group', () => {
    it('accepts group with parentId string', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'group', properties: { parentId: 'parent-uuid' } });
        expect(result.valid).toBe(true);
    });

    it('accepts group with parentId null (ungrouping)', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'group', properties: { parentId: null } });
        expect(result.valid).toBe(true);
    });

    it('accepts group with childrenIds array', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'group', properties: { childrenIds: ['a', 'b', 'c'] } });
        expect(result.valid).toBe(true);
    });

    it('accepts group with empty childrenIds array', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'group', properties: { childrenIds: [] } });
        expect(result.valid).toBe(true);
    });

    it('accepts group with both parentId and childrenIds', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'group', properties: { parentId: 'p1', childrenIds: ['c1'] } });
        expect(result.valid).toBe(true);
    });

    it('rejects group with no parentId or childrenIds', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'group', properties: {} });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/group/i);
    });

    it('rejects group with numeric parentId', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'group', properties: { parentId: 99 } });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/parentId/i);
    });

    it('rejects group with non-array childrenIds', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'group', properties: { childrenIds: 'not-an-array' } });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/childrenIds/i);
    });

    it('rejects group with childrenIds containing non-strings', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'group', properties: { childrenIds: ['valid', 123] } });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/childrenIds/i);
    });
});

// -----------------
// 'frame_meta' type
// -----------------
describe('validatePropertyUpdate – type: frame_meta', () => {
    it('accepts frame_meta with name', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'frame_meta', properties: { name: 'Frame 1' } });
        expect(result.valid).toBe(true);
    });

    it('accepts frame_meta with ownerId string', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'frame_meta', properties: { ownerId: 'user-uuid' } });
        expect(result.valid).toBe(true);
    });

    it('accepts frame_meta with ownerId null', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'frame_meta', properties: { ownerId: null } });
        expect(result.valid).toBe(true);
    });

    it('accepts frame_meta with assignedUserIds array', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'frame_meta', properties: { assignedUserIds: ['u1', 'u2'] } });
        expect(result.valid).toBe(true);
    });

    it('accepts frame_meta with all fields', () => {
        const result = validatePropertyUpdate({
            objectId: 'obj-1', type: 'frame_meta',
            properties: { name: 'Frame X', ownerId: 'user-1', assignedUserIds: ['a', 'b'] }
        });
        expect(result.valid).toBe(true);
    });

    it('rejects frame_meta with no recognized fields', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'frame_meta', properties: {} });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/frame meta/i);
    });

    it('rejects frame_meta with numeric name', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'frame_meta', properties: { name: 42 } });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/name/i);
    });

    it('rejects frame_meta with numeric ownerId', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'frame_meta', properties: { ownerId: 999 } });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/ownerId/i);
    });

    it('rejects frame_meta with non-array assignedUserIds', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'frame_meta', properties: { assignedUserIds: 'not-array' } });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/assignedUserIds/i);
    });

    it('rejects frame_meta with assignedUserIds containing non-strings', () => {
        const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'frame_meta', properties: { assignedUserIds: [1, 2, 3] } });
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/assignedUserIds/i);
    });
});
