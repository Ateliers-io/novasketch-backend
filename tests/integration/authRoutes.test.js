
import { jest } from '@jest/globals';
import request from 'supertest';
import { connect, closeDatabase, clearDatabase } from '../utils/db_handler.js';
import User from '../../src/models/User.js';

// Setup for Google Auth Library
const mockGetToken = jest.fn();
const mockVerifyIdToken = jest.fn();
const mockGetPayload = jest.fn();

const mockTicket = {
    getPayload: mockGetPayload
};

const mockOAuth2ClientInstance = {
    getToken: mockGetToken,
    verifyIdToken: mockVerifyIdToken
};

// Start Mock Registration
jest.unstable_mockModule('google-auth-library', () => ({
    OAuth2Client: jest.fn(() => mockOAuth2ClientInstance)
}));

// Dynamic Import App
const { default: app } = await import('../../src/app.js');

beforeAll(async () => await connect(), 120000);

afterEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
});

afterAll(async () => await closeDatabase());

describe('Auth Routes Integration Verification', () => {

    describe('Phase 1: Registration Verification', () => {
        it('should register a new user successfully and hash password', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Test User',
                    email: 'test@example.com',
                    password: 'Password123!'
                });

            expect(res.statusCode).toBe(201);
            expect(res.body).toHaveProperty('token');
            expect(res.body.user.email).toBe('test@example.com');

            // DB Verification
            const user = await User.findOne({ email: 'test@example.com' }).select('+password');
            expect(user).toBeTruthy();
            expect(user.password).not.toBe('Password123!');
            // Verify it looks like a hash (starts with $2b$ for bcrypt usually)
            expect(user.password).toMatch(/^\$2[ayb]\$.{56}$/);
        });

        it('should handle duplicate email registration', async () => {
            // Create initial user
            await User.create({
                displayName: 'Existing User',
                email: 'test@example.com',
                password: 'Password123!',
                authProvider: 'local'
            });

            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'New User',
                    email: 'test@example.com',
                    password: 'Password123!'
                });

            expect(res.statusCode).toBe(409);
            expect(res.body.error).toMatch(/already exists/i);
        });

        it('should validate password complexity', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Weak Password',
                    email: 'weak@example.com',
                    password: 'weak'
                });

            expect(res.statusCode).toBe(400); // Expect validation error
            expect(res.body.error).toBeTruthy();
        });
    });

    describe('Phase 2: Login Verification', () => {
        beforeEach(async () => {
            // Seed a user
            await User.create({
                displayName: 'Login User',
                email: 'login@example.com',
                password: 'Password123!',
                authProvider: 'local'
            });
        });

        it('should login with correct credentials', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'login@example.com',
                    password: 'Password123!'
                });

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('token');
            expect(res.body.user.email).toBe('login@example.com');
        });

        it('should fail login with incorrect password', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'login@example.com',
                    password: 'WrongPassword!'
                });

            expect(res.statusCode).toBe(401);
            expect(res.body.error).toBe("Invalid email or password");
        });

        it('should fail login with non-existent email', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: 'Password123!'
                });

            expect(res.statusCode).toBe(401);
            expect(res.body.error).toBe("Invalid email or password");
        });
    });

    describe('Phase 3: Session & Token Verification', () => {
        let token;

        beforeEach(async () => {
            await User.create({
                displayName: 'Session User',
                email: 'session@example.com',
                password: 'Password123!',
                authProvider: 'local'
            });
            // Login to get token
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'session@example.com', password: 'Password123!' });
            token = res.body.token;
        });

        it('should access protected route (/me) with valid token', async () => {
            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('email', 'session@example.com');
        });

        it('should deny access to protected route without token', async () => {
            const res = await request(app).get('/api/auth/me');
            expect(res.statusCode).toBe(401);
        });

        it('should deny access with invalid token', async () => {
            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', 'Bearer invalid_token');

            expect(res.statusCode).toBe(401);
        });
    });

    describe('Phase 4: Google OAuth Integration (Regression Test)', () => {
        it('should login/register with valid Google token', async () => {
            mockGetToken.mockResolvedValue({ tokens: { id_token: 'valid_google_token' } });
            mockVerifyIdToken.mockResolvedValue(mockTicket);
            mockGetPayload.mockReturnValue({
                sub: 'google_12345',
                email: 'google@example.com',
                name: 'Google User',
                picture: 'http://example.com/pic.jpg'
            });

            const res = await request(app)
                .post('/api/auth/google')
                .send({ code: 'valid_auth_code' });

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('token');
            expect(res.body.user.email).toBe('google@example.com');
            expect(res.body.user.authProvider).toBe('google');

            // Verify User Created
            const user = await User.findOne({ email: 'google@example.com' });
            expect(user).toBeTruthy();
            expect(user.googleId).toBe('google_12345');
        });

        it('should link Google account to existing email user', async () => {
            // Create user via email first
            await User.create({
                displayName: 'Link User',
                email: 'link@example.com',
                password: 'Password123!',
                authProvider: 'local'
            });

            // Login with Google with same email
            mockGetToken.mockResolvedValue({ tokens: { id_token: 'valid_google_token' } });
            mockVerifyIdToken.mockResolvedValue(mockTicket);
            mockGetPayload.mockReturnValue({
                sub: 'google_link_id',
                email: 'link@example.com',
                name: 'Link User',
                picture: 'http://example.com/pic.jpg'
            });

            const res = await request(app)
                .post('/api/auth/google')
                .send({ code: 'valid_auth_code' });

            expect(res.statusCode).toBe(200);
            expect(res.body.user.authProvider).toBe('google');

            // Verify DB update
            const user = await User.findOne({ email: 'link@example.com' });
            expect(user.googleId).toBe('google_link_id');
            expect(user.authProvider).toBe('google');
        });
    });
});
