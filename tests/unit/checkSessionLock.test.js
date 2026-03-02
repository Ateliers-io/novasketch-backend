/**
 * Unit Tests for checkSessionLock middleware
 *
 * Tests Coverage:
 * - Calls next() when canvas exists and is unlocked
 * - Returns 403 when canvas is locked
 * - Returns 404 when canvas is not found
 * - Returns 500 on unexpected DB error
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock Canvas model before importing the middleware
const mockFindById = jest.fn();

jest.unstable_mockModule('../../src/models/Canvas.js', () => ({
    default: { findById: mockFindById }
}));

const { default: checkSessionLock } = await import('../../src/middleware/checkSessionLock.js');

// Helper factories
const mockRequest = (id) => ({ params: { id } });

const mockResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

describe('checkSessionLock middleware', () => {
    let next;

    beforeEach(() => {
        jest.clearAllMocks();
        next = jest.fn();
    });

    it('should call next() when canvas exists and is unlocked', async () => {
        mockFindById.mockResolvedValue({ _id: 'room-1', is_locked: false });

        const req = mockRequest('room-1');
        const res = mockResponse();

        await checkSessionLock(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 403 when canvas is locked', async () => {
        mockFindById.mockResolvedValue({ _id: 'room-1', is_locked: true });

        const req = mockRequest('room-1');
        const res = mockResponse();

        await checkSessionLock(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: 'Canvas is locked' });
        expect(next).not.toHaveBeenCalled();
    });

    it('should return 404 when canvas is not found', async () => {
        mockFindById.mockResolvedValue(null);

        const req = mockRequest('nonexistent');
        const res = mockResponse();

        await checkSessionLock(req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ message: 'Canvas not found' });
        expect(next).not.toHaveBeenCalled();
    });

    it('should return 500 on unexpected DB error', async () => {
        mockFindById.mockRejectedValue(new Error('DB connection failed'));

        const req = mockRequest('room-1');
        const res = mockResponse();

        await checkSessionLock(req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(next).not.toHaveBeenCalled();
    });
});

