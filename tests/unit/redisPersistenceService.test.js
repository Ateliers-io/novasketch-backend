/**
 * Unit Tests for redisPersistenceService
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies
const mockHgetall = jest.fn();

jest.unstable_mockModule('../../src/config/redis.js', () => ({
    redisClient: {
        hgetall: mockHgetall,
    },
}));

// Mock Models
const Room = {
    findByIdAndUpdate: jest.fn().mockResolvedValue({}),
};
const Canvas = {
    findByIdAndUpdate: jest.fn().mockResolvedValue({}),
};

jest.unstable_mockModule('../../src/models/Room.js', () => ({ default: Room }));
jest.unstable_mockModule('../../src/models/Canvas.js', () => ({ default: Canvas }));

// Dynamic import
const { markDirty, syncCanvasToMongo, startPeriodicSync, stopPeriodicSync } =
    await import('../../src/services/redisPersistenceService.js');

describe('redisPersistenceService', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        stopPeriodicSync();
    });

    describe('syncCanvasToMongo', () => {
        it('should sync parsed shapes to Room and update Canvas timestamp', async () => {
            mockHgetall.mockResolvedValue({
                'shape1': '{"type":"rect"}',
                'shape2': '{"type":"circle"}'
            });

            await syncCanvasToMongo('canvas-123');

            expect(mockHgetall).toHaveBeenCalledWith('canvas:canvas-123:shapes');
            expect(Room.findByIdAndUpdate).toHaveBeenCalledWith(
                'canvas-123',
                {
                    redisShapes: {
                        shape1: { type: 'rect' },
                        shape2: { type: 'circle' }
                    },
                    shapeCount: 2
                },
                { upsert: true }
            );
            expect(Canvas.findByIdAndUpdate).toHaveBeenCalledWith(
                'canvas-123',
                { lastEditedAt: expect.any(Date) }
            );
        });

        it('should do nothing if Redis hash is empty', async () => {
            mockHgetall.mockResolvedValue({});

            await syncCanvasToMongo('canvas-empty');

            expect(Room.findByIdAndUpdate).not.toHaveBeenCalled();
            expect(Canvas.findByIdAndUpdate).not.toHaveBeenCalled();
        });

        it('should handle raw string fallbacks gracefully', async () => {
            mockHgetall.mockResolvedValue({
                's1': 'not-json'
            });

            await syncCanvasToMongo('cvs-1');

            expect(Room.findByIdAndUpdate).toHaveBeenCalledWith(
                'cvs-1',
                { redisShapes: { s1: 'not-json' }, shapeCount: 1 },
                { upsert: true }
            );
        });

        it('should handle redis connection errors without throwing globally', async () => {
            mockHgetall.mockRejectedValue(new Error('Redis crash'));

            await expect(syncCanvasToMongo('c1')).resolves.not.toThrow();
        });
    });

    describe('Periodic Sync Logic', () => {
        it('should only sync dirty canvases when interval fires', async () => {
            mockHgetall.mockResolvedValue({ 's': '{}' });

            markDirty('c1');
            markDirty('c2');

            startPeriodicSync(1000);

            // Fast forward 1 second and await async tasks
            await jest.advanceTimersByTimeAsync(1000);

            expect(mockHgetall).toHaveBeenCalledTimes(2);
            expect(mockHgetall).toHaveBeenCalledWith('canvas:c1:shapes');
            expect(mockHgetall).toHaveBeenCalledWith('canvas:c2:shapes');

            jest.clearAllMocks();
            // Fast forward again - should not sync since they were cleared
            await jest.advanceTimersByTimeAsync(1000);

            expect(mockHgetall).not.toHaveBeenCalled();
        });
    });

});
