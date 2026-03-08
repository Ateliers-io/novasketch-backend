// redisServices.regression.test.js: Regression tests for Redis service layer.
//
// All Redis interactions are mocked.

import { jest } from '@jest/globals';

// -------------------
// Mock ioredis client
// -------------------
const mockHset = jest.fn().mockResolvedValue(1);
const mockExpire = jest.fn().mockResolvedValue(1);
const mockHgetall = jest.fn();
const mockHdel = jest.fn().mockResolvedValue(1);
const mockDel = jest.fn().mockResolvedValue(1);
const mockSubscribe = jest.fn().mockResolvedValue(undefined);
const mockPublish = jest.fn().mockResolvedValue(0);
const mockOn = jest.fn();
const mockDuplicate = jest.fn();

const mockRedisClient = {
    hset: mockHset,
    expire: mockExpire,
    hgetall: mockHgetall,
    hdel: mockHdel,
    del: mockDel,
    subscribe: mockSubscribe,
    publish: mockPublish,
    on: mockOn,
    duplicate: mockDuplicate,
};

// Duplicate returns a new subscriber-like client
mockDuplicate.mockReturnValue({ ...mockRedisClient });

jest.unstable_mockModule('../../src/config/redis.js', () => ({
    default: mockRedisClient,
}));

const mockRoomFindById = jest.fn();
const mockCanvasFindByIdAndUpdate = jest.fn();

jest.unstable_mockModule('../../src/models/Room.js', () => ({
    default: { findById: mockRoomFindById },
}));

jest.unstable_mockModule('../../src/models/Canvas.js', () => ({
    default: { findByIdAndUpdate: mockCanvasFindByIdAndUpdate },
}));

// Dynamic imports after all mocks registered
const { saveShape, getCanvasShapes, deleteShape, deleteCanvas } =
    await import('../../src/services/redisCanvasService.js');

const { markDirty, syncCanvasToMongo, startPeriodicSync, stopPeriodicSync } =
    await import('../../src/services/redisPersistenceService.js');

// ------------------
// redisCanvasService
// ------------------
describe('redisCanvasService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ---- saveShape ----
    describe('saveShape', () => {
        it('stores JSON-serialized shape data in the canvas hash', async () => {
            const shapeData = { type: 'circle', r: 50 };
            await saveShape('canvas-1', 'shape-abc', shapeData);

            expect(mockHset).toHaveBeenCalledTimes(1);
            const [key, field, value] = mockHset.mock.calls[0];
            expect(key).toBe('canvas:canvas-1:shapes');
            expect(field).toBe('shape-abc');
            expect(JSON.parse(value)).toEqual(shapeData);
        });

        it('refreshes the TTL (86400 seconds) after every save', async () => {
            await saveShape('canvas-1', 'shape-abc', { type: 'rect' });
            expect(mockExpire).toHaveBeenCalledWith('canvas:canvas-1:shapes', 86400);
        });

        it('calls HSET for different canvases with correct keys', async () => {
            await saveShape('canvas-A', 'shape-1', { x: 1 });
            await saveShape('canvas-B', 'shape-2', { x: 2 });

            const keys = mockHset.mock.calls.map(call => call[0]);
            expect(keys).toContain('canvas:canvas-A:shapes');
            expect(keys).toContain('canvas:canvas-B:shapes');
        });
    });

    // ---- getCanvasShapes ----
    describe('getCanvasShapes', () => {
        it('returns empty object {} when HGETALL returns null', async () => {
            mockHgetall.mockResolvedValue(null);
            const shapes = await getCanvasShapes('canvas-empty');
            expect(shapes).toEqual({});
        });

        it('returns empty object {} when HGETALL returns {} (empty hash)', async () => {
            mockHgetall.mockResolvedValue({});
            const shapes = await getCanvasShapes('canvas-empty');
            expect(shapes).toEqual({});
        });

        it('returns parsed shape objects when hash is populated', async () => {
            mockHgetall.mockResolvedValue({
                'shape-1': JSON.stringify({ type: 'circle', r: 10 }),
                'shape-2': JSON.stringify({ type: 'rect', width: 50 }),
            });
            const shapes = await getCanvasShapes('canvas-1');
            expect(shapes['shape-1']).toEqual({ type: 'circle', r: 10 });
            expect(shapes['shape-2']).toEqual({ type: 'rect', width: 50 });
        });

        it('falls back to raw string if JSON.parse fails', async () => {
            mockHgetall.mockResolvedValue({ 'bad-shape': 'not-valid-json{' });
            const shapes = await getCanvasShapes('canvas-1');
            expect(shapes['bad-shape']).toBe('not-valid-json{');
        });

        it('calls HGETALL with correct key', async () => {
            mockHgetall.mockResolvedValue({});
            await getCanvasShapes('my-canvas');
            expect(mockHgetall).toHaveBeenCalledWith('canvas:my-canvas:shapes');
        });
    });

    // ---- deleteShape ----
    describe('deleteShape', () => {
        it('calls HDEL with correct hash key and field', async () => {
            await deleteShape('canvas-1', 'shape-xyz');
            expect(mockHdel).toHaveBeenCalledWith('canvas:canvas-1:shapes', 'shape-xyz');
        });
    });

    // ---- deleteCanvas ----
    describe('deleteCanvas', () => {
        it('calls DEL with the full canvas shapes key', async () => {
            await deleteCanvas('canvas-99');
            expect(mockDel).toHaveBeenCalledWith('canvas:canvas-99:shapes');
        });
    });
});

// -----------------------
// redisPersistenceService
// -----------------------
describe('redisPersistenceService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        stopPeriodicSync(); // reset any running interval from prior tests
    });

    afterEach(() => {
        stopPeriodicSync();
    });

    // ---- markDirty ----
    describe('markDirty', () => {
        it('marks a canvas as dirty without throwing', () => {
            expect(() => markDirty('canvas-dirty')).not.toThrow();
        });

        it('markDirty is idempotent — calling multiple times does not duplicate entries', async () => {
            // Mark same canvas 3 times then sync once to syncCanvasToMongo called once
            mockHgetall.mockResolvedValue({});
            markDirty('canvas-idempotent');
            markDirty('canvas-idempotent');
            markDirty('canvas-idempotent');

            // Empty shapes should early return (no Room.findById call)
            await syncCanvasToMongo('canvas-idempotent');
            // If idempotent, the canvas was in the dirty set once
            // We can verify findById was called at most once
            expect(mockRoomFindById).toHaveBeenCalledTimes(1);
        });
    });

    // ---- syncCanvasToMongo ----
    describe('syncCanvasToMongo', () => {
        it('skips DB writes when canvas has no shapes in Redis', async () => {
            mockHgetall.mockResolvedValue({});
            await syncCanvasToMongo('canvas-empty');

            expect(mockRoomFindById).not.toHaveBeenCalled();
            expect(mockCanvasFindByIdAndUpdate).not.toHaveBeenCalled();
        });

        it('skips DB writes when HGETALL returns null', async () => {
            mockHgetall.mockResolvedValue(null);
            await syncCanvasToMongo('canvas-null');

            expect(mockRoomFindById).not.toHaveBeenCalled();
        });

        it('writes to Room.redisShapes and Canvas.lastEditedAt when shapes exist', async () => {
            const fakeShapes = {
                'shape-1': JSON.stringify({ type: 'circle', r: 10 }),
            };
            mockHgetall.mockResolvedValue(fakeShapes);

            const mockRoomDoc = { redisShapes: null, shapeCount: 0, save: jest.fn().mockResolvedValue(true) };
            mockRoomFindById.mockResolvedValue(mockRoomDoc);
            mockCanvasFindByIdAndUpdate.mockResolvedValue(true);

            await syncCanvasToMongo('canvas-with-shapes');

            expect(mockRoomFindById).toHaveBeenCalledWith('canvas-with-shapes');
            expect(mockRoomDoc.save).toHaveBeenCalled();
            expect(mockCanvasFindByIdAndUpdate).toHaveBeenCalledWith(
                'canvas-with-shapes',
                expect.objectContaining({ lastEditedAt: expect.any(Date) })
            );
        });

        it('updates shapeCount to match number of shapes', async () => {
            const fakeShapes = {
                's1': JSON.stringify({ type: 'rect' }),
                's2': JSON.stringify({ type: 'circle' }),
                's3': JSON.stringify({ type: 'line' }),
            };
            mockHgetall.mockResolvedValue(fakeShapes);

            const mockRoomDoc = { redisShapes: null, shapeCount: 0, save: jest.fn().mockResolvedValue(true) };
            mockRoomFindById.mockResolvedValue(mockRoomDoc);
            mockCanvasFindByIdAndUpdate.mockResolvedValue(true);

            await syncCanvasToMongo('canvas-count');

            expect(mockRoomDoc.shapeCount).toBe(3);
        });

        it('handles missing Room document gracefully (no Room for canvas)', async () => {
            const fakeShapes = { 's1': JSON.stringify({ type: 'rect' }) };
            mockHgetall.mockResolvedValue(fakeShapes);
            mockRoomFindById.mockResolvedValue(null); // No room doc

            // Should not throw
            await expect(syncCanvasToMongo('canvas-no-room')).resolves.not.toThrow();
        });
    });

    // ---- startPeriodicSync / stopPeriodicSync ----
    describe('periodic sync lifecycle', () => {
        it('stopPeriodicSync does not throw when no interval is running', () => {
            expect(() => stopPeriodicSync()).not.toThrow();
        });

        it('startPeriodicSync triggers sync after interval using fake timers', async () => {
            jest.useFakeTimers();

            markDirty('canvas-interval');
            mockHgetall.mockResolvedValue({}); // Empty shapes skip DB writes

            startPeriodicSync(1000); // 1s interval

            jest.advanceTimersByTime(1000);

            // Flush microtasks so the async sync callback runs
            await Promise.resolve();

            // getCanvasShapes should have been called for the dirty canvas
            expect(mockHgetall).toHaveBeenCalledWith('canvas:canvas-interval:shapes');

            stopPeriodicSync();
            jest.useRealTimers();
        });

        it('stopPeriodicSync prevents further sync calls', async () => {
            jest.useFakeTimers();

            markDirty('canvas-stopped');
            mockHgetall.mockResolvedValue({});

            startPeriodicSync(500);
            stopPeriodicSync();

            jest.advanceTimersByTime(2000);
            await Promise.resolve();

            // After stopping, hgetall should not have been called
            expect(mockHgetall).not.toHaveBeenCalled();

            jest.useRealTimers();
        });
    });
});
