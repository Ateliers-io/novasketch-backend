import request from 'supertest';
import app from '../../src/app.js';
import mongoose from 'mongoose';
import Room from '../../src/models/Room.js';
import { connect, closeDatabase, clearDatabase } from '../utils/db_handler.js';
import * as Y from 'yjs';
import crypto from 'node:crypto';

// Connect to test DB
beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('Shape Routes Integration Test', () => {

    it('GET /api/rooms/:roomId/shapes returns 404 for non-existent room', async () => {
        const res = await request(app).get('/api/rooms/nonexistent-room/shapes');
        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('Room not found');
    });

    it('GET /api/rooms/:roomId/shapes returns shapes list', async () => {
        // Seed DB
        const doc = new Y.Doc();
        const shapes = doc.getMap('shapes');
        shapes.set('rect1', { type: 'rectangle', x: 10, y: 10 });
        const update = Y.encodeStateAsUpdate(doc);

        const roomId = crypto.randomUUID();
        const room = new Room({ _id: roomId, data: Buffer.from(update) });
        await room.save();

        const res = await request(app).get(`/api/rooms/${roomId}/shapes`);

        expect(res.statusCode).toBe(200);
        expect(res.body.roomId).toBe(roomId);
        expect(res.body.count).toBe(1);
        expect(res.body.shapes).toHaveLength(1);
        expect(res.body.shapes[0].id).toBe('rect1');
        expect(res.body.shapes[0].type).toBe('rectangle');
    });

    it('GET /api/rooms/:roomId/shape/:shapeId returns specific shape', async () => {
        // Seed DB
        const doc = new Y.Doc();
        const shapes = doc.getMap('shapes');
        shapes.set('circle1', { type: 'circle', r: 50 });
        const update = Y.encodeStateAsUpdate(doc);

        const roomId = crypto.randomUUID();
        const room = new Room({ _id: roomId, data: Buffer.from(update) });
        await room.save();

        const res = await request(app).get(`/api/rooms/${roomId}/shape/circle1`);

        expect(res.statusCode).toBe(200);
        expect(res.body.id).toBe('circle1');
        expect(res.body.type).toBe('circle');
        expect(res.body.r).toBe(50);
    });

    it('GET /api/rooms/:roomId/shape/:shapeId returns 404 if shape not found', async () => {
        // Seed DB
        const doc = new Y.Doc();
        const update = Y.encodeStateAsUpdate(doc);
        const roomId = crypto.randomUUID();
        const room = new Room({ _id: roomId, data: Buffer.from(update) });
        await room.save();

        const res = await request(app).get(`/api/rooms/${roomId}/shape/missing-shape`);

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('Shape not found');
    });
});
