/**
 * Unit Tests for authController.js
 * Tests the 'googleAuth' and 'getMe' functions
 * Refactored for ES Modules application using unstable_mockModule
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// 1. Define Mock Functions & Objects
const mockUser = {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
};

const mockJwt = {
    sign: jest.fn(),
    verify: jest.fn(),
};

const mockOAuth2ClientInstance = {
    getToken: jest.fn(),
    verifyIdToken: jest.fn(),
};

// Mock Constructor for OAuth2Client
const mockOAuth2ClientConstructor = jest.fn(() => mockOAuth2ClientInstance);

// 2. Register Mocks using unstable_mockModule (MUST be before imports)
jest.unstable_mockModule('../../src/models/User.js', () => ({
    default: mockUser,
}));

jest.unstable_mockModule('jsonwebtoken', () => ({
    default: mockJwt,
}));

jest.unstable_mockModule('google-auth-library', () => ({
    OAuth2Client: mockOAuth2ClientConstructor,
}));

// 3. Dynamic Import of Module Under Test
const { googleAuth, getMe } = await import('../../src/controllers/authController.js');

describe('authController', () => {
    let mockReq;
    let mockRes;
    let mockVerifiedTicket;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup Request/Response mocks
        mockReq = {
            body: {},
            userId: null
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        // Setup common ticket mock
        mockVerifiedTicket = {
            getPayload: jest.fn()
        };
    });

    describe('googleAuth', () => {
        // 3.1: No authorization code provided
        it('should return 400 if authorization code is missing', async () => {
            mockReq.body = {}; // No code

            await googleAuth(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ error: "Authorization code is required" });
        });

        // 3.2: New user creation (Happy Path)
        it('should create a new user and return token if user does not exist', async () => {
            mockReq.body = { code: 'valid_auth_code' };

            // Mock Google API responses
            mockOAuth2ClientInstance.getToken.mockResolvedValue({ tokens: { id_token: 'valid_id_token' } });
            mockOAuth2ClientInstance.verifyIdToken.mockResolvedValue(mockVerifiedTicket);
            mockVerifiedTicket.getPayload.mockReturnValue({
                sub: 'google_123',
                email: 'newuser@example.com',
                name: 'New User',
                picture: 'profile.jpg'
            });

            // Mock DB interactions
            mockUser.findOne.mockResolvedValue(null); // User not found
            mockUser.create.mockResolvedValue({
                _id: 'new_user_id',
                googleId: 'google_123',
                email: 'newuser@example.com',
                displayName: 'New User',
                avatar: 'profile.jpg'
            });

            // Mock JWT
            mockJwt.sign.mockReturnValue('mocked_jwt_token');

            await googleAuth(mockReq, mockRes);

            expect(mockUser.create).toHaveBeenCalledWith({
                googleId: 'google_123',
                email: 'newuser@example.com',
                displayName: 'New User',
                avatar: 'profile.jpg'
            });
            expect(mockJwt.sign).toHaveBeenCalled();
            expect(mockRes.json).toHaveBeenCalledWith({
                token: 'mocked_jwt_token',
                user: {
                    id: 'new_user_id',
                    email: 'newuser@example.com',
                    displayName: 'New User',
                    avatar: 'profile.jpg'
                }
            });
        });

        // 3.3: Existing user login (Happy Path)
        it('should return token for existing user without creating new one', async () => {
            mockReq.body = { code: 'valid_auth_code' };

            // Mock Google API
            mockOAuth2ClientInstance.getToken.mockResolvedValue({ tokens: { id_token: 'valid_id_token' } });
            mockOAuth2ClientInstance.verifyIdToken.mockResolvedValue(mockVerifiedTicket);
            mockVerifiedTicket.getPayload.mockReturnValue({
                sub: 'google_123',
                email: 'existing@example.com',
                name: 'Existing User',
                picture: 'profile.jpg'
            });

            // Mock DB: User exists
            const existingUser = {
                _id: 'existing_user_id',
                googleId: 'google_123',
                email: 'existing@example.com',
                displayName: 'Existing User',
                avatar: 'profile.jpg'
            };
            mockUser.findOne.mockResolvedValue(existingUser);

            // Mock JWT
            mockJwt.sign.mockReturnValue('mocked_jwt_token');

            await googleAuth(mockReq, mockRes);

            expect(mockUser.create).not.toHaveBeenCalled(); // Should NOT create user
            expect(mockRes.json).toHaveBeenCalledWith({
                token: 'mocked_jwt_token',
                user: {
                    id: 'existing_user_id',
                    email: 'existing@example.com',
                    displayName: 'Existing User',
                    avatar: 'profile.jpg'
                }
            });
        });

        // 3.4: Invalid Google token/code (Security)
        it('should return 401 if Google OAuth fails', async () => {
            mockReq.body = { code: 'invalid_code' };

            // Mock OAuth failure
            mockOAuth2ClientInstance.getToken.mockRejectedValue(new Error('Invalid grant'));

            await googleAuth(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: "Invalid token or code" });
        });
    });

    describe('getMe', () => {
        // 4.1: Happy Path - User found
        it('should return user data if user exists', async () => {
            mockReq.userId = 'valid_user_id';
            const mockUserUserQuery = {
                select: jest.fn().mockResolvedValue({
                    _id: 'valid_user_id',
                    email: 'test@example.com'
                })
            };
            mockUser.findById.mockReturnValue(mockUserUserQuery);

            await getMe(mockReq, mockRes);

            expect(mockUser.findById).toHaveBeenCalledWith('valid_user_id');
            expect(mockRes.json).toHaveBeenCalledWith({
                _id: 'valid_user_id',
                email: 'test@example.com'
            });
        });

        // 4.2: Edge Case - User not found in DB
        it('should return 404 if user not found', async () => {
            mockReq.userId = 'non_existent_id';
            const mockUserUserQuery = {
                select: jest.fn().mockResolvedValue(null)
            };
            mockUser.findById.mockReturnValue(mockUserUserQuery);

            await getMe(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({ error: "User not found" });
        });

        // 4.3: Server Error
        it('should return 500 on database error', async () => {
            mockReq.userId = 'valid_user_id';
            mockUser.findById.mockImplementation(() => {
                throw new Error('DB Error');
            });

            await getMe(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ error: "Server error" });
        });
    });
});
