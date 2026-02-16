/**
 * Unit Tests for OAuth Integration
 * Tests Google OAuth provider configuration, callback handling, and token validation
 * 
 * Backend-side coverage for:
 * - Google OAuth provider is correctly configured
 * - OAuth callback handling (code → token exchange)
 * - Token validation and user identity extraction
 * - Edge cases: missing ID token, missing user fields
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// 1. Define Mock Functions & Objects
const mockUser = {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
};

// Mock Constants
const DISPLAY_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9 _-]{1,29}$/;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_\-+=])[A-Za-z\d@$!%*?&#^()_\-+=]{8,64}$/;

const mockJwt = {
    sign: jest.fn(),
    verify: jest.fn(),
};

const mockOAuth2ClientInstance = {
    getToken: jest.fn(),
    verifyIdToken: jest.fn(),
};

const mockOAuth2ClientConstructor = jest.fn(() => mockOAuth2ClientInstance);

// 2. Register Mocks
jest.unstable_mockModule('../../src/models/User.js', () => ({
    default: mockUser,
    DISPLAY_NAME_REGEX,
    EMAIL_REGEX,
    PASSWORD_REGEX
}));

jest.unstable_mockModule('jsonwebtoken', () => ({
    default: mockJwt,
}));

jest.unstable_mockModule('google-auth-library', () => ({
    OAuth2Client: mockOAuth2ClientConstructor,
}));

// 3. Dynamic Import
const { googleAuth } = await import('../../src/controllers/authController.js');

// Capture constructor call args before clearAllMocks wipes them
const constructorCallArgs = mockOAuth2ClientConstructor.mock.calls[0];

describe('OAuth Integration', () => {
    let mockReq;
    let mockRes;

    beforeEach(() => {
        jest.clearAllMocks();
        mockReq = { body: {}, userId: null };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
    });

    // ================================================================
    // 1. Google OAuth Provider Configuration
    // ================================================================
    describe('Google OAuth Provider Configuration', () => {
        it('should initialize OAuth2Client with correct credentials', () => {
            // OAuth2Client constructor was called during module import with env vars
            expect(constructorCallArgs).toEqual([
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                'postmessage'
            ]);
        });

        it('should use "postmessage" as redirect URI for popup-based auth', () => {
            // Verify the third argument to OAuth2Client is 'postmessage'
            expect(constructorCallArgs[2]).toBe('postmessage');
        });
    });

    // ================================================================
    // 2. OAuth Redirect and Callback Handling (Code Exchange)
    // ================================================================
    describe('OAuth Callback Handling', () => {
        it('should exchange authorization code for tokens via getToken', async () => {
            mockReq.body = { code: 'auth_code_from_google' };

            const mockTicket = {
                getPayload: jest.fn().mockReturnValue({
                    sub: 'google_789', email: 'test@gmail.com',
                    name: 'Test', picture: 'pic.jpg'
                })
            };

            mockOAuth2ClientInstance.getToken.mockResolvedValue({
                tokens: { id_token: 'valid_id_token' }
            });
            mockOAuth2ClientInstance.verifyIdToken.mockResolvedValue(mockTicket);
            mockUser.findOne.mockResolvedValue(null);
            mockUser.create.mockResolvedValue({
                _id: 'id1', googleId: 'google_789',
                email: 'test@gmail.com', displayName: 'Test', avatar: 'pic.jpg'
            });
            mockJwt.sign.mockReturnValue('jwt_token');

            await googleAuth(mockReq, mockRes);

            // Verify getToken was called with the auth code
            expect(mockOAuth2ClientInstance.getToken).toHaveBeenCalledWith('auth_code_from_google');
        });

        it('should return 400 when Google returns no ID token in response', async () => {
            mockReq.body = { code: 'code_with_no_id_token' };

            // Google returns tokens but without id_token
            mockOAuth2ClientInstance.getToken.mockResolvedValue({
                tokens: { access_token: 'some_access_token' } // No id_token!
            });

            await googleAuth(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'No ID token found in response' });
        });

        it('should return 401 when getToken throws (invalid/expired code)', async () => {
            mockReq.body = { code: 'expired_auth_code' };

            mockOAuth2ClientInstance.getToken.mockRejectedValue(
                new Error('invalid_grant: Code has expired')
            );

            await googleAuth(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token or code' });
        });

        it('should return 401 when verifyIdToken fails (tampering)', async () => {
            mockReq.body = { code: 'valid_code' };

            mockOAuth2ClientInstance.getToken.mockResolvedValue({
                tokens: { id_token: 'tampered_token' }
            });
            mockOAuth2ClientInstance.verifyIdToken.mockRejectedValue(
                new Error('Token used too late or token signature invalid')
            );

            await googleAuth(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token or code' });
        });
    });

    // ================================================================
    // 3. Token Validation & User Identity Extraction
    // ================================================================
    describe('User Identity Extraction', () => {
        const setupGoogleMocks = (payloadOverrides = {}) => {
            const defaultPayload = {
                sub: 'google_456',
                email: 'user@gmail.com',
                name: 'Google User',
                picture: 'https://photo.url/avatar.jpg'
            };
            const payload = { ...defaultPayload, ...payloadOverrides };

            const mockTicket = {
                getPayload: jest.fn().mockReturnValue(payload)
            };

            mockOAuth2ClientInstance.getToken.mockResolvedValue({
                tokens: { id_token: 'valid_id_token' }
            });
            mockOAuth2ClientInstance.verifyIdToken.mockResolvedValue(mockTicket);
            mockJwt.sign.mockReturnValue('jwt_token');

            return payload;
        };

        it('should extract googleId, email, name, picture from Google token payload', async () => {
            mockReq.body = { code: 'valid_code' };
            setupGoogleMocks();

            mockUser.findOne.mockResolvedValue(null);
            mockUser.create.mockResolvedValue({
                _id: 'new_id',
                googleId: 'google_456',
                email: 'user@gmail.com',
                displayName: 'Google User',
                avatar: 'https://photo.url/avatar.jpg'
            });

            await googleAuth(mockReq, mockRes);

            expect(mockUser.create).toHaveBeenCalledWith({
                googleId: 'google_456',
                email: 'user@gmail.com',
                displayName: 'Google User',
                avatar: 'https://photo.url/avatar.jpg',
                authProvider: 'google'
            });
        });

        it('should handle user with no profile picture (empty avatar)', async () => {
            mockReq.body = { code: 'valid_code' };
            setupGoogleMocks({ picture: undefined });

            mockUser.findOne.mockResolvedValue(null);
            mockUser.create.mockResolvedValue({
                _id: 'new_id',
                googleId: 'google_456',
                email: 'user@gmail.com',
                displayName: 'Google User',
                avatar: ''
            });

            await googleAuth(mockReq, mockRes);

            // Should create user with empty string avatar, not undefined
            expect(mockUser.create).toHaveBeenCalledWith(
                expect.objectContaining({ avatar: '', authProvider: 'google' })
            );
        });

        it('should verify ID token with correct audience (client ID)', async () => {
            mockReq.body = { code: 'valid_code' };
            setupGoogleMocks();

            mockUser.findOne.mockResolvedValue({
                _id: 'existing_id', googleId: 'google_456',
                email: 'user@gmail.com', displayName: 'Google User',
                avatar: 'https://photo.url/avatar.jpg'
            });

            await googleAuth(mockReq, mockRes);

            // Verify that verifyIdToken was called with the correct audience
            expect(mockOAuth2ClientInstance.verifyIdToken).toHaveBeenCalledWith({
                idToken: 'valid_id_token',
                audience: process.env.GOOGLE_CLIENT_ID
            });
        });
    });

    // ================================================================
    // 4. JWT Issuance
    // ================================================================
    describe('JWT Issuance', () => {
        it('should sign JWT with userId and email in payload', async () => {
            mockReq.body = { code: 'valid_code' };

            const mockTicket = {
                getPayload: jest.fn().mockReturnValue({
                    sub: 'g123', email: 'jwt@test.com',
                    name: 'JWT User', picture: 'pic.jpg'
                })
            };

            mockOAuth2ClientInstance.getToken.mockResolvedValue({
                tokens: { id_token: 'id_token' }
            });
            mockOAuth2ClientInstance.verifyIdToken.mockResolvedValue(mockTicket);
            mockUser.findOne.mockResolvedValue({
                _id: 'user_id_for_jwt',
                googleId: 'g123', email: 'jwt@test.com',
                displayName: 'JWT User', avatar: 'pic.jpg'
            });
            mockJwt.sign.mockReturnValue('signed_jwt');

            await googleAuth(mockReq, mockRes);

            // Verify JWT is signed with correct payload and secret
            expect(mockJwt.sign).toHaveBeenCalledWith(
                { userId: 'user_id_for_jwt', email: 'jwt@test.com' },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );
        });

        it('should set JWT expiry to 7 days', async () => {
            mockReq.body = { code: 'valid_code' };

            const mockTicket = {
                getPayload: jest.fn().mockReturnValue({
                    sub: 'g1', email: 'e@t.com', name: 'N', picture: 'p'
                })
            };

            mockOAuth2ClientInstance.getToken.mockResolvedValue({
                tokens: { id_token: 'tok' }
            });
            mockOAuth2ClientInstance.verifyIdToken.mockResolvedValue(mockTicket);
            mockUser.findOne.mockResolvedValue({
                _id: 'uid', googleId: 'g1', email: 'e@t.com',
                displayName: 'N', avatar: 'p'
            });
            mockJwt.sign.mockReturnValue('jwt');

            await googleAuth(mockReq, mockRes);

            const signCall = mockJwt.sign.mock.calls[0];
            expect(signCall[2]).toEqual({ expiresIn: '7d' });
        });

        it('should return JWT token and user object in response', async () => {
            mockReq.body = { code: 'valid_code' };

            const mockTicket = {
                getPayload: jest.fn().mockReturnValue({
                    sub: 'g1', email: 'resp@test.com',
                    name: 'Response User', picture: 'avatar.png'
                })
            };

            mockOAuth2ClientInstance.getToken.mockResolvedValue({
                tokens: { id_token: 'tok' }
            });
            mockOAuth2ClientInstance.verifyIdToken.mockResolvedValue(mockTicket);
            mockUser.findOne.mockResolvedValue({
                _id: 'resp_id', googleId: 'g1', email: 'resp@test.com',
                displayName: 'Response User', avatar: 'avatar.png'
            });
            mockJwt.sign.mockReturnValue('final_jwt_token');

            await googleAuth(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalledWith({
                token: 'final_jwt_token',
                user: {
                    id: 'resp_id',
                    email: 'resp@test.com',
                    displayName: 'Response User',
                    avatar: 'avatar.png'
                }
            });
        });
    });
});
