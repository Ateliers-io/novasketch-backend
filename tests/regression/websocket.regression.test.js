// websocket.regression.test.js: Regression tests for the WebSocket layer.
//
// Architecture: We cannot import server.js directly because it:
//   1. Imports instrument.mjs (Sentry) which calls connectDB()
//   2. Binds a listener immediately on a fixed port
//
// Instead, we replicate the WS setup from server.js using the same protocol
// implementation inside a test-controlled http.Server, so we get a real
// functional server on a random ephemeral port per test suite.
//
// Protocol type bytes (mirrored from server.js):
//   0 = Yjs sync
//   1 = Awareness (cursor / presence)
//   2 = Ephemeral broadcast (drag positions)
//   3 = Property update (resize / rotate — validated before relay)
//   4 = Presence event (user_joined / user_left / room_state)
//   5 = Redis cached shapes

import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import { encoding, decoding } from 'lib0';
import { jest } from '@jest/globals';

import { validatePropertyUpdate } from '../../src/utils/validation.js';
import app from '../../src/app.js';
import Room from '../../src/models/Room.js';
import Canvas from '../../src/models/Canvas.js';
import User from '../../src/models/User.js';
import { connect, clearDatabase, closeDatabase } from '../utils/db_handler.js';
import {
    createWSClient,
    waitForMessage,
    collectMessages,
    sendYjsUpdate,
    sendPropertyUpdate,
    closeClient,
} from '../utils/ws_helper.js';

// -------------------------------------------------------------
// Minimal self-contained WS server (replicates server.js logic)
// -------------------------------------------------------------

// In-memory room registry, keyed by roomId
const rooms = new Map();

const buildPresenceMessage = (jsonStr) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 4);
    encoding.writeVarString(encoder, jsonStr);
    return encoding.toUint8Array(encoder);
};

const broadcastLocal = (roomId, message, excludeClient = null) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.clients.forEach(client => {
        if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
};

const getOrCreateRoom = async (roomId) => {
    if (rooms.has(roomId)) return rooms.get(roomId);

    const doc = new Y.Doc();
    doc.awareness = new awarenessProtocol.Awareness(doc);
    const roomState = { doc, clients: new Set(), isLocked: false };
    rooms.set(roomId, roomState);

    // Load lock state from Canvas (if exists)
    try {
        const canvas = await Canvas.findById(roomId);
        if (canvas) roomState.isLocked = canvas.is_locked;
    } catch { /* ignore */ }

    // Load Yjs state from Room (if exists)
    try {
        const existing = await Room.findById(roomId);
        if (existing?.data?.length > 0) {
            Y.applyUpdate(doc, new Uint8Array(existing.data));
        }
    } catch { /* ignore */ }

    // Yjs update listener: persist + local-broadcast
    doc.on('update', (update, origin) => {
        if (origin !== null) {
            const enc = encoding.createEncoder();
            encoding.writeVarUint(enc, 0);
            syncProtocol.writeUpdate(enc, update);
            broadcastLocal(roomId, encoding.toUint8Array(enc), origin);
        }
    });

    // Awareness update listener
    doc.awareness.on('update', ({ added, updated, removed }, origin) => {
        const changed = added.concat(updated).concat(removed);
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, 1);
        const aw = awarenessProtocol.encodeAwarenessUpdate(doc.awareness, changed);
        encoding.writeVarUint8Array(enc, aw);
        broadcastLocal(roomId, encoding.toUint8Array(enc), origin);
    });

    return roomState;
};

const startTestServer = () => {
    return new Promise((resolve) => {
        const server = http.createServer(app);
        const wss = new WebSocketServer({ server });

        wss.on('connection', async (ws, req) => {
            const urlObj = new URL(req.url, 'http://localhost');
            const roomId = urlObj.pathname.slice(1) || 'default-room';
            const name = urlObj.searchParams.get('name') || 'Anonymous';
            const clientId = urlObj.searchParams.get('clientId') || crypto.randomUUID();
            ws.meta = { name, clientId };

            const room = await getOrCreateRoom(roomId);
            room.clients.add(ws);

            // Broadcast user_joined to others
            broadcastLocal(roomId, buildPresenceMessage(JSON.stringify({
                event: 'user_joined',
                name: ws.meta.name,
                clientId: ws.meta.clientId,
                count: room.clients.size,
            })), ws);

            // Send room_state to newcomer
            const members = Array.from(room.clients).map(c => ({
                name: c.meta.name,
                clientId: c.meta.clientId,
            }));
            ws.send(buildPresenceMessage(JSON.stringify({
                event: 'room_state',
                members,
                count: members.length,
            })));

            // Send Yjs sync step 1
            const enc = encoding.createEncoder();
            encoding.writeVarUint(enc, 0);
            syncProtocol.writeSyncStep1(enc, room.doc);
            ws.send(encoding.toUint8Array(enc));

            // Message handler
            ws.on('message', (message) => {
                try {
                    const enc2 = encoding.createEncoder();
                    const dec = decoding.createDecoder(new Uint8Array(message));
                    const msgType = decoding.readVarUint(dec);

                    switch (msgType) {
                        case 0: // Yjs sync
                            if (room.isLocked) {
                                ws.send(buildPresenceMessage(JSON.stringify({
                                    event: 'session_locked',
                                    message: 'This session is locked. Your changes were not saved.',
                                })));
                                break;
                            }
                            encoding.writeVarUint(enc2, 0);
                            syncProtocol.readSyncMessage(dec, enc2, room.doc, ws);
                            if (encoding.length(enc2) > 1) ws.send(encoding.toUint8Array(enc2));
                            break;

                        case 1: // Awareness
                            awarenessProtocol.applyAwarenessUpdate(
                                room.doc.awareness,
                                decoding.readVarUint8Array(dec),
                                ws
                            );
                            break;

                        case 2: { // Ephemeral / broadcast
                            const payload = decoding.readVarUint8Array(dec);
                            const fwdEnc = encoding.createEncoder();
                            encoding.writeVarUint(fwdEnc, 2);
                            encoding.writeVarUint8Array(fwdEnc, payload);
                            broadcastLocal(roomId, encoding.toUint8Array(fwdEnc), ws);
                            break;
                        }

                        case 3: { // Property update
                            const payload = decoding.readVarUint8Array(dec);
                            const payloadStr = new TextDecoder().decode(payload);
                            try {
                                const data = JSON.parse(payloadStr);
                                const validation = validatePropertyUpdate(data);
                                if (!validation.valid) break; // drop malformed
                                const fwdEnc = encoding.createEncoder();
                                encoding.writeVarUint(fwdEnc, 3);
                                encoding.writeVarUint8Array(fwdEnc, payload);
                                broadcastLocal(roomId, encoding.toUint8Array(fwdEnc), ws);
                            } catch { /* ignore parse errors */ }
                            break;
                        }
                    }
                } catch { /* ignore decode errors */ }
            });

            // Cleanup on disconnect
            ws.on('close', () => {
                room.clients.delete(ws);
                broadcastLocal(roomId, buildPresenceMessage(JSON.stringify({
                    event: 'user_left',
                    name: ws.meta?.name,
                    clientId: ws.meta?.clientId,
                    count: room.clients.size,
                })));
                if (room.clients.size === 0) rooms.delete(roomId);
            });
        });

        // Use port 0 to let OS assigns an ephemeral port
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({ server, wss, port });
        });
    });
};

// --------------------
// Test-suite lifecycle
// --------------------
let server, wss, port, baseUrl;

beforeAll(async () => {
    await connect();
    ({ server, wss, port } = await startTestServer());
    baseUrl = `ws://127.0.0.1:${port}`;
});

afterEach(async () => {
    // Close any leftover open clients
    for (const [, room] of rooms) {
        for (const client of room.clients) {
            await closeClient(client);
        }
    }
    rooms.clear();
    await clearDatabase();
});

afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    await closeDatabase();
});

// ----------------------------------------------------------
// Connection lifecycle (connect -> receive initial messages)
// ----------------------------------------------------------
describe('WS connection lifecycle', () => {
    it('sends room_state (type 4) on initial connection', async () => {
        const roomId = crypto.randomUUID();
        const ws = await createWSClient(baseUrl, roomId, { name: 'Alice' });

        const msg = await waitForMessage(ws, 4, 3000);
        const dec = decoding.createDecoder(new Uint8Array(msg));
        decoding.readVarUint(dec);
        const json = JSON.parse(decoding.readVarString(dec));

        expect(json.event).toBe('room_state');
        expect(Array.isArray(json.members)).toBe(true);
        expect(json.members.some(m => m.name === 'Alice')).toBe(true);

        await closeClient(ws);
    });

    it('sends Yjs sync step 1 (type 0) on initial connection', async () => {
        const roomId = crypto.randomUUID();
        const ws = await createWSClient(baseUrl, roomId);

        const msg = await waitForMessage(ws, 0, 3000);
        const dec = decoding.createDecoder(new Uint8Array(msg));
        const msgType = decoding.readVarUint(dec);
        expect(msgType).toBe(0);

        await closeClient(ws);
    });

    it('loads persisted Yjs snapshot from Room document on connection', async () => {
        const roomId = crypto.randomUUID();

        // Pre-seed Room doc in MongoDB
        const doc = new Y.Doc();
        const shapes = doc.getMap('shapes');
        shapes.set('seeded-shape', { type: 'rect', x: 42 });
        const update = Y.encodeStateAsUpdate(doc);
        await new Room({ _id: roomId, data: Buffer.from(update) }).save();

        const ws = await createWSClient(baseUrl, roomId);

        // Wait for Yjs sync step 1
        await waitForMessage(ws, 0, 3000);

        // Client performs sync step 2 exchange
        const clientDoc = new Y.Doc();
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, 0);
        syncProtocol.writeSyncStep1(enc, clientDoc);
        ws.send(encoding.toUint8Array(enc));

        // Receive sync step 2 with full state
        const step2 = await waitForMessage(ws, 0, 3000);
        const dec2 = decoding.createDecoder(new Uint8Array(step2));
        decoding.readVarUint(dec2); // type 0
        syncProtocol.readSyncMessage(dec2, encoding.createEncoder(), clientDoc, null);

        const shapesMap = clientDoc.getMap('shapes');
        const seeded = shapesMap.get('seeded-shape');
        expect(seeded).toBeDefined();
        expect(seeded.x).toBe(42);

        await closeClient(ws);
    });
});

// ----------------------------
// Multi-client presence events
// ----------------------------
describe('Multi-client presence events', () => {
    it('notifies existing clients when a new user joins (user_joined event)', async () => {
        const roomId = crypto.randomUUID();

        const ws1 = await createWSClient(baseUrl, roomId, { name: 'Alice' });
        // Drain initial messages for ws1
        await waitForMessage(ws1, 4, 2000);
        await waitForMessage(ws1, 0, 2000);

        // Start collecting type-4 messages on ws1 before ws2 joins
        const presencePromise = waitForMessage(ws1, 4, 3000);

        const ws2 = await createWSClient(baseUrl, roomId, { name: 'Bob' });
        await waitForMessage(ws2, 4, 2000); // drain ws2's own room_state

        const msg = await presencePromise;
        const dec = decoding.createDecoder(new Uint8Array(msg));
        decoding.readVarUint(dec);
        const json = JSON.parse(decoding.readVarString(dec));

        expect(json.event).toBe('user_joined');
        expect(json.name).toBe('Bob');

        await closeClient(ws1);
        await closeClient(ws2);
    });

    it('notifies remaining clients when a user disconnects (user_left event)', async () => {
        const roomId = crypto.randomUUID();

        const ws1 = await createWSClient(baseUrl, roomId, { name: 'Alice' });
        await waitForMessage(ws1, 4, 2000); // room_state
        await waitForMessage(ws1, 0, 2000); // sync step 1

        const ws2 = await createWSClient(baseUrl, roomId, { name: 'Bob' });
        await waitForMessage(ws1, 4, 2000); // user_joined for Bob
        await waitForMessage(ws2, 4, 2000); // room_state for Bob

        // Now Bob disconnects and ws1 should receive user_left
        const leftPromise = waitForMessage(ws1, 4, 3000);
        await closeClient(ws2);

        const msg = await leftPromise;
        const dec = decoding.createDecoder(new Uint8Array(msg));
        decoding.readVarUint(dec);
        const json = JSON.parse(decoding.readVarString(dec));

        expect(json.event).toBe('user_left');
        expect(json.name).toBe('Bob');

        await closeClient(ws1);
    });

    it('includes all current members in room_state sent to new joiner', async () => {
        const roomId = crypto.randomUUID();

        const ws1 = await createWSClient(baseUrl, roomId, { name: 'Alice' });
        await waitForMessage(ws1, 4, 2000);
        await waitForMessage(ws1, 0, 2000);

        const ws2 = await createWSClient(baseUrl, roomId, { name: 'Bob' });
        // First type-4 message Bob receives is room_state (server sends it first)
        const msg = await waitForMessage(ws2, 4, 2000);
        const dec = decoding.createDecoder(new Uint8Array(msg));
        decoding.readVarUint(dec);
        const json = JSON.parse(decoding.readVarString(dec));

        expect(json.event).toBe('room_state');
        const names = json.members.map(m => m.name);
        expect(names).toContain('Alice');
        expect(names).toContain('Bob');

        await closeClient(ws1);
        await closeClient(ws2);
    });
});

// -------------
// Yjs CRDT sync
// -------------
describe('Yjs CRDT sync', () => {
    it('broadcasts a Yjs update to other clients in the room', async () => {
        const roomId = crypto.randomUUID();

        const ws1 = await createWSClient(baseUrl, roomId, { name: 'Sender' });
        // Drain initial handshake
        await waitForMessage(ws1, 4, 2000);
        await waitForMessage(ws1, 0, 2000);

        const ws2 = await createWSClient(baseUrl, roomId, { name: 'Receiver' });
        await waitForMessage(ws1, 4, 2000); // user_joined for ws2
        await waitForMessage(ws2, 4, 2000);
        await waitForMessage(ws2, 0, 2000);

        // ws2 listens for a type-0 broadcast
        const broadcastPromise = waitForMessage(ws2, 0, 3000);

        // ws1 sends a Yjs state update
        const senderDoc = new Y.Doc();
        const shapes = senderDoc.getMap('shapes');
        shapes.set('new-rect', { type: 'rect', x: 5 });
        const update = Y.encodeStateAsUpdate(senderDoc);
        sendYjsUpdate(ws1, update);

        const received = await broadcastPromise;
        const dec = decoding.createDecoder(new Uint8Array(received));
        const msgType = decoding.readVarUint(dec);
        expect(msgType).toBe(0);

        await closeClient(ws1);
        await closeClient(ws2);
    });

    it('does not echo a Yjs update back to the sender', async () => {
        const roomId = crypto.randomUUID();

        const ws1 = await createWSClient(baseUrl, roomId, { name: 'Solo' });
        await waitForMessage(ws1, 4, 2000);
        await waitForMessage(ws1, 0, 2000);

        // Send an update and collect type-0 messages ws1 receives in a window
        const senderDoc = new Y.Doc();
        senderDoc.getMap('shapes').set('solo-shape', { type: 'circle' });
        const update = Y.encodeStateAsUpdate(senderDoc);

        const collectPromise = collectMessages(ws1, 0, 500);
        sendYjsUpdate(ws1, update);
        const received = await collectPromise;

        // The server might send a sync reply (step 2) but it should NOT be an update broadcast
        // The response, if any, should be sync step 2 protocol response
        // For a solo client there should be no extra update broadcast echoed back
        // (sync replies are allowed because they contain state for the server's doc)
        expect(received.length).toBeLessThanOrEqual(1);

        await closeClient(ws1);
    });
});

// ------------------------------------------
// Locked session: type-0 writes are rejected
// ------------------------------------------
describe('Locked session handling', () => {
    it('sends session_locked event when a type-0 update is sent to a locked room', async () => {
        const roomId = crypto.randomUUID();

        // Create a Canvas document with is_locked: true
        const user = await new User({
            email: `lock-owner-${crypto.randomUUID()}@test.com`,
            displayName: 'LockOwner',
            authProvider: 'local',
            password: 'Secret@123',
        }).save();

        await new Canvas({ _id: roomId, name: 'Locked Canvas', owner: user._id, is_locked: true }).save();

        const ws = await createWSClient(baseUrl, roomId);
        await waitForMessage(ws, 4, 2000); // room_state
        await waitForMessage(ws, 0, 2000); // sync step 1

        // Send a Yjs update
        const doc = new Y.Doc();
        doc.getMap('shapes').set('blocked', { type: 'rect' });
        const update = Y.encodeStateAsUpdate(doc);
        sendYjsUpdate(ws, update);

        // Expect a type-4 presence event with session_locked
        const msg = await waitForMessage(ws, 4, 3000);
        const dec = decoding.createDecoder(new Uint8Array(msg));
        decoding.readVarUint(dec);
        const json = JSON.parse(decoding.readVarString(dec));

        expect(json.event).toBe('session_locked');
        expect(json.message).toMatch(/locked/i);

        await closeClient(ws);
    });

    it('does NOT send session_locked for an unlocked room', async () => {
        const roomId = crypto.randomUUID();

        const ws1 = await createWSClient(baseUrl, roomId, { name: 'Writer' });
        await waitForMessage(ws1, 4, 2000);
        await waitForMessage(ws1, 0, 2000);

        const ws2 = await createWSClient(baseUrl, roomId, { name: 'Observer' });
        await waitForMessage(ws1, 4, 2000); // joined event
        await waitForMessage(ws2, 4, 2000);
        await waitForMessage(ws2, 0, 2000);

        // Send Yjs update
        const doc = new Y.Doc();
        doc.getMap('shapes').set('allowed-shape', { type: 'rect' });
        sendYjsUpdate(ws1, Y.encodeStateAsUpdate(doc));

        // Collect type-4 messages received by ws1 in short window - no session_locked expected
        const type4Messages = await collectMessages(ws1, 4, 600);
        const lockMessages = type4Messages.filter(msg => {
            try {
                const dec = decoding.createDecoder(new Uint8Array(msg));
                decoding.readVarUint(dec);
                const json = JSON.parse(decoding.readVarString(dec));
                return json.event === 'session_locked';
            } catch { return false; }
        });
        expect(lockMessages).toHaveLength(0);

        await closeClient(ws1);
        await closeClient(ws2);
    });
});

// --------------------------------------------------
// Property updates (type 3): validation before relay
// --------------------------------------------------
describe('Property update (type 3) validation', () => {
    it('relays a valid property update to other clients', async () => {
        const roomId = crypto.randomUUID();

        const ws1 = await createWSClient(baseUrl, roomId, { name: 'Sender' });
        await waitForMessage(ws1, 4, 2000);
        await waitForMessage(ws1, 0, 2000);

        const ws2 = await createWSClient(baseUrl, roomId, { name: 'Receiver' });
        await waitForMessage(ws1, 4, 2000);
        await waitForMessage(ws2, 4, 2000);
        await waitForMessage(ws2, 0, 2000);

        const receivedPromise = waitForMessage(ws2, 3, 3000);

        sendPropertyUpdate(ws1, {
            objectId: 'shape-001',
            type: 'resize',
            properties: { width: 200, height: 100 },
        });

        const msg = await receivedPromise;
        const dec = decoding.createDecoder(new Uint8Array(msg));
        const type = decoding.readVarUint(dec);
        expect(type).toBe(3);

        const payloadBytes = decoding.readVarUint8Array(dec);
        const data = JSON.parse(new TextDecoder().decode(payloadBytes));
        expect(data.objectId).toBe('shape-001');
        expect(data.type).toBe('resize');
        expect(data.properties.width).toBe(200);

        await closeClient(ws1);
        await closeClient(ws2);
    });

    it('drops an invalid property update (does not relay to peers)', async () => {
        const roomId = crypto.randomUUID();

        const ws1 = await createWSClient(baseUrl, roomId, { name: 'BadSender' });
        await waitForMessage(ws1, 4, 2000);
        await waitForMessage(ws1, 0, 2000);

        const ws2 = await createWSClient(baseUrl, roomId, { name: 'Peer' });
        await waitForMessage(ws1, 4, 2000);
        await waitForMessage(ws2, 4, 2000);
        await waitForMessage(ws2, 0, 2000);

        // Send an invalid property update (missing objectId)
        sendPropertyUpdate(ws1, {
            objectId: '', // invalid: empty string
            type: 'resize',
            properties: { width: 200 },
        });

        // ws2 should NOT receive any type-3 message within 600ms
        const type3Messages = await collectMessages(ws2, 3, 600);
        expect(type3Messages).toHaveLength(0);

        await closeClient(ws1);
        await closeClient(ws2);
    });

    it('drops a property update with unknown type', async () => {
        const roomId = crypto.randomUUID();

        const ws1 = await createWSClient(baseUrl, roomId, { name: 'BadType' });
        await waitForMessage(ws1, 4, 2000);
        await waitForMessage(ws1, 0, 2000);

        const ws2 = await createWSClient(baseUrl, roomId, { name: 'Peer' });
        await waitForMessage(ws1, 4, 2000);
        await waitForMessage(ws2, 4, 2000);
        await waitForMessage(ws2, 0, 2000);

        sendPropertyUpdate(ws1, {
            objectId: 'obj-123',
            type: 'delete', // not in ALLOWED_TYPES
            properties: {},
        });

        const type3Messages = await collectMessages(ws2, 3, 600);
        expect(type3Messages).toHaveLength(0);

        await closeClient(ws1);
        await closeClient(ws2);
    });

    it('relays a valid move property update (move has no TYPE_VALIDATOR)', async () => {
        const roomId = crypto.randomUUID();

        const ws1 = await createWSClient(baseUrl, roomId, { name: 'Mover' });
        await waitForMessage(ws1, 4, 2000);
        await waitForMessage(ws1, 0, 2000);

        const ws2 = await createWSClient(baseUrl, roomId, { name: 'Watcher' });
        await waitForMessage(ws1, 4, 2000);
        await waitForMessage(ws2, 4, 2000);
        await waitForMessage(ws2, 0, 2000);

        const receivedPromise = waitForMessage(ws2, 3, 3000);

        sendPropertyUpdate(ws1, {
            objectId: 'shape-move-001',
            type: 'move',
            properties: { x: 10, y: 20 },
        });

        const msg = await receivedPromise;
        const dec = decoding.createDecoder(new Uint8Array(msg));
        decoding.readVarUint(dec);
        const payloadBytes = decoding.readVarUint8Array(dec);
        const data = JSON.parse(new TextDecoder().decode(payloadBytes));

        expect(data.type).toBe('move');
        expect(data.objectId).toBe('shape-move-001');

        await closeClient(ws1);
        await closeClient(ws2);
    });
});
