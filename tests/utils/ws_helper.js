/**
 * WebSocket test helper utilities.
 *
 * Provides helpers for connecting WS clients and exchanging messages
 * using the same binary protocol as server.js:
 *   0 = Yjs sync
 *   1 = Awareness (cursor/presence)
 *   2 = Ephemeral broadcast (drag positions)
 *   3 = Property update (resize/rotate/etc.)
 *   4 = Presence event (user_joined / user_left / room_state)
 *   5 = Redis cached shapes (server → client only)
 */

import { WebSocket } from 'ws';
import * as syncProtocol from 'y-protocols/sync';
import { encoding, decoding } from 'lib0';

/**
 * Connect a WebSocket client to a test server room.
 * All received messages are stored in ws._msgQueue (a Buffer[]) so that
 * waitForMessage() can replay already-received messages and never miss a
 * message that arrived before a handler was registered.
 *
 * @param {string} serverUrl – base URL, e.g. 'ws://localhost:3456'
 * @param {string} roomId
 * @param {{ name?: string, clientId?: string }} [meta]
 * @returns {Promise<WebSocket>}
 */
export const createWSClient = (serverUrl, roomId, meta = {}) => {
    const params = new URLSearchParams();
    if (meta.name) params.set('name', meta.name);
    if (meta.clientId) params.set('clientId', meta.clientId);
    const query = params.toString() ? `?${params}` : '';
    const url = `${serverUrl}/${roomId}${query}`;

    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        ws._msgQueue = [];          // buffered messages not yet consumed
        ws._msgWaiters = [];        // pending { typeFilter, resolve, reject, timer }

        ws.on('message', (data) => {
            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);

            // Check if any pending waiter can consume this message
            for (let i = 0; i < ws._msgWaiters.length; i++) {
                const waiter = ws._msgWaiters[i];
                if (waiter.typeFilter === null) {
                    ws._msgWaiters.splice(i, 1);
                    clearTimeout(waiter.timer);
                    waiter.resolve(buf);
                    return;
                }
                const decoder = decoding.createDecoder(new Uint8Array(buf));
                const msgType = decoding.readVarUint(decoder);
                if (msgType === waiter.typeFilter) {
                    ws._msgWaiters.splice(i, 1);
                    clearTimeout(waiter.timer);
                    waiter.resolve(buf);
                    return;
                }
            }

            // No pending waiter matched, buffer the message
            ws._msgQueue.push(buf);
        });

        ws.on('open', () => resolve(ws));
        ws.on('error', reject);
    });
};

/**
 * Wait for the next message from a WebSocket whose first type byte matches.
 * Checks the message queue first (for messages that arrived early), then
 * registers a waiter for future messages.
 * Rejects after timeoutMs if no matching message arrives.
 * @param {WebSocket} ws
 * @param {number|null} typeFilter - match on this type byte; null = accept any
 * @param {number} [timeoutMs=3000]
 * @returns {Promise<Buffer>}
 */
export const waitForMessage = (ws, typeFilter = null, timeoutMs = 3000) => {
    // First, check the already-buffered queue
    for (let i = 0; i < ws._msgQueue.length; i++) {
        const buf = ws._msgQueue[i];
        if (typeFilter === null) {
            ws._msgQueue.splice(i, 1);
            return Promise.resolve(buf);
        }
        const decoder = decoding.createDecoder(new Uint8Array(buf));
        const msgType = decoding.readVarUint(decoder);
        if (msgType === typeFilter) {
            ws._msgQueue.splice(i, 1);
            return Promise.resolve(buf);
        }
    }

    // Not in queue, register a waiter for future messages
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const idx = ws._msgWaiters.findIndex(w => w.resolve === resolve);
            if (idx !== -1) ws._msgWaiters.splice(idx, 1);
            reject(new Error(`WS message timeout${typeFilter !== null ? ` (type ${typeFilter})` : ''}`));
        }, timeoutMs);

        ws._msgWaiters.push({ typeFilter, resolve, reject, timer });
    });
};

/**
 * Collect all messages of a given type received within a window (ms).
 * Drains the existing queue first, then listens for new messages.
 * @param {WebSocket} ws
 * @param {number|null} typeFilter
 * @param {number} [windowMs=400]
 * @returns {Promise<Buffer[]>}
 */
export const collectMessages = (ws, typeFilter, windowMs = 400) => {
    return new Promise((resolve) => {
        const collected = [];

        // Drain matching messages already in the queue
        ws._msgQueue = ws._msgQueue.filter((buf) => {
            if (typeFilter === null) {
                collected.push(buf);
                return false; // remove from queue
            }
            const decoder = decoding.createDecoder(new Uint8Array(buf));
            const msgType = decoding.readVarUint(decoder);
            if (msgType === typeFilter) {
                collected.push(buf);
                return false; // remove from queue
            }
            return true; // keep in queue
        });

        const handler = (data) => {
            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
            if (typeFilter === null) {
                collected.push(buf);
                return;
            }
            const decoder = decoding.createDecoder(new Uint8Array(buf));
            const msgType = decoding.readVarUint(decoder);
            if (msgType === typeFilter) collected.push(buf);
        };

        ws.on('message', handler);
        setTimeout(() => {
            ws.off('message', handler);
            resolve(collected);
        }, windowMs);
    });
};

/**
 * Send a Yjs binary update as a type-0 sync message.
 * @param {WebSocket} ws
 * @param {Uint8Array} update - Y.encodeStateAsUpdate() output
 */
export const sendYjsUpdate = (ws, update) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0); // type 0 = sync
    syncProtocol.writeUpdate(encoder, update);
    ws.send(encoding.toUint8Array(encoder));
};

/**
 * Send an awareness binary update as a type-1 message.
 * @param {WebSocket} ws
 * @param {Uint8Array} awarenessUpdate
 */
export const sendAwareness = (ws, awarenessUpdate) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 1); // type 1 = awareness
    encoding.writeVarUint8Array(encoder, awarenessUpdate);
    ws.send(encoding.toUint8Array(encoder));
};

/**
 * Send a property update message (type 3).
 * @param {WebSocket} ws
 * @param {{ objectId: string, type: string, properties: object }} payload
 */
export const sendPropertyUpdate = (ws, payload) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 3); // type 3 = property update
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    encoding.writeVarUint8Array(encoder, bytes);
    ws.send(encoding.toUint8Array(encoder));
};

/**
 * Cleanly close a WebSocket client, resolving once the close event fires.
 * @param {WebSocket} ws
 * @returns {Promise<void>}
 */
export const closeClient = (ws) => {
    return new Promise((resolve) => {
        if (ws.readyState === WebSocket.CLOSED) {
            resolve();
            return;
        }
        ws.once('close', resolve);
        ws.close();
    });
};
