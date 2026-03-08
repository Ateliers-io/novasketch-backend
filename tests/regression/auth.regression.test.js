/**
 * Regression Tests (Authentication)
 *
 * Pattern: Integration tests via supertest against a real MongoDB test DB.
 * Google OAuth library is mocked (ESM mock pattern matching authRoutes.test.js).
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import User from '../../src/models/User.js';
import { connect, closeDatabase, clearDatabase } from '../utils/db_handler.js';

// ── Google OAuth mock ──
const mockGetToken = jest.fn();
const mockVerifyIdToken = jest.fn();
const mockGetPayload = jest.fn();

const mockTicket = { getPayload: mockGetPayload };
const mockOAuth2ClientInstance = {
    getToken: mockGetToken,
    verifyIdToken: mockVerifyIdToken,
};

jest.unstable_mockModule('google-auth-library', () => ({
    OAuth2Client: jest.fn(() => mockOAuth2ClientInstance),
}));

const { default: app } = await import('../../src/app.js');

// ── DB lifecycle ──
beforeAll(async () => await connect(), 120000);
afterEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
});
afterAll(async () => await closeDatabase());

// ────────────────────────────────
// STEP 4 — Registration edge cases
// ────────────────────────────────
describe('Step 4 — Registration edge cases', () => {
    const VALID = {
        name: 'ValidUser',
        email: 'valid@regression.test',
        password: 'Password123!',
    };

    it('registers a new user and returns 201 + token', async () => {
        const res = await request(app).post('/api/auth/register').send(VALID);
        expect(res.statusCode).toBe(201);
        expect(res.body).toHaveProperty('token');
        expect(res.body.user.email).toBe(VALID.email);
    });

    it('returns 409 on duplicate email', async () => {
        await request(app).post('/api/auth/register').send(VALID);
        const res = await request(app).post('/api/auth/register').send(VALID);
        expect(res.statusCode).toBe(409);
        expect(res.body.field).toBe('email');
    });

    it('treats email as case-insensitive for duplicates', async () => {
        await request(app).post('/api/auth/register').send(VALID);
        const res = await request(app)
            .post('/api/auth/register')
            .send({ ...VALID, email: 'VALID@REGRESSION.TEST', name: 'OtherUser' });
        expect(res.statusCode).toBe(409);
    });

    it('returns 400 when password is too short', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ ...VALID, email: 'a@regression.test', password: 'Short1!' });
        expect(res.statusCode).toBe(400);
        expect(res.body.field).toBe('password');
    });

    it('returns 400 when password has no uppercase letter', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ ...VALID, email: 'b@regression.test', password: 'nouppercase1!' });
        expect(res.statusCode).toBe(400);
        expect(res.body.field).toBe('password');
    });

    it('returns 400 when password has no digit', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ ...VALID, email: 'c@regression.test', password: 'NoDigitHere!' });
        expect(res.statusCode).toBe(400);
        expect(res.body.field).toBe('password');
    });

    it('returns 400 when password has no special character', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ ...VALID, email: 'd@regression.test', password: 'NoSpecial123' });
        expect(res.statusCode).toBe(400);
        expect(res.body.field).toBe('password');
    });

    it('returns 400 for invalid email format', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ ...VALID, email: 'not-an-email' });
        expect(res.statusCode).toBe(400);
        expect(res.body.field).toBe('email');
    });

    it('returns 400 when name is too short (< 2 chars)', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ ...VALID, email: 'e@regression.test', name: 'X' });
        expect(res.statusCode).toBe(400);
        expect(res.body.field).toBe('name');
    });

    it('returns 400 when name exceeds 30 characters', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ ...VALID, email: 'f@regression.test', name: 'A'.repeat(31) });
        expect(res.statusCode).toBe(400);
    });

    it('returns 400 when required fields are missing', async () => {
        const res = await request(app).post('/api/auth/register').send({});
        expect(res.statusCode).toBe(400);
    });

    it('returns 400 when email is missing', async () => {
        const { email: _e, ...body } = VALID;
        const res = await request(app).post('/api/auth/register').send(body);
        expect(res.statusCode).toBe(400);
    });

    it('rejects NoSQL injection in email field gracefully', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ name: 'Hacker', email: { $gt: '' }, password: 'Password123!' });
        // Express coerces object to string or validator catches it, expect non-201
        expect(res.statusCode).not.toBe(201);
    });
});

// ─────────────────────────
// STEP 5 — Login edge cases
// ─────────────────────────
describe('Step 5 — Login edge cases', () => {
    const CREDS = { email: 'login@regression.test', password: 'Password123!' };

    beforeEach(async () => {
        await request(app)
            .post('/api/auth/register')
            .send({ name: 'LoginUser', ...CREDS });
    });

    it('returns 200 + token with correct credentials', async () => {
        const res = await request(app).post('/api/auth/login').send(CREDS);
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('token');
    });

    it('returns 401 for wrong password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ ...CREDS, password: 'WrongPass1!' });
        expect(res.statusCode).toBe(401);
        expect(res.body.error).toBe('Invalid email or password');
    });

    it('returns 401 for non-existent email (same message as wrong password)', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'nobody@regression.test', password: 'Password123!' });
        expect(res.statusCode).toBe(401);
        expect(res.body.error).toBe('Invalid email or password');
    });

    it('returns 401 when Google-only account tries password login', async () => {
        // Create a google-only user with no password field
        await User.create({
            googleId: 'g-only-id',
            email: 'google-only@regression.test',
            displayName: 'Google Only',
            authProvider: 'google',
        });
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'google-only@regression.test', password: 'Password123!' });
        expect(res.statusCode).toBe(401);
        expect(res.body.error).toMatch(/google/i);
    });

    it('returns 400 when body is empty', async () => {
        const res = await request(app).post('/api/auth/login').send({});
        expect(res.statusCode).toBe(400);
    });

    it('returns 400 for invalid email format on login', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'not-an-email', password: 'Password123!' });
        expect(res.statusCode).toBe(400);
    });
});

// ────────────────────────────────
// STEP 6 — Google OAuth regression
// ────────────────────────────────
describe('Step 6 — Google OAuth regression', () => {
    const setupGoogleMock = ({
        googleId = 'google-test-id',
        email = 'google@regression.test',
        name = 'Google User',
        picture = 'https://pic.example.com/photo.jpg',
    } = {}) => {
        mockGetToken.mockResolvedValue({ tokens: { id_token: 'mock-id-token' } });
        mockVerifyIdToken.mockResolvedValue(mockTicket);
        mockGetPayload.mockReturnValue({ sub: googleId, email, name, picture });
    };

    it('creates a new user and returns 200 + token for valid code', async () => {
        setupGoogleMock();
        const res = await request(app)
            .post('/api/auth/google')
            .send({ code: 'valid-code' });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.user.authProvider).toBe('google');

        const user = await User.findOne({ email: 'google@regression.test' });
        expect(user).toBeTruthy();
        expect(user.googleId).toBe('google-test-id');
    });

    it('returns 400 when auth code is missing', async () => {
        const res = await request(app).post('/api/auth/google').send({});
        expect(res.statusCode).toBe(400);
    });

    it('returns 401 when Google token exchange fails', async () => {
        mockGetToken.mockRejectedValue(new Error('invalid_grant'));
        const res = await request(app)
            .post('/api/auth/google')
            .send({ code: 'bad-code' });
        expect(res.statusCode).toBe(401);
    });

    it('updates lastLoginAt and keeps same userId for returning Google user', async () => {
        setupGoogleMock();
        const firstRes = await request(app).post('/api/auth/google').send({ code: 'code-1' });
        const userId = firstRes.body.user.id;

        const before = await User.findById(userId);
        await new Promise((r) => setTimeout(r, 10));

        setupGoogleMock();
        const secondRes = await request(app).post('/api/auth/google').send({ code: 'code-2' });
        expect(secondRes.body.user.id).toBe(userId);

        const after = await User.findById(userId);
        expect(new Date(after.lastLoginAt) >= new Date(before.lastLoginAt)).toBe(true);
    });

    it('links Google account to existing email-based user', async () => {
        await User.create({
            email: 'link@regression.test',
            displayName: 'LinkUser',
            password: 'Password123!',
            authProvider: 'local',
        });

        setupGoogleMock({ email: 'link@regression.test', googleId: 'link-google-id' });
        const res = await request(app).post('/api/auth/google').send({ code: 'link-code' });
        expect(res.statusCode).toBe(200);
        expect(res.body.user.authProvider).toBe('google');

        const user = await User.findOne({ email: 'link@regression.test' });
        expect(user.googleId).toBe('link-google-id');
    });

    it('sanitizes display name with accented characters', async () => {
        setupGoogleMock({ name: 'José García', email: 'jose@regression.test' });
        const res = await request(app).post('/api/auth/google').send({ code: 'accent-code' });
        expect(res.statusCode).toBe(200);
        // Should be sanitized (accents stripped)
        expect(res.body.user.displayName).not.toMatch(/[áéíóúü]/i);
    });

    it('sanitizes display name containing dots', async () => {
        setupGoogleMock({ name: 'John.Smith', email: 'john@regression.test' });
        const res = await request(app).post('/api/auth/google').send({ code: 'dot-code' });
        expect(res.statusCode).toBe(200);
        expect(res.body.user.displayName).not.toContain('.');
    });
});

// ──────────────────────────────────────────
// STEP 7 — JWT / GET /api/auth/me regression
// ──────────────────────────────────────────
describe('Step 7 — JWT / getMe regression', () => {
    let token;

    beforeEach(async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ name: 'MeUser', email: 'me@regression.test', password: 'Password123!' });
        token = res.body.token;
    });

    it('returns 200 + profile with a valid token', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.email).toBe('me@regression.test');
    });

    it('returns 401 without Authorization header', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.statusCode).toBe(401);
    });

    it('returns 401 with a malformed token', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', 'Bearer this-is-not-a-jwt');
        expect(res.statusCode).toBe(401);
    });

    it('returns 401 with a tampered payload', async () => {
        // Decode header.payload.sig, tamper payload, rejoin
        const parts = token.split('.');
        const tamperedPayload = Buffer.from(
            JSON.stringify({ userId: 'fake-id', email: 'hacker@evil.com' })
        ).toString('base64url');
        const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${tampered}`);
        expect(res.statusCode).toBe(401);
    });
});
