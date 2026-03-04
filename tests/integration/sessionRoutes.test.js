// Canvas Routes Integration Tests
//
// Tests the /api/canvas endpoints (previously /api/session).
// Canvas creation requires auth, so we generate a JWT for tests.
// GET /:id does not require auth.

import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { connect, closeDatabase, clearDatabase } from '../utils/db_handler.js';
import Canvas from '../../src/models/Canvas.js';
import User from '../../src/models/User.js';

const { default: app } = await import('../../src/app.js');

beforeAll(async () => await connect(), 120000);

afterEach(async () => {
    await clearDatabase();
});

afterAll(async () => await closeDatabase());

describe('Canvas Routes Integration', () => {

    let testUser;
    let authToken;
    let canvasId;

    beforeEach(async () => {
        // Seed a user and generate a JWT
        testUser = await User.create({
            email: 'canvas-test@example.com',
            displayName: 'Canvas Tester',
            authProvider: 'local',
            password: 'TestPass123!',
        });

        authToken = jwt.sign(
            { userId: testUser._id, email: testUser.email },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Seed a canvas for tests that need one
        const canvas = await Canvas.create({
            _id: crypto.randomUUID(),
            name: 'Test Board',
            owner: testUser._id,
            participants: [{ userId: testUser._id, role: 'owner' }],
        });
        canvasId = canvas._id;

        // Mirror in user's canvases array
        testUser.canvases.push({ canvasId, role: 'owner' });
        await testUser.save();
    });

    describe('GET /api/canvas/:id', () => {
        it('should return canvas details with is_locked: false by default', async () => {
            const res = await request(app).get(`/api/canvas/${canvasId}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('is_locked', false);
            expect(res.body).toHaveProperty('canvasId', canvasId);
            expect(res.body).toHaveProperty('name', 'Test Board');
        });

        it('should return is_locked: true for a locked canvas', async () => {
            await Canvas.findByIdAndUpdate(canvasId, { is_locked: true });

            const res = await request(app).get(`/api/canvas/${canvasId}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('is_locked', true);
        });

        it('should return 404 for an unknown canvas id', async () => {
            const res = await request(app).get('/api/canvas/non-existent-id');

            expect(res.statusCode).toBe(404);
        });
    });

    describe('POST /api/canvas (create)', () => {
        it('should create a canvas when authenticated', async () => {
            const res = await request(app)
                .post('/api/canvas')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ name: 'New Board' });

            expect(res.statusCode).toBe(201);
            expect(res.body).toHaveProperty('canvasId');
            expect(res.body).toHaveProperty('name', 'New Board');
            expect(res.body).toHaveProperty('url');
        });

        it('should return 401 without auth token', async () => {
            const res = await request(app)
                .post('/api/canvas')
                .send({ name: 'No Auth Board' });

            expect(res.statusCode).toBe(401);
        });
    });

    describe('PATCH /api/canvas/:id/lock', () => {
        it('should lock a canvas with { is_locked: true }', async () => {
            const res = await request(app)
                .patch(`/api/canvas/${canvasId}/lock`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ is_locked: true });

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('is_locked', true);
            expect(res.body).toHaveProperty('canvasId', canvasId);
        });

        it('should unlock a canvas with { is_locked: false }', async () => {
            await Canvas.findByIdAndUpdate(canvasId, { is_locked: true });

            const res = await request(app)
                .patch(`/api/canvas/${canvasId}/lock`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ is_locked: false });

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('is_locked', false);
        });

        it('should return 400 if is_locked is not a boolean', async () => {
            const res = await request(app)
                .patch(`/api/canvas/${canvasId}/lock`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ is_locked: 'yes' });

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toMatch(/boolean/i);
        });

        it('should return 404 for an unknown canvas id', async () => {
            const res = await request(app)
                .patch('/api/canvas/non-existent-id/lock')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ is_locked: true });

            expect(res.statusCode).toBe(404);
        });
    });

    describe('GET /api/canvas/mine', () => {
        it('should return the user\'s canvases', async () => {
            const res = await request(app)
                .get('/api/canvas/mine')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('canvases');
            expect(res.body.canvases).toHaveLength(1);
            expect(res.body.canvases[0]).toHaveProperty('canvasId', canvasId);
            expect(res.body.canvases[0]).toHaveProperty('role', 'owner');
        });

        it('should return 401 without auth', async () => {
            const res = await request(app).get('/api/canvas/mine');

            expect(res.statusCode).toBe(401);
        });
    });
});
