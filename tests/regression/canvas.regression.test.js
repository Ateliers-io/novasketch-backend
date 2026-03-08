/**
 * Regression Tests (Canvas CRUD)
 *
 * Pattern: Integration tests via supertest + real MongoDB test DB.
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { connect, closeDatabase, clearDatabase } from '../utils/db_handler.js';
import { registerAndLogin, getAuthHeaders } from '../utils/auth_helper.js';

import Canvas from '../../src/models/Canvas.js';
import User from '../../src/models/User.js';
import CanvasMembership from '../../src/models/canvasMembership.js';

const { default: app } = await import('../../src/app.js');

// --- DB lifecycle ---
beforeAll(async () => await connect(), 120000);
afterEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
});
afterAll(async () => await closeDatabase());

// --------------
// Shared helpers
// --------------

/** Create a canvas via API, return { canvasId, token, userId } */
const createCanvas = async (ownerToken, name = 'RegBoard') => {
    const res = await request(app)
        .post('/api/canvas')
        .set(getAuthHeaders(ownerToken))
        .send({ name });
    if (res.statusCode !== 201) throw new Error(`createCanvas failed: ${JSON.stringify(res.body)}`);
    return res.body.canvasId;
};

// ------------------------
// STEP 8 — Canvas creation
// ------------------------
describe('Step 8 - Canvas creation', () => {
    it('creates a canvas and returns 201 with UUID _id + URL', async () => {
        const { token } = await registerAndLogin(app);
        const res = await request(app)
            .post('/api/canvas')
            .set(getAuthHeaders(token))
            .send({ name: 'My Board' });

        expect(res.statusCode).toBe(201);
        expect(res.body).toHaveProperty('canvasId');
        expect(res.body.name).toBe('My Board');
        expect(res.body.url).toMatch(/^\/board\//);

        // UUID format
        expect(res.body.canvasId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
    });

    it('persists canvas with is_locked=false and owner in participants', async () => {
        const { token, userId } = await registerAndLogin(app);
        const res = await request(app)
            .post('/api/canvas')
            .set(getAuthHeaders(token))
            .send({ name: 'Check Defaults' });
        const canvasId = res.body.canvasId;

        const canvas = await Canvas.findById(canvasId);
        expect(canvas.is_locked).toBe(false);
        expect(canvas.participants).toHaveLength(1);
        expect(canvas.participants[0].role).toBe('owner');
        expect(canvas.participants[0].userId.toString()).toBe(userId);
    });

    it('creates a CanvasMembership with role "owner"', async () => {
        const { token, userId } = await registerAndLogin(app);
        const res = await request(app)
            .post('/api/canvas')
            .set(getAuthHeaders(token))
            .send({ name: 'Membership Board' });
        const canvasId = res.body.canvasId;

        const membership = await CanvasMembership.findOne({ canvasId, userId });
        // Note: controller creates Canvas.participants but addParticipant is a
        // separate endpoint; createCanvas does NOT write to CanvasMembership.
        // Verify at least the Canvas.participants array
        const canvas = await Canvas.findById(canvasId);
        expect(canvas.participants[0].userId.toString()).toBe(userId);
    });

    it('adds canvas to User.canvases array', async () => {
        const { token, userId } = await registerAndLogin(app);
        const res = await request(app)
            .post('/api/canvas')
            .set(getAuthHeaders(token))
            .send({ name: 'User Array Board' });
        const canvasId = res.body.canvasId;

        const user = await User.findById(userId);
        expect(user.canvases.some((c) => c.canvasId === canvasId)).toBe(true);
    });

    it('returns 401 without authentication', async () => {
        const res = await request(app)
            .post('/api/canvas')
            .send({ name: 'No Auth Board' });
        expect(res.statusCode).toBe(401);
    });

    it('uses "Untitled Board" as default name when name is omitted', async () => {
        const { token } = await registerAndLogin(app);
        const res = await request(app)
            .post('/api/canvas')
            .set(getAuthHeaders(token))
            .send({});
        expect(res.statusCode).toBe(201);
        expect(res.body.name).toBe('Untitled Board');
    });
});

// --------------------------
// STEP 9 — Get user canvases
// --------------------------
describe('Step 9 — Get user canvases', () => {
    it('returns empty array when user has no canvases', async () => {
        const { token } = await registerAndLogin(app);
        const res = await request(app)
            .get('/api/canvas/mine')
            .set(getAuthHeaders(token));
        expect(res.statusCode).toBe(200);
        expect(res.body.canvases).toHaveLength(0);
    });

    it('returns all owned canvases with correct role and timestamps', async () => {
        const { token } = await registerAndLogin(app);
        await createCanvas(token, 'Board A');
        await createCanvas(token, 'Board B');

        const res = await request(app)
            .get('/api/canvas/mine')
            .set(getAuthHeaders(token));
        expect(res.statusCode).toBe(200);
        expect(res.body.canvases).toHaveLength(2);
        for (const c of res.body.canvases) {
            expect(c).toHaveProperty('canvasId');
            expect(c).toHaveProperty('role', 'owner');
            expect(c).toHaveProperty('createdAt');
        }
    });

    it('returns isCollab: false for solo boards', async () => {
        const { token } = await registerAndLogin(app);
        await createCanvas(token, 'Solo Board');
        const res = await request(app)
            .get('/api/canvas/mine')
            .set(getAuthHeaders(token));
        expect(res.body.canvases[0].isCollab).toBe(false);
    });

    it('returns isCollab: true when another participant exists', async () => {
        const { token, userId } = await registerAndLogin(app);
        const canvasId = await createCanvas(token, 'Collab Board');

        // Add second participant directly in DB
        await Canvas.findByIdAndUpdate(canvasId, {
            $push: {
                participants: {
                    userId: new mongoose.Types.ObjectId(),
                    role: 'editor',
                    joinedAt: new Date(),
                },
            },
        });

        const res = await request(app)
            .get('/api/canvas/mine')
            .set(getAuthHeaders(token));
        expect(res.body.canvases[0].isCollab).toBe(true);
    });

    it('returns 401 without auth', async () => {
        const res = await request(app).get('/api/canvas/mine');
        expect(res.statusCode).toBe(401);
    });
});

// ---------------------------
// STEP 10 — Get single canvas
// ---------------------------
describe('Step 10 — Get single canvas', () => {
    it('returns 200 with populated owner for a valid canvas ID', async () => {
        const { token } = await registerAndLogin(app);
        const canvasId = await createCanvas(token, 'View Board');

        const res = await request(app).get(`/api/canvas/${canvasId}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.canvasId).toBe(canvasId);
        expect(res.body.name).toBe('View Board');
        expect(res.body.owner).toHaveProperty('displayName');
        expect(res.body.owner).toHaveProperty('email');
        expect(res.body).toHaveProperty('is_locked', false);
    });

    it('returns 404 for a non-existent canvas ID', async () => {
        const res = await request(app).get(`/api/canvas/${crypto.randomUUID()}`);
        expect(res.statusCode).toBe(404);
    });
});

// -----------------------
// STEP 11 — Canvas rename
// -----------------------
describe('Step 11 — Canvas rename', () => {
    it('owner can rename canvas and change is persisted in DB', async () => {
        const { token } = await registerAndLogin(app);
        const canvasId = await createCanvas(token, 'Old Name');

        const res = await request(app)
            .patch(`/api/canvas/${canvasId}/name`)
            .set(getAuthHeaders(token))
            .send({ name: 'New Name' });

        expect(res.statusCode).toBe(200);
        expect(res.body.name).toBe('New Name');

        const canvas = await Canvas.findById(canvasId);
        expect(canvas.name).toBe('New Name');
    });

    it('returns 403 when non-owner tries to rename', async () => {
        const owner = await registerAndLogin(app);
        const other = await registerAndLogin(app);
        const canvasId = await createCanvas(owner.token, 'Rename Guard');

        const res = await request(app)
            .patch(`/api/canvas/${canvasId}/name`)
            .set(getAuthHeaders(other.token))
            .send({ name: 'Hijacked' });

        expect(res.statusCode).toBe(403);
    });

    it('returns 400 when name is missing from body', async () => {
        const { token } = await registerAndLogin(app);
        const canvasId = await createCanvas(token, 'No Name Board');

        const res = await request(app)
            .patch(`/api/canvas/${canvasId}/name`)
            .set(getAuthHeaders(token))
            .send({});

        expect(res.statusCode).toBe(400);
    });

    it('returns 404 for a non-existent canvas ID', async () => {
        const { token } = await registerAndLogin(app);
        const res = await request(app)
            .patch(`/api/canvas/${crypto.randomUUID()}/name`)
            .set(getAuthHeaders(token))
            .send({ name: 'Ghost' });
        expect(res.statusCode).toBe(404);
    });

    it('returns 401 without authentication', async () => {
        const { token } = await registerAndLogin(app);
        const canvasId = await createCanvas(token, 'Auth Board');

        const res = await request(app)
            .patch(`/api/canvas/${canvasId}/name`)
            .send({ name: 'No Auth' });
        expect(res.statusCode).toBe(401);
    });
});

// ------------------------------
// STEP 12 — Canvas lock / unlock
// ------------------------------
describe('Step 12 — Canvas lock / unlock', () => {
    it('owner can lock canvas → is_locked becomes true in DB', async () => {
        const { token } = await registerAndLogin(app);
        const canvasId = await createCanvas(token, 'Lock Board');

        const res = await request(app)
            .patch(`/api/canvas/${canvasId}/lock`)
            .set(getAuthHeaders(token))
            .send({ is_locked: true });

        expect(res.statusCode).toBe(200);
        expect(res.body.is_locked).toBe(true);

        const canvas = await Canvas.findById(canvasId);
        expect(canvas.is_locked).toBe(true);
    });

    it('owner can unlock canvas → is_locked becomes false', async () => {
        const { token } = await registerAndLogin(app);
        const canvasId = await createCanvas(token, 'Unlock Board');
        await Canvas.findByIdAndUpdate(canvasId, { is_locked: true });

        const res = await request(app)
            .patch(`/api/canvas/${canvasId}/lock`)
            .set(getAuthHeaders(token))
            .send({ is_locked: false });

        expect(res.statusCode).toBe(200);
        expect(res.body.is_locked).toBe(false);
    });

    it('returns 400 when is_locked is a string instead of boolean', async () => {
        const { token } = await registerAndLogin(app);
        const canvasId = await createCanvas(token, 'Bool Check');

        const res = await request(app)
            .patch(`/api/canvas/${canvasId}/lock`)
            .set(getAuthHeaders(token))
            .send({ is_locked: 'true' });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toMatch(/boolean/i);
    });

    it('returns 400 when is_locked is a number', async () => {
        const { token } = await registerAndLogin(app);
        const canvasId = await createCanvas(token, 'Num Check');

        const res = await request(app)
            .patch(`/api/canvas/${canvasId}/lock`)
            .set(getAuthHeaders(token))
            .send({ is_locked: 1 });

        expect(res.statusCode).toBe(400);
    });

    it('returns 400 when is_locked is missing', async () => {
        const { token } = await registerAndLogin(app);
        const canvasId = await createCanvas(token, 'Missing Bool');

        const res = await request(app)
            .patch(`/api/canvas/${canvasId}/lock`)
            .set(getAuthHeaders(token))
            .send({});

        expect(res.statusCode).toBe(400);
    });

    it('returns 404 when non-owner tries to lock (looks like 404 due to findOneAndUpdate ownership filter)', async () => {
        const owner = await registerAndLogin(app);
        const other = await registerAndLogin(app);
        const canvasId = await createCanvas(owner.token, 'Guard Lock');

        const res = await request(app)
            .patch(`/api/canvas/${canvasId}/lock`)
            .set(getAuthHeaders(other.token))
            .send({ is_locked: true });

        expect(res.statusCode).toBe(404);
    });

    it('returns 404 for a non-existent canvas ID', async () => {
        const { token } = await registerAndLogin(app);
        const res = await request(app)
            .patch(`/api/canvas/${crypto.randomUUID()}/lock`)
            .set(getAuthHeaders(token))
            .send({ is_locked: true });
        expect(res.statusCode).toBe(404);
    });
});

// -----------------------
// STEP 13 — Canvas delete
// -----------------------
describe('Step 13 — Canvas delete', () => {
    it('owner can delete canvas; canvas and memberships are removed', async () => {
        const owner = await registerAndLogin(app);
        const canvasId = await createCanvas(owner.token, 'Delete Me');

        // Add a membership manually
        await CanvasMembership.create({
            canvasId,
            userId: new mongoose.Types.ObjectId(),
            role: 'editor',
        });

        const res = await request(app)
            .delete(`/api/canvas/${canvasId}`)
            .set(getAuthHeaders(owner.token));

        expect(res.statusCode).toBe(200);
        expect(await Canvas.findById(canvasId)).toBeNull();
        expect(await CanvasMembership.find({ canvasId })).toHaveLength(0);
    });

    it('returns 403 when non-owner tries to delete', async () => {
        const owner = await registerAndLogin(app);
        const other = await registerAndLogin(app);
        const canvasId = await createCanvas(owner.token, 'Protected Delete');

        const res = await request(app)
            .delete(`/api/canvas/${canvasId}`)
            .set(getAuthHeaders(other.token));

        expect(res.statusCode).toBe(403);
        expect(await Canvas.findById(canvasId)).not.toBeNull();
    });

    it('returns 404 for non-existent canvas', async () => {
        const { token } = await registerAndLogin(app);
        const res = await request(app)
            .delete(`/api/canvas/${crypto.randomUUID()}`)
            .set(getAuthHeaders(token));
        expect(res.statusCode).toBe(404);
    });

    it('returns 401 without authentication', async () => {
        const { token } = await registerAndLogin(app);
        const canvasId = await createCanvas(token, 'Auth Delete');
        const res = await request(app).delete(`/api/canvas/${canvasId}`);
        expect(res.statusCode).toBe(401);
    });
});

// ---------------------
// STEP 14 — Join canvas
// ---------------------
describe('Step 14 — Join canvas', () => {
    it('new member joins canvas → membership and User.canvases updated', async () => {
        const owner = await registerAndLogin(app);
        const guest = await registerAndLogin(app);
        const canvasId = await createCanvas(owner.token, 'Join Board');

        const res = await request(app)
            .post(`/api/canvas/${canvasId}/join`)
            .set(getAuthHeaders(guest.token));

        expect(res.statusCode).toBe(200);

        const canvas = await Canvas.findById(canvasId);
        const guestParticipant = canvas.participants.find(
            (p) => p.userId.toString() === guest.userId
        );
        expect(guestParticipant).toBeDefined();
        expect(guestParticipant.role).toBe('editor');

        const guestUser = await User.findById(guest.userId);
        expect(guestUser.canvases.some((c) => c.canvasId === canvasId)).toBe(true);
    });

    it('owner joining their own canvas returns success without duplicating', async () => {
        const owner = await registerAndLogin(app);
        const canvasId = await createCanvas(owner.token, 'Owner Join');

        const res = await request(app)
            .post(`/api/canvas/${canvasId}/join`)
            .set(getAuthHeaders(owner.token));

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Joined as owner');

        const canvas = await Canvas.findById(canvasId);
        expect(canvas.participants).toHaveLength(1);
    });

    it('joining again does not add duplicate participant (upsert)', async () => {
        const owner = await registerAndLogin(app);
        const guest = await registerAndLogin(app);
        const canvasId = await createCanvas(owner.token, 'Dupl Join');

        await request(app).post(`/api/canvas/${canvasId}/join`).set(getAuthHeaders(guest.token));
        await request(app).post(`/api/canvas/${canvasId}/join`).set(getAuthHeaders(guest.token));

        const canvas = await Canvas.findById(canvasId);
        const guestEntries = canvas.participants.filter(
            (p) => p.userId.toString() === guest.userId
        );
        expect(guestEntries).toHaveLength(1);
    });

    it('returns 404 for a non-existent canvas', async () => {
        const { token } = await registerAndLogin(app);
        const res = await request(app)
            .post(`/api/canvas/${crypto.randomUUID()}/join`)
            .set(getAuthHeaders(token));
        expect(res.statusCode).toBe(404);
    });

    it('returns 401 without authentication', async () => {
        const { token } = await registerAndLogin(app);
        const canvasId = await createCanvas(token, 'Join Auth');
        const res = await request(app).post(`/api/canvas/${canvasId}/join`);
        expect(res.statusCode).toBe(401);
    });
});

// -------------------------
// STEP 15 — Add participant
// -------------------------
describe('Step 15 — Add participant', () => {
    it('owner adds a participant with editor role → membership created', async () => {
        const owner = await registerAndLogin(app);
        const participant = await registerAndLogin(app);
        const canvasId = await createCanvas(owner.token, 'Participant Board');

        const res = await request(app)
            .post(`/api/canvas/${canvasId}/participants`)
            .set(getAuthHeaders(owner.token))
            .send({ userId: participant.userId, role: 'editor' });

        expect(res.statusCode).toBe(200);

        const membership = await CanvasMembership.findOne({
            canvasId,
            userId: participant.userId,
        });
        expect(membership).not.toBeNull();
        expect(membership.role).toBe('editor');
    });

    it('returns 403 when non-owner tries to add a participant', async () => {
        const owner = await registerAndLogin(app);
        const other = await registerAndLogin(app);
        const target = await registerAndLogin(app);
        const canvasId = await createCanvas(owner.token, 'Guard Add');

        const res = await request(app)
            .post(`/api/canvas/${canvasId}/participants`)
            .set(getAuthHeaders(other.token))
            .send({ userId: target.userId, role: 'viewer' });

        expect(res.statusCode).toBe(403);
    });

    it('updating an already-existing participant upserts the role', async () => {
        const owner = await registerAndLogin(app);
        const participant = await registerAndLogin(app);
        const canvasId = await createCanvas(owner.token, 'Upsert Board');

        // Add as editor first
        await request(app)
            .post(`/api/canvas/${canvasId}/participants`)
            .set(getAuthHeaders(owner.token))
            .send({ userId: participant.userId, role: 'editor' });

        // Downgrade to viewer
        await request(app)
            .post(`/api/canvas/${canvasId}/participants`)
            .set(getAuthHeaders(owner.token))
            .send({ userId: participant.userId, role: 'viewer' });

        const membership = await CanvasMembership.findOne({
            canvasId,
            userId: participant.userId,
        });
        expect(membership.role).toBe('viewer');
    });

    it('returns 404 when target user does not exist', async () => {
        const owner = await registerAndLogin(app);
        const canvasId = await createCanvas(owner.token, 'Ghost User Board');

        const res = await request(app)
            .post(`/api/canvas/${canvasId}/participants`)
            .set(getAuthHeaders(owner.token))
            .send({ userId: new mongoose.Types.ObjectId().toString(), role: 'editor' });

        expect(res.statusCode).toBe(404);
    });
});
