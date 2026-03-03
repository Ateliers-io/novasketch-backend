/**
 * Unit Tests for redisCanvasService
 *
 * Tests cover: (All Redis calls are mocked)
 * - saveShape: HSET + EXPIRE with correct key/field/value
 * - getCanvasShapes: HGETALL with JSON parsing and fallback
 * - deleteShape: HDEL with correct key/field
 * - deleteCanvas: DEL with correct key
 * - Error handling when Redis is unavailable
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock ioredis before importing the service
const mockHset = jest.fn().mockResolvedValue(1);
const mockExpire = jest.fn().mockResolvedValue(1);
const mockHgetall = jest.fn().mockResolvedValue({});
const mockHdel = jest.fn().mockResolvedValue(1);
const mockDel = jest.fn().mockResolvedValue(1);

jest.unstable_mockModule('../../src/config/redis.js', () => ({
    redisClient: {
        hset: mockHset,
        expire: mockExpire,
        hgetall: mockHgetall,
        hdel: mockHdel,
        del: mockDel,
    },
    pubClient: {},
    subClient: {},
    closeRedisConnections: jest.fn(),
}));

// Dynamic import after mock is set up (required for ESM)
const { saveShape, getCanvasShapes, deleteShape, deleteCanvas } =
    await import('../../src/services/redisCanvasService.js');

describe('redisCanvasService', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // =========================================================================
    // saveShape
    // =========================================================================
    describe('saveShape', () => {

        it('should HSET the shape data as JSON string', async () => {
            const shapeData = { type: 'rect', x: 10, y: 20, width: 100, height: 50 };

            await saveShape('canvas-1', 'shape-abc', shapeData);

            expect(mockHset).toHaveBeenCalledWith(
                'canvas:canvas-1:shapes',
                'shape-abc',
                JSON.stringify(shapeData),
            );
        });

        it('should accept a pre-stringified value without double-encoding', async () => {
            const json = '{"type":"circle","radius":25}';

            await saveShape('canvas-1', 'shape-xyz', json);

            expect(mockHset).toHaveBeenCalledWith(
                'canvas:canvas-1:shapes',
                'shape-xyz',
                json,
            );
        });

        it('should refresh the 24h TTL on every write', async () => {
            await saveShape('canvas-1', 'shape-1', { x: 0 });

            expect(mockExpire).toHaveBeenCalledWith(
                'canvas:canvas-1:shapes',
                86400,
            );
        });

        it('should call HSET before EXPIRE', async () => {
            const callOrder = [];
            mockHset.mockImplementation(() => { callOrder.push('hset'); return Promise.resolve(1); });
            mockExpire.mockImplementation(() => { callOrder.push('expire'); return Promise.resolve(1); });

            await saveShape('canvas-2', 'shape-1', { x: 0 });

            expect(callOrder).toEqual(['hset', 'expire']);
        });
    });

    // =========================================================================
    // getCanvasShapes
    // =========================================================================
    describe('getCanvasShapes', () => {

        it('should return parsed shape objects from HGETALL', async () => {
            mockHgetall.mockResolvedValue({
                'shape-1': '{"type":"rect","x":10}',
                'shape-2': '{"type":"circle","radius":5}',
            });

            const result = await getCanvasShapes('canvas-1');

            expect(mockHgetall).toHaveBeenCalledWith('canvas:canvas-1:shapes');
            expect(result).toEqual({
                'shape-1': { type: 'rect', x: 10 },
                'shape-2': { type: 'circle', radius: 5 },
            });
        });

        it('should return empty object when canvas has no shapes', async () => {
            mockHgetall.mockResolvedValue({});

            const result = await getCanvasShapes('empty-canvas');

            expect(result).toEqual({});
        });

        it('should fall back to raw string for non-JSON values', async () => {
            mockHgetall.mockResolvedValue({
                'shape-1': 'not-valid-json',
            });

            const result = await getCanvasShapes('canvas-1');

            expect(result['shape-1']).toBe('not-valid-json');
        });
    });

    // =========================================================================
    // deleteShape
    // =========================================================================
    describe('deleteShape', () => {

        it('should HDEL the correct key and field', async () => {
            await deleteShape('canvas-1', 'shape-abc');

            expect(mockHdel).toHaveBeenCalledWith(
                'canvas:canvas-1:shapes',
                'shape-abc',
            );
        });

        it('should return 1 when shape existed', async () => {
            mockHdel.mockResolvedValue(1);
            const result = await deleteShape('canvas-1', 'shape-abc');
            expect(result).toBe(1);
        });

        it('should return 0 when shape did not exist', async () => {
            mockHdel.mockResolvedValue(0);
            const result = await deleteShape('canvas-1', 'nonexistent');
            expect(result).toBe(0);
        });
    });

    // =========================================================================
    // deleteCanvas
    // =========================================================================
    describe('deleteCanvas', () => {

        it('should DEL the entire hash key', async () => {
            await deleteCanvas('canvas-1');

            expect(mockDel).toHaveBeenCalledWith('canvas:canvas-1:shapes');
        });

        it('should return 0 when canvas key did not exist', async () => {
            mockDel.mockResolvedValue(0);
            const result = await deleteCanvas('nonexistent');
            expect(result).toBe(0);
        });
    });

    // =========================================================================
    // Error handling
    // =========================================================================
    describe('error handling', () => {

        it('should propagate Redis errors from saveShape', async () => {
            mockHset.mockRejectedValue(new Error('Redis connection refused'));

            await expect(saveShape('c1', 's1', {}))
                .rejects.toThrow('Redis connection refused');
        });

        it('should propagate Redis errors from getCanvasShapes', async () => {
            mockHgetall.mockRejectedValue(new Error('Redis timeout'));

            await expect(getCanvasShapes('c1'))
                .rejects.toThrow('Redis timeout');
        });

        it('should propagate Redis errors from deleteShape', async () => {
            mockHdel.mockRejectedValue(new Error('READONLY'));

            await expect(deleteShape('c1', 's1'))
                .rejects.toThrow('READONLY');
        });
    });
});
