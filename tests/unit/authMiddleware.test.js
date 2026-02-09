/**
 * Unit Tests for authMiddleware.js
 * Tests the 'protect' JWT verification middleware
 * 
 * Test Coverage:
 * - 2.1: Valid JWT token (Happy Path)
 * - 2.2: No Authorization header
 * - 2.3: Authorization header without "Bearer " prefix
 * - 2.4: Expired JWT token
 * - 2.5: Malformed/tampered JWT token
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { protect } from '../../src/middleware/authMiddleware.js';

// Mock request, response, and next function factories
const mockRequest = (authHeader) => ({
    headers: {
        authorization: authHeader
    }
});

const mockResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

const mockNext = jest.fn();

describe('authMiddleware - protect()', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ============================================
    // 2.1: Valid JWT token provided (Happy Path)
    // ============================================
    describe('Happy Path', () => {
        it('should call next() and set req.userId when valid token is provided', () => {
            // Arrange: Create a valid JWT token
            const userId = '507f1f77bcf86cd799439011';
            const validToken = jwt.sign(
                { userId, email: 'test@example.com' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );
            const req = mockRequest(`Bearer ${validToken}`);
            const res = mockResponse();

            // Act
            protect(req, res, mockNext);

            // Assert
            expect(mockNext).toHaveBeenCalledTimes(1);
            expect(req.userId).toBe(userId);
            expect(res.status).not.toHaveBeenCalled();
            expect(res.json).not.toHaveBeenCalled();
        });
    });

    // ============================================
    // 2.2 & 2.3: Edge Cases - Missing/Invalid Header
    // ============================================
    describe('Edge Cases - Authorization Header', () => {
        it('should return 401 when no Authorization header is provided', () => {
            // Arrange
            const req = { headers: {} }; // No authorization header
            const res = mockResponse();

            // Act
            protect(req, res, mockNext);

            // Assert
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 when Authorization header is undefined', () => {
            // Arrange
            const req = mockRequest(undefined);
            const res = mockResponse();

            // Act
            protect(req, res, mockNext);

            // Assert
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 when Authorization header does not start with "Bearer "', () => {
            // Arrange: Token without "Bearer " prefix
            const req = mockRequest('Basic sometoken123');
            const res = mockResponse();

            // Act
            protect(req, res, mockNext);

            // Assert
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    // ============================================
    // 2.4 & 2.5: Security - Invalid Tokens
    // ============================================
    describe('Security - Invalid Tokens', () => {
        it('should return 401 when JWT token is expired', () => {
            // Arrange: Create an expired token (negative expiry)
            const expiredToken = jwt.sign(
                { userId: '507f1f77bcf86cd799439011', email: 'test@example.com' },
                process.env.JWT_SECRET,
                { expiresIn: '-1s' } // Already expired
            );
            const req = mockRequest(`Bearer ${expiredToken}`);
            const res = mockResponse();

            // Act
            protect(req, res, mockNext);

            // Assert
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 when JWT token is malformed/tampered', () => {
            // Arrange: Completely malformed token
            const req = mockRequest('Bearer this.is.not.a.valid.jwt');
            const res = mockResponse();

            // Act
            protect(req, res, mockNext);

            // Assert
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 when JWT token is signed with wrong secret', () => {
            // Arrange: Token signed with different secret
            const wrongSecretToken = jwt.sign(
                { userId: '507f1f77bcf86cd799439011', email: 'test@example.com' },
                'wrong-secret-key',
                { expiresIn: '1h' }
            );
            const req = mockRequest(`Bearer ${wrongSecretToken}`);
            const res = mockResponse();

            // Act
            protect(req, res, mockNext);

            // Assert
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
            expect(mockNext).not.toHaveBeenCalled();
        });
    });
});
