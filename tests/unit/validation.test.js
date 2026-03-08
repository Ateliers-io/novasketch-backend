import { validatePropertyUpdate } from '../../src/utils/validation.js';

describe('Validation Utility Tests - validatePropertyUpdate', () => {
    describe('General Payload Validation', () => {
        it('should return error if payload is not an object', () => {
            const result = validatePropertyUpdate('string payload');
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/Payload must be an object/);
        });

        it('should return error if payload is missing or invalid objectId', () => {
            const result = validatePropertyUpdate({ type: 'resize', properties: {} });
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/Missing or invalid objectId/);
        });

        it('should return error if type is missing or invalid', () => {
            const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'invalid_type', properties: {} });
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/Invalid type: invalid_type/);
        });

        it('should return error if properties object is missing', () => {
            const result = validatePropertyUpdate({ objectId: 'obj-1', type: 'resize' });
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/Missing or invalid properties object/);
        });
    });

    describe('Resize Validation', () => {
        it('should validate correctly with valid width/height', () => {
            const result = validatePropertyUpdate({
                objectId: 'obj-1',
                type: 'resize',
                properties: { width: 100, height: 200 }
            });
            expect(result.valid).toBe(true);
        });

        it('should return error if width/height/radius are missing or non-numeric', () => {
            const result = validatePropertyUpdate({
                objectId: 'obj-1',
                type: 'resize',
                properties: { width: '100px' } // Not a number
            });
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/Resize must include numeric width, height, or radius/);
        });
    });

    describe('Rotate Validation', () => {
        it('should validate correctly with valid rotation', () => {
            const result = validatePropertyUpdate({
                objectId: 'obj-1',
                type: 'rotate',
                properties: { rotation: 90 }
            });
            expect(result.valid).toBe(true);
        });

        it('should return error if rotation is non-numeric', () => {
            const result = validatePropertyUpdate({
                objectId: 'obj-1',
                type: 'rotate',
                properties: { rotation: '90deg' }
            });
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/Rotate must include numeric rotation/);
        });
    });

    describe('Group Validation', () => {
        it('should validate correctly with valid parentId and childrenIds', () => {
            const result = validatePropertyUpdate({
                objectId: 'obj-1',
                type: 'group',
                properties: { parentId: 'parent-1', childrenIds: ['child-1', 'child-2'] }
            });
            expect(result.valid).toBe(true);
        });

        it('should return error if neither parentId nor childrenIds is provided', () => {
            const result = validatePropertyUpdate({
                objectId: 'obj-1',
                type: 'group',
                properties: {}
            });
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/Group must include parentId or childrenIds/);
        });

        it('should return error if parentId is not a string or null', () => {
            const result = validatePropertyUpdate({
                objectId: 'obj-1',
                type: 'group',
                properties: { parentId: 123 }
            });
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/parentId must be a string or null/);
        });

        it('should return error if childrenIds is not an array of strings', () => {
            const result = validatePropertyUpdate({
                objectId: 'obj-1',
                type: 'group',
                properties: { childrenIds: ['child-1', 123] }
            });
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/Every childrenIds entry must be a string/);
        });
    });

    describe('Frame Meta Validation', () => {
        it('should validate correctly with valid string name', () => {
            const result = validatePropertyUpdate({
                objectId: 'obj-1',
                type: 'frame_meta',
                properties: { name: 'My Frame' }
            });
            expect(result.valid).toBe(true);
        });

        it('should return error if no valid properties provided', () => {
            const result = validatePropertyUpdate({
                objectId: 'obj-1',
                type: 'frame_meta',
                properties: {}
            });
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/Frame meta update must include name, ownerId, or assignedUserIds/);
        });

        it('should return error if ownerId is invalid type', () => {
            const result = validatePropertyUpdate({
                objectId: 'obj-1',
                type: 'frame_meta',
                properties: { ownerId: 123 }
            });
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/ownerId must be a string or null/);
        });

        it('should return error if assignedUserIds is not array of strings', () => {
            const result = validatePropertyUpdate({
                objectId: 'obj-1',
                type: 'frame_meta',
                properties: { assignedUserIds: 'user1, user2' } // String instead of array
            });
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/assignedUserIds must be an array/);
        });
    });
});
