// sessionLock.regression.test.js: Regression tests for checkSessionLock middleware.
//
// Behaviours under test:
//  - Canvas not locked -> calls next()
//  - Canvas locked     -> 403 { error: 'Canvas is locked' }
//  - Canvas not found  -> 404 { message: 'Canvas not found' }
//  - DB error          -> 500 { message: 'Server error checking canvas lock' }

import { jest } from '@jest/globals';

// --- mock Canvas model ---
const mockFindById = jest.fn();

jest.unstable_mockModule('../../src/models/Canvas.js', () => ({
    default: { findById: mockFindById },
}));

// Dynamic import after mocking
const { default: checkSessionLock } = await import('../../src/middleware/checkSessionLock.js');

// -------------------------------------------
// Helpers: minimal Express req/res/next stubs
// -------------------------------------------
function makeReq(canvasId = 'canvas-uuid-123') {
    return { params: { canvasId } };
}

function makeRes() {
    const res = {
        _status: null,
        _body: null,
        status(code) { this._status = code; return this; },
        json(body) { this._body = body; return this; },
    };
    return res;
}

describe('checkSessionLock middleware', () => {
    beforeEach(() => {
        mockFindById.mockReset();
    });

    it('calls next() when canvas exists and is not locked', async () => {
        mockFindById.mockResolvedValue({ is_locked: false });
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();

        await checkSessionLock(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res._status).toBeNull();
    });

    it('allows canvases where is_locked is undefined (falsy)', async () => {
        mockFindById.mockResolvedValue({ is_locked: undefined });
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();

        await checkSessionLock(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns 403 with correct body when canvas is locked', async () => {
        mockFindById.mockResolvedValue({ is_locked: true });
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();

        await checkSessionLock(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res._status).toBe(403);
        expect(res._body).toEqual({ error: 'Canvas is locked' });
    });

    it('returns 404 with correct body when canvas is not found', async () => {
        mockFindById.mockResolvedValue(null);
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();

        await checkSessionLock(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res._status).toBe(404);
        expect(res._body).toEqual({ message: 'Canvas not found' });
    });

    it('returns 500 when DB throws an error', async () => {
        mockFindById.mockRejectedValue(new Error('Mongo connection lost'));
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();

        await checkSessionLock(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res._status).toBe(500);
        expect(res._body).toEqual({ message: 'Server error checking canvas lock' });
    });

    it('passes the correct canvasId to findById', async () => {
        const canvasId = 'specific-canvas-id';
        mockFindById.mockResolvedValue({ is_locked: false });
        const req = makeReq(canvasId);
        const res = makeRes();
        const next = jest.fn();

        await checkSessionLock(req, res, next);

        expect(mockFindById).toHaveBeenCalledWith(canvasId);
    });

    it('does not call next() after a 403 response', async () => {
        mockFindById.mockResolvedValue({ is_locked: true });
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();

        await checkSessionLock(req, res, next);

        // next must not have been called at any point
        expect(next).toHaveBeenCalledTimes(0);
    });

    it('does not call next() after a 404 response', async () => {
        mockFindById.mockResolvedValue(null);
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();

        await checkSessionLock(req, res, next);

        expect(next).toHaveBeenCalledTimes(0);
    });
});
