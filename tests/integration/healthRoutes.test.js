import request from 'supertest';
import mongoose from 'mongoose';
import { connect, closeDatabase, clearDatabase } from '../utils/db_handler.js';

const { default: app } = await import('../../src/app.js');

beforeAll(async () => await connect(), 120000);

afterEach(async () => {
    await clearDatabase();
});

afterAll(async () => {
    await closeDatabase();
    await mongoose.disconnect();
});

describe('Health Routes Integration Verification', () => {
    describe('GET /health', () => {
        it('should return 200 OK and status OK', async () => {
            const res = await request(app).get('/health');

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ status: 'OK' });
        });
    });
});
