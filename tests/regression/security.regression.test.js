// security.regression.test.js: Regression tests for cross-user access control and injection safety.

import request from 'supertest';
import crypto from 'node:crypto';
import app from '../../src/app.js';
import { connect, clearDatabase, closeDatabase } from '../utils/db_handler.js';
import { registerAndLogin, getAuthHeaders } from '../utils/auth_helper.js';

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

// -------------------------
// Cross-user access control
// -------------------------
describe('Cross-user access control', () => {
    let userA, userB, canvasId;

    beforeEach(async () => {
        // Register two distinct users
        userA = await registerAndLogin(app);
        userB = await registerAndLogin(app);

        // User A creates a canvas
        const res = await request(app)
            .post('/api/canvas')
            .set(getAuthHeaders(userA.token))
            .send({ name: 'User A Canvas' });

        expect(res.statusCode).toBe(201);
        canvasId = res.body.canvas._id;
    });

    it('User B cannot rename User A\'s canvas (403)', async () => {
        const res = await request(app)
            .patch(`/api/canvas/${canvasId}/rename`)
            .set(getAuthHeaders(userB.token))
            .send({ name: 'Stolen Name' });

        expect(res.statusCode).toBe(403);
    });

    it('User B cannot lock User A\'s canvas (404 from combined owner+id query)', async () => {
        // lockCanvas uses findOneAndUpdate({_id, owner}) to find the canvas. non-owner gets 404
        const res = await request(app)
            .patch(`/api/canvas/${canvasId}/lock`)
            .set(getAuthHeaders(userB.token));

        // The combined findOneAndUpdate({_id, owner}) returns 404 for non-owners
        expect(res.statusCode).toBe(404);
    });

    it('User B cannot delete User A\'s canvas (403)', async () => {
        const res = await request(app)
            .delete(`/api/canvas/${canvasId}`)
            .set(getAuthHeaders(userB.token));

        expect(res.statusCode).toBe(403);
    });

    it('User B cannot add participants to User A\'s canvas (403)', async () => {
        const res = await request(app)
            .post(`/api/canvas/${canvasId}/participants`)
            .set(getAuthHeaders(userB.token))
            .send({ userId: userB.userId });

        expect(res.statusCode).toBe(403);
    });

    it('User A can still rename their own canvas after User B\'s attempt', async () => {
        // User B's unauthorized rename attempt
        await request(app)
            .patch(`/api/canvas/${canvasId}/rename`)
            .set(getAuthHeaders(userB.token))
            .send({ name: 'Stolen Name' });

        // User A's rename succeeds
        const res = await request(app)
            .patch(`/api/canvas/${canvasId}/rename`)
            .set(getAuthHeaders(userA.token))
            .send({ name: 'Legit New Name' });

        expect(res.statusCode).toBe(200);
        expect(res.body.canvas.name).toBe('Legit New Name');
    });

    it('User B can join User A\'s canvas (as editor)', async () => {
        const res = await request(app)
            .post(`/api/canvas/${canvasId}/join`)
            .set(getAuthHeaders(userB.token));

        expect(res.statusCode).toBe(200);
    });

    it('Unauthenticated user gets 401 on all canvas endpoints', async () => {
        const endpoints = [
            () => request(app).patch(`/api/canvas/${canvasId}/rename`).send({ name: 'x' }),
            () => request(app).patch(`/api/canvas/${canvasId}/lock`),
            () => request(app).delete(`/api/canvas/${canvasId}`),
            () => request(app).post(`/api/canvas/${canvasId}/join`),
            () => request(app).post(`/api/canvas/${canvasId}/participants`).send({ userId: 'x' }),
        ];

        for (const makeReq of endpoints) {
            const res = await makeReq();
            expect(res.statusCode).toBe(401);
        }
    });

    it('Forged/invalid JWT is rejected with 401', async () => {
        const fakeToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmYWtlIn0.INVALID_SIGNATURE';
        const res = await request(app)
            .patch(`/api/canvas/${canvasId}/rename`)
            .set('Authorization', fakeToken)
            .send({ name: 'Hacked' });

        expect(res.statusCode).toBe(401);
    });
});

// ---------------------------------------------------------------------------
// Step 32: Rate limiting
// NOTE: Rate limiting is disabled in NODE_ENV=test via skip: () => process.env.NODE_ENV === 'test'
// These tests document the expected behavior but cannot be enforced via supertest in test env.
// ---------------------------------------------------------------------------
describe('Rate limiting (documentation)', () => {
    it.skip('auth endpoints are rate-limited (disabled in test env — use staging to validate)', () => {
        // Rate limiter (express-rate-limit / rate-limiter-flexible) is configured with:
        // skip: () => process.env.NODE_ENV === 'test'
        // To test rate limiting: deploy to staging and send >20 requests in a short window.
        // Expected: HTTP 429 Too Many Requests after threshold.
    });
});

// -------------------------------------
// Injection safety and input validation
// -------------------------------------
describe('Injection safety — login', () => {
    it('rejects NoSQL-style operator injection in email field', async () => {
        // { $gt: '' } is a MongoDB operator that should fail validation, not query all users
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: { $gt: '' }, password: 'anything' });

        // Should return 400 (validation error) or 401 (bad credentials), never 200
        expect([400, 401]).toContain(res.statusCode);
    });

    it('rejects object injection in password field', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'test@example.com', password: { $ne: null } });

        expect([400, 401]).toContain(res.statusCode);
    });

    it('returns 401 (not 500) for valid email format but wrong credentials', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'nonexistent@example.com', password: 'WrongPass@1' });

        expect(res.statusCode).toBe(401);
    });
});

describe('Injection safety - canvas name', () => {
    let token;

    beforeEach(async () => {
        const user = await registerAndLogin(app);
        token = user.token;
    });

    it('stores XSS payload in canvas name without executing it (returned as plain string)', async () => {
        const xssName = 'My <script>alert(1)</script>';
        const res = await request(app)
            .post('/api/canvas')
            .set(getAuthHeaders(token))
            .send({ name: xssName });

        // The API should either store it as-is (server trusts client rendering to escape)
        // or reject it. It must NOT return a 500 error.
        expect(res.statusCode).not.toBe(500);

        if (res.statusCode === 201) {
            // If accepted, the raw string is returned and the client is responsible for escaping
            expect(typeof res.body.canvas.name).toBe('string');
        }
    });

    it('rejects canvas names exceeding 100 characters', async () => {
        const longName = 'A'.repeat(101);
        const res = await request(app)
            .post('/api/canvas')
            .set(getAuthHeaders(token))
            .send({ name: longName });

        // Mongoose maxlength: 100 enforced by schema, should fail with 4xx or 500
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('accepts rename with XSS payload without crashing the server', async () => {
        // Create canvas first
        const createRes = await request(app)
            .post('/api/canvas')
            .set(getAuthHeaders(token));
        expect(createRes.statusCode).toBe(201);
        const canvasId = createRes.body.canvas._id;

        // Attempt to rename with XSS payload
        const xssPayload = '<img src=x onerror=alert(1)>';
        const res = await request(app)
            .patch(`/api/canvas/${canvasId}/rename`)
            .set(getAuthHeaders(token))
            .send({ name: xssPayload });

        // Server should not return 500
        expect(res.statusCode).not.toBe(500);
    });

    it('rejects rename with name exceeding 100 characters', async () => {
        const createRes = await request(app)
            .post('/api/canvas')
            .set(getAuthHeaders(token));
        const canvasId = createRes.body.canvas._id;

        const longName = 'B'.repeat(101);
        const res = await request(app)
            .patch(`/api/canvas/${canvasId}/rename`)
            .set(getAuthHeaders(token))
            .send({ name: longName });

        expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
});

describe('Authentication edge cases', () => {
    it('missing Authorization header returns 401', async () => {
        const res = await request(app).post('/api/canvas').send({ name: 'Test' });
        expect(res.statusCode).toBe(401);
    });

    it('empty Bearer token returns 401', async () => {
        const res = await request(app)
            .post('/api/canvas')
            .set('Authorization', 'Bearer ')
            .send({ name: 'Test' });
        expect(res.statusCode).toBe(401);
    });

    it('malformed Authorization header (no Bearer prefix) returns 401', async () => {
        const res = await request(app)
            .post('/api/canvas')
            .set('Authorization', 'Basic dXNlcjpwYXNz')
            .send({ name: 'Test' });
        expect(res.statusCode).toBe(401);
    });

    it('expired/tampered JWT returns 401', async () => {
        // Manually crafted expired JWT (signing secret mismatch)
        const tamperedJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxMjMiLCJleHAiOjF9.tampered';
        const res = await request(app)
            .post('/api/canvas')
            .set('Authorization', `Bearer ${tamperedJwt}`)
            .send({ name: 'Test' });
        expect(res.statusCode).toBe(401);
    });
});
