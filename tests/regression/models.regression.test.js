// models.regression.test.js: Regression tests for all Mongoose models.

import * as Y from 'yjs';
import crypto from 'node:crypto';
import User from '../../src/models/User.js';
import Canvas from '../../src/models/Canvas.js';
import CanvasMembership from '../../src/models/canvasMembership.js';
import Room from '../../src/models/Room.js';
import { connect, clearDatabase, closeDatabase } from '../utils/db_handler.js';

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

// -------
// Helpers
// -------
function validUser(overrides = {}) {
    return {
        email: `user-${crypto.randomUUID()}@example.com`,
        displayName: 'TestUser',
        password: 'Secret@123',
        authProvider: 'local',
        ...overrides,
    };
}

function validCanvas(ownerId, overrides = {}) {
    return {
        _id: crypto.randomUUID(),
        name: 'My Canvas',
        owner: ownerId,
        ...overrides,
    };
}

// ----------
// User model
// ----------
describe('User model', () => {
    it('saves a valid local user without error', async () => {
        const user = new User(validUser());
        const saved = await user.save();
        expect(saved._id).toBeDefined();
        expect(saved.email).toContain('@example.com');
    });

    it('rejects a user with missing email', async () => {
        const user = new User({ displayName: 'NoEmail', password: 'Secret@123' });
        await expect(user.save()).rejects.toThrow(/email is required/i);
    });

    it('rejects a user with missing displayName', async () => {
        const user = new User({ email: 'test@example.com', password: 'Secret@123' });
        await expect(user.save()).rejects.toThrow(/display name is required/i);
    });

    it('enforces unique email constraint', async () => {
        const email = `dup-${crypto.randomUUID()}@example.com`;
        await new User(validUser({ email })).save();
        const dup = new User(validUser({ email }));
        await expect(dup.save()).rejects.toMatchObject({ code: 11000 });
    });

    it('enforces unique googleId constraint', async () => {
        const googleId = `google-${crypto.randomUUID()}`;
        await new User(validUser({ googleId, authProvider: 'google' })).save();
        const dup = new User(validUser({
            googleId,
            authProvider: 'google',
            email: `other-${crypto.randomUUID()}@example.com`,
        }));
        await expect(dup.save()).rejects.toMatchObject({ code: 11000 });
    });

    it('allows multiple users with null googleId (sparse index)', async () => {
        const u1 = new User(validUser({ email: `u1-${crypto.randomUUID()}@e.com` }));
        const u2 = new User(validUser({ email: `u2-${crypto.randomUUID()}@e.com` }));
        await expect(u1.save()).resolves.toBeDefined();
        await expect(u2.save()).resolves.toBeDefined();
    });

    it('hashes password before saving', async () => {
        const raw = 'Secret@123';
        const user = await new User(validUser({ password: raw })).save();

        // Re-fetch with password included
        const found = await User.findById(user._id).select('+password');
        expect(found.password).not.toBe(raw);
        expect(found.password).toMatch(/^\$2b\$/); // bcrypt prefix
    });

    it('comparePassword returns true for correct password', async () => {
        const raw = 'Secret@123';
        const user = await new User(validUser({ password: raw })).save();
        const found = await User.findById(user._id).select('+password');
        const match = await found.comparePassword(raw);
        expect(match).toBe(true);
    });

    it('comparePassword returns false for wrong password', async () => {
        const user = await new User(validUser({ password: 'Secret@123' })).save();
        const found = await User.findById(user._id).select('+password');
        const match = await found.comparePassword('WrongPass@999');
        expect(match).toBe(false);
    });

    it('comparePassword returns false when no password is set (Google user)', async () => {
        const user = await new User(validUser({ authProvider: 'google', password: undefined })).save();
        const found = await User.findById(user._id).select('+password');
        const match = await found.comparePassword('anything');
        expect(match).toBe(false);
    });

    it('does not return password field by default (select: false)', async () => {
        const user = await new User(validUser()).save();
        const found = await User.findById(user._id);
        expect(found.password).toBeUndefined();
    });

    it('lowercases email automatically', async () => {
        const user = new User(validUser({ email: 'UPPER@EXAMPLE.COM' }));
        const saved = await user.save();
        expect(saved.email).toBe('upper@example.com');
    });

    it('rejects invalid email format', async () => {
        const user = new User(validUser({ email: 'not-an-email' }));
        await expect(user.save()).rejects.toThrow(/invalid email/i);
    });

    it('rejects displayName that does not match the regex', async () => {
        // Names starting with a digit are invalid per DISPLAY_NAME_REGEX
        const user = new User(validUser({ displayName: '1BadName' }));
        await expect(user.save()).rejects.toThrow();
    });

    it('has avatar defaulting to empty string', async () => {
        const user = await new User(validUser()).save();
        expect(user.avatar).toBe('');
    });

    it('has authProvider defaulting to local', async () => {
        const user = await new User(validUser()).save();
        expect(user.authProvider).toBe('local');
    });
});

// ------------
// Canvas model
// ------------
describe('Canvas model', () => {
    let ownerId;

    beforeEach(async () => {
        const user = await new User(validUser()).save();
        ownerId = user._id;
    });

    it('saves a valid canvas with UUID _id', async () => {
        const canvas = new Canvas(validCanvas(ownerId));
        const saved = await canvas.save();
        expect(saved._id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
    });

    it('requires owner field', async () => {
        const canvas = new Canvas({ _id: crypto.randomUUID(), name: 'No Owner' });
        await expect(canvas.save()).rejects.toThrow(/owner/i);
    });

    it('requires _id field', async () => {
        const canvas = new Canvas({ name: 'No ID', owner: ownerId });
        await expect(canvas.save()).rejects.toThrow();
    });

    it('defaults name to "Untitled Board"', async () => {
        const canvas = new Canvas({ _id: crypto.randomUUID(), owner: ownerId });
        const saved = await canvas.save();
        expect(saved.name).toBe('Untitled Board');
    });

    it('defaults is_locked to false', async () => {
        const canvas = new Canvas(validCanvas(ownerId));
        const saved = await canvas.save();
        expect(saved.is_locked).toBe(false);
    });

    it('allows is_locked to be toggled true', async () => {
        const canvas = new Canvas(validCanvas(ownerId, { is_locked: true }));
        const saved = await canvas.save();
        expect(saved.is_locked).toBe(true);
    });

    it('enforces maxlength 100 on name', async () => {
        const name = 'A'.repeat(101);
        const canvas = new Canvas(validCanvas(ownerId, { name }));
        await expect(canvas.save()).rejects.toThrow(/100/);
    });

    it('accepts valid participant roles', async () => {
        const user = await new User(validUser()).save();
        const canvas = new Canvas(validCanvas(ownerId, {
            participants: [{ userId: user._id, role: 'editor' }]
        }));
        const saved = await canvas.save();
        expect(saved.participants[0].role).toBe('editor');
    });

    it('rejects invalid participant roles', async () => {
        const user = await new User(validUser()).save();
        const canvas = new Canvas(validCanvas(ownerId, {
            participants: [{ userId: user._id, role: 'superadmin' }]
        }));
        await expect(canvas.save()).rejects.toThrow();
    });

    it('has lastEditedAt defaulting to now', async () => {
        const before = new Date();
        const canvas = await new Canvas(validCanvas(ownerId)).save();
        expect(canvas.lastEditedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    });

    it('has sync_status.isFullySynced defaulting to false', async () => {
        const canvas = await new Canvas(validCanvas(ownerId)).save();
        expect(canvas.sync_status.isFullySynced).toBe(false);
    });
});

// ----------------------
// CanvasMembership model
// ----------------------
describe('CanvasMembership model', () => {
    let userId, canvasId;

    beforeEach(async () => {
        const user = await new User(validUser()).save();
        userId = user._id;
        canvasId = crypto.randomUUID();
    });

    it('saves a valid membership', async () => {
        const membership = new CanvasMembership({ canvasId, userId, role: 'editor' });
        const saved = await membership.save();
        expect(saved.canvasId).toBe(canvasId);
        expect(saved.role).toBe('editor');
    });

    it('requires canvasId', async () => {
        const membership = new CanvasMembership({ userId, role: 'editor' });
        await expect(membership.save()).rejects.toThrow();
    });

    it('requires userId', async () => {
        const membership = new CanvasMembership({ canvasId, role: 'editor' });
        await expect(membership.save()).rejects.toThrow();
    });

    it('requires role', async () => {
        const membership = new CanvasMembership({ canvasId, userId });
        await expect(membership.save()).rejects.toThrow();
    });

    it('rejects invalid role values', async () => {
        const membership = new CanvasMembership({ canvasId, userId, role: 'admin' });
        await expect(membership.save()).rejects.toThrow();
    });

    it('accepts all valid roles: owner, editor, viewer', async () => {
        for (const role of ['owner', 'editor', 'viewer']) {
            const user = await new User(validUser()).save();
            const m = new CanvasMembership({ canvasId: crypto.randomUUID(), userId: user._id, role });
            await expect(m.save()).resolves.toBeDefined();
        }
    });

    it('enforces compound unique index (canvasId + userId)', async () => {
        await new CanvasMembership({ canvasId, userId, role: 'editor' }).save();
        const dup = new CanvasMembership({ canvasId, userId, role: 'viewer' });
        await expect(dup.save()).rejects.toMatchObject({ code: 11000 });
    });

    it('allows same userId on different canvases', async () => {
        const canvas2 = crypto.randomUUID();
        await new CanvasMembership({ canvasId, userId, role: 'editor' }).save();
        const m2 = new CanvasMembership({ canvasId: canvas2, userId, role: 'owner' });
        await expect(m2.save()).resolves.toBeDefined();
    });

    it('allows same canvasId with different userIds', async () => {
        const user2 = await new User(validUser()).save();
        await new CanvasMembership({ canvasId, userId, role: 'editor' }).save();
        const m2 = new CanvasMembership({ canvasId, userId: user2._id, role: 'viewer' });
        await expect(m2.save()).resolves.toBeDefined();
    });

    it('lastAccessedAt defaults to current time', async () => {
        const before = new Date();
        const m = await new CanvasMembership({ canvasId, userId, role: 'viewer' }).save();
        expect(m.lastAccessedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    });
});

// -------------------------------------------------------------
// Room model - Buffer roundtrip + Yjs encode/decode consistency
// -------------------------------------------------------------
describe('Room model', () => {
    it('saves a Room with binary Yjs snapshot and retrieves it intact', async () => {
        const doc = new Y.Doc();
        const shapes = doc.getMap('shapes');
        shapes.set('rect1', { type: 'rectangle', x: 10, y: 20, width: 100 });
        const update = Y.encodeStateAsUpdate(doc);
        const roomId = crypto.randomUUID();

        await new Room({ _id: roomId, data: Buffer.from(update) }).save();

        const retrieved = await Room.findById(roomId);
        expect(retrieved).not.toBeNull();
        expect(Buffer.isBuffer(retrieved.data)).toBe(true);
    });

    it('decodes retrieved Yjs binary back to the same shapes', async () => {
        const doc = new Y.Doc();
        const shapes = doc.getMap('shapes');
        shapes.set('circle1', { type: 'circle', cx: 50, cy: 50, r: 25 });
        const update = Y.encodeStateAsUpdate(doc);
        const roomId = crypto.randomUUID();

        await new Room({ _id: roomId, data: Buffer.from(update) }).save();

        const retrieved = await Room.findById(roomId);
        const restored = new Y.Doc();
        Y.applyUpdate(restored, new Uint8Array(retrieved.data));
        const restoredShapes = restored.getMap('shapes');

        expect(restoredShapes.size).toBe(1);
        const shape = restoredShapes.get('circle1');
        expect(shape.type).toBe('circle');
        expect(shape.cx).toBe(50);
        expect(shape.r).toBe(25);
    });

    it('preserves multiple shapes through encode-save-decode cycle', async () => {
        const doc = new Y.Doc();
        const shapes = doc.getMap('shapes');
        const shapeCount = 5;
        for (let i = 0; i < shapeCount; i++) {
            shapes.set(`shape-${i}`, { type: 'rect', index: i });
        }
        const update = Y.encodeStateAsUpdate(doc);
        const roomId = crypto.randomUUID();

        await new Room({ _id: roomId, data: Buffer.from(update) }).save();

        const retrieved = await Room.findById(roomId);
        const restored = new Y.Doc();
        Y.applyUpdate(restored, new Uint8Array(retrieved.data));
        const restoredShapes = restored.getMap('shapes');

        expect(restoredShapes.size).toBe(shapeCount);
        for (let i = 0; i < shapeCount; i++) {
            const s = restoredShapes.get(`shape-${i}`);
            expect(s.index).toBe(i);
        }
    });

    it('defaults shapeCount to 0', async () => {
        const doc = new Y.Doc();
        const update = Y.encodeStateAsUpdate(doc);
        const room = await new Room({ _id: crypto.randomUUID(), data: Buffer.from(update) }).save();
        expect(room.shapeCount).toBe(0);
    });

    it('defaults dataSize to 0', async () => {
        const doc = new Y.Doc();
        const update = Y.encodeStateAsUpdate(doc);
        const room = await new Room({ _id: crypto.randomUUID(), data: Buffer.from(update) }).save();
        expect(room.dataSize).toBe(0);
    });

    it('allows updating shapeCount and dataSize', async () => {
        const doc = new Y.Doc();
        const update = Y.encodeStateAsUpdate(doc);
        const roomId = crypto.randomUUID();
        await new Room({ _id: roomId, data: Buffer.from(update) }).save();

        const updated = await Room.findByIdAndUpdate(
            roomId,
            { shapeCount: 7, dataSize: 1024 },
            { new: true }
        );
        expect(updated.shapeCount).toBe(7);
        expect(updated.dataSize).toBe(1024);
    });

    it('uses the canvas UUID as _id (string, not ObjectId)', async () => {
        const roomId = crypto.randomUUID();
        const doc = new Y.Doc();
        const update = Y.encodeStateAsUpdate(doc);
        const room = await new Room({ _id: roomId, data: Buffer.from(update) }).save();

        expect(typeof room._id).toBe('string');
        expect(room._id).toBe(roomId);
    });

    it('has timestamps (createdAt, updatedAt)', async () => {
        const doc = new Y.Doc();
        const update = Y.encodeStateAsUpdate(doc);
        const room = await new Room({ _id: crypto.randomUUID(), data: Buffer.from(update) }).save();
        expect(room.createdAt).toBeInstanceOf(Date);
        expect(room.updatedAt).toBeInstanceOf(Date);
    });
});
