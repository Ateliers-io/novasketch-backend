// shapes.regression.test.js: Regression tests for shape REST endpoints.
//
// Uses real MongoDB (test DB) via db_handler.

import request from 'supertest';
import * as Y from 'yjs';
import crypto from 'node:crypto';
import app from '../../src/app.js';
import Room from '../../src/models/Room.js';
import { connect, clearDatabase, closeDatabase } from '../utils/db_handler.js';

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

// ------------------------------------------------
// Helper: seed a Room doc with a populated Yjs doc
// ------------------------------------------------
function buildRoom(shapes = {}) {
    const doc = new Y.Doc();
    const shapesMap = doc.getMap('shapes');
    for (const [id, value] of Object.entries(shapes)) {
        shapesMap.set(id, value);
    }
    const update = Y.encodeStateAsUpdate(doc);
    const roomId = crypto.randomUUID();
    return { roomId, data: Buffer.from(update) };
}

// -----------------------------
// GET /api/rooms/:roomId/shapes
// -----------------------------
describe('GET /api/rooms/:roomId/shapes', () => {
    it('returns 404 for a room that does not exist', async () => {
        const res = await request(app).get('/api/rooms/non-existent-room-id/shapes');
        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('Room not found');
        expect(res.body.roomId).toBe('non-existent-room-id');
    });

    it('returns 404 for a room document with no data field', async () => {
        // Save a Room without binary data (simulate corrupt record)
        const roomId = crypto.randomUUID();
        // Override validation: set data to undefined via direct save
        // Room.data has no required constraint, but route checks !room.data
        await Room.collection.insertOne({ _id: roomId });

        const res = await request(app).get(`/api/rooms/${roomId}/shapes`);
        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('Room not found');
    });

    it('returns 200 with empty shapes array for a room with no shapes', async () => {
        const { roomId, data } = buildRoom({});
        await new Room({ _id: roomId, data }).save();

        const res = await request(app).get(`/api/rooms/${roomId}/shapes`);
        expect(res.statusCode).toBe(200);
        expect(res.body.roomId).toBe(roomId);
        expect(res.body.count).toBe(0);
        expect(res.body.shapes).toEqual([]);
    });

    it('returns 200 with all shapes for a populated room', async () => {
        const { roomId, data } = buildRoom({
            rect1: { type: 'rectangle', x: 10, y: 20, width: 100, height: 50 },
            circle1: { type: 'circle', cx: 50, cy: 50, r: 30 },
        });
        await new Room({ _id: roomId, data }).save();

        const res = await request(app).get(`/api/rooms/${roomId}/shapes`);
        expect(res.statusCode).toBe(200);
        expect(res.body.roomId).toBe(roomId);
        expect(res.body.count).toBe(2);

        const ids = res.body.shapes.map(s => s.id).sort();
        expect(ids).toEqual(['circle1', 'rect1']);

        const rect = res.body.shapes.find(s => s.id === 'rect1');
        expect(rect.type).toBe('rectangle');
        expect(rect.x).toBe(10);

        const circle = res.body.shapes.find(s => s.id === 'circle1');
        expect(circle.type).toBe('circle');
        expect(circle.r).toBe(30);
    });

    it('preserves all properties of each shape', async () => {
        const shapeData = { type: 'path', d: 'M0 0 L100 100', fill: '#ff0000', opacity: 0.8 };
        const { roomId, data } = buildRoom({ path1: shapeData });
        await new Room({ _id: roomId, data }).save();

        const res = await request(app).get(`/api/rooms/${roomId}/shapes`);
        expect(res.statusCode).toBe(200);
        const shape = res.body.shapes[0];
        expect(shape.id).toBe('path1');
        expect(shape.d).toBe('M0 0 L100 100');
        expect(shape.fill).toBe('#ff0000');
        expect(shape.opacity).toBe(0.8);
    });

    it('returns count matching shapes array length', async () => {
        const shapes = {};
        for (let i = 0; i < 5; i++) {
            shapes[`shape-${i}`] = { type: 'rectangle', x: i };
        }
        const { roomId, data } = buildRoom(shapes);
        await new Room({ _id: roomId, data }).save();

        const res = await request(app).get(`/api/rooms/${roomId}/shapes`);
        expect(res.statusCode).toBe(200);
        expect(res.body.count).toBe(res.body.shapes.length);
        expect(res.body.count).toBe(5);
    });
});

// -------------------------------------
// GET /api/rooms/:roomId/shape/:shapeId
// -------------------------------------
describe('GET /api/rooms/:roomId/shape/:shapeId', () => {
    it('returns 404 when room does not exist', async () => {
        const res = await request(app).get('/api/rooms/ghost-room/shape/shape1');
        expect(res.statusCode).toBe(404);
    });

    it('returns 404 when shape does not exist in room', async () => {
        const { roomId, data } = buildRoom({ existing: { type: 'circle' } });
        await new Room({ _id: roomId, data }).save();

        const res = await request(app).get(`/api/rooms/${roomId}/shape/non-existent-shape`);
        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('Shape not found');
    });

    it('returns 200 with shape data for an existing shape', async () => {
        const shapeData = { type: 'rectangle', x: 5, y: 15, width: 200, height: 80 };
        const { roomId, data } = buildRoom({ myRect: shapeData });
        await new Room({ _id: roomId, data }).save();

        const res = await request(app).get(`/api/rooms/${roomId}/shape/myRect`);
        expect(res.statusCode).toBe(200);
        expect(res.body.id).toBe('myRect');
        expect(res.body.type).toBe('rectangle');
        expect(res.body.x).toBe(5);
        expect(res.body.width).toBe(200);
    });

    it('returns a specific shape among multiple', async () => {
        const { roomId, data } = buildRoom({
            shape_a: { type: 'circle', r: 10 },
            shape_b: { type: 'triangle', sides: 3 },
            shape_c: { type: 'line', length: 100 },
        });
        await new Room({ _id: roomId, data }).save();

        const res = await request(app).get(`/api/rooms/${roomId}/shape/shape_b`);
        expect(res.statusCode).toBe(200);
        expect(res.body.id).toBe('shape_b');
        expect(res.body.type).toBe('triangle');
        expect(res.body.sides).toBe(3);
    });

    it('returns shape with numeric and boolean properties correctly', async () => {
        const shapeData = { type: 'rect', x: 0, y: 0, visible: true, rotation: 45.5, opacity: 1 };
        const { roomId, data } = buildRoom({ numShape: shapeData });
        await new Room({ _id: roomId, data }).save();

        const res = await request(app).get(`/api/rooms/${roomId}/shape/numShape`);
        expect(res.statusCode).toBe(200);
        expect(res.body.visible).toBe(true);
        expect(res.body.rotation).toBe(45.5);
        expect(res.body.opacity).toBe(1);
    });
});
