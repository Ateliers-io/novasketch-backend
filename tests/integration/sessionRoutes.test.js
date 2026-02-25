import { jest } from '@jest/globals';
import request from 'supertest';
import { connect, closeDatabase, clearDatabase } from '../utils/db_handler.js';
import Session from '../../src/models/Session.js';

const { default: app } = await import('../../src/app.js');

beforeAll(async () => await connect(), 120000);

afterEach(async () => {
    await clearDatabase();
});

afterAll(async () => await closeDatabase());

describe('Session Routes Integration', () => {

    let sessionId;

    beforeEach(async () => {
        // Seed a session for running tests
        const session = await Session.create({
            _id: 'test-session-001',
            name: 'Test Board',
            createdBy: 'anonymous',
        });
        sessionId = session._id;
    });

    describe('GET /api/session/:id', () => {
        it('should return is_locked: false by default', async () => {
            const res = await request(app).get(`/api/session/${sessionId}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('is_locked', false);
            expect(res.body).toHaveProperty('sessionId', sessionId);
        });

        it('should return is_locked: true for a locked session', async () => {
            await Session.findByIdAndUpdate(sessionId, { is_locked: true });

            const res = await request(app).get(`/api/session/${sessionId}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('is_locked', true);
        });
    });

    describe('PATCH /api/session/:id/lock', () => {
        it('should lock a session with { is_locked: true }', async () => {
            const res = await request(app)
                .patch(`/api/session/${sessionId}/lock`)
                .send({ is_locked: true });

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('is_locked', true);
            expect(res.body).toHaveProperty('sessionId', sessionId);
        });

        it('should unlock a session with { is_locked: false }', async () => {
            // Lock it first
            await Session.findByIdAndUpdate(sessionId, { is_locked: true });

            const res = await request(app)
                .patch(`/api/session/${sessionId}/lock`)
                .send({ is_locked: false });

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('is_locked', false);
            expect(res.body).toHaveProperty('sessionId', sessionId);
        });

        it('should return 400 if is_locked is not a boolean', async () => {
            const res = await request(app)
                .patch(`/api/session/${sessionId}/lock`)
                .send({ is_locked: 'yes' });

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toMatch(/boolean/i);
        });

        it('should return 404 for an unknown session id', async () => {
            const res = await request(app)
                .patch('/api/session/non-existent-id/lock')
                .send({ is_locked: true });

            expect(res.statusCode).toBe(404);
        });
    });
});
