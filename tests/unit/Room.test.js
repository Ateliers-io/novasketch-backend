import mongoose from 'mongoose';
import Room from '../../src/models/Room.js';
import { connect, closeDatabase, clearDatabase } from '../utils/db_handler.js';
import * as Y from 'yjs';

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('Room Model Test', () => {
    it('create and save room successfully', async () => {
        const doc = new Y.Doc();
        const shapes = doc.getMap('shapes');
        shapes.set('shape1', { type: 'rect', x: 10, y: 20 });
        const update = Y.encodeStateAsUpdate(doc);

        const roomData = {
            _id: 'room-123',
            data: Buffer.from(update)
        };
        const validRoom = new Room(roomData);
        const savedRoom = await validRoom.save();

        expect(savedRoom._id).toBe('room-123');
        expect(savedRoom.data).toBeInstanceOf(Buffer);
        expect(savedRoom.data.length).toBeGreaterThan(0);
    });

    it('retrieve room and decode buffer', async () => {
        const doc = new Y.Doc();
        const shapes = doc.getMap('shapes');
        shapes.set('shape2', { type: 'circle', r: 5 });
        const update = Y.encodeStateAsUpdate(doc);

        const room = new Room({ _id: 'room-456', data: Buffer.from(update) });
        await room.save();

        const foundRoom = await Room.findById('room-456');
        expect(foundRoom).toBeDefined();

        const loadedDoc = new Y.Doc();
        Y.applyUpdate(loadedDoc, new Uint8Array(foundRoom.data));
        const loadedShapes = loadedDoc.getMap('shapes');

        expect(loadedShapes.get('shape2')).toEqual({ type: 'circle', r: 5 });
    });
});
