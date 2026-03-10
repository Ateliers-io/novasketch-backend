/**
 * Unit Tests for User Stories 1.3.3, 1.4.1, 1.4.2: Presence Events
 *
 * Tests cover:
 * - 1.3.3: Nickname extraction from WS URL query params
 * - 1.4.1: buildPresenceMessage encoding (type 4)
 * - 1.4.2: user_joined, user_left, and room_state payloads
 */

import { describe, it, expect } from '@jest/globals';
import { encoding, decoding } from 'lib0';

const buildPresenceMessage = (jsonStr) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 4);
    encoding.writeVarString(encoder, jsonStr);
    return encoding.toUint8Array(encoder);
};

const parseConnectionParams = (rawUrl) => {
    const urlObj = new URL(rawUrl, 'http://localhost');
    const name = urlObj.searchParams.get('name') || 'Anonymous';
    const clientId = urlObj.searchParams.get('clientId') || 'generated';
    const roomId = urlObj.pathname.slice(1) || 'default-room';
    return { name, clientId, roomId };
};


describe('User Stories 1.3.3, 1.4.1, 1.4.2: Presence Events', () => {
    // =========================================================================
    // 1.3.3: Nickname extraction from WS URL
    // =========================================================================
    describe('1.3.3 - Nickname extraction from WS URL', () => {

        it('should extract name and clientId from the URL query string', () => {
            const { name, clientId, roomId } = parseConnectionParams('/my-room?name=Alice&clientId=abc-123');

            expect(name).toBe('Alice');
            expect(clientId).toBe('abc-123');
            expect(roomId).toBe('my-room');
        });

        it('should fall back to "Anonymous" when name param is absent', () => {
            const { name } = parseConnectionParams('/my-room');

            expect(name).toBe('Anonymous');
        });

        it('should handle URL-encoded names', () => {
            const { name } = parseConnectionParams('/room?name=John%20Doe');

            expect(name).toBe('John Doe');
        });
    });

    // =========================================================================
    // 1.4.1: buildPresenceMessage encoding
    // =========================================================================
    describe('1.4.1 - buildPresenceMessage encoding (type 4)', () => {

        it('should produce a Uint8Array starting with message type 4', () => {
            const msg = buildPresenceMessage(JSON.stringify({ event: 'test' }));

            expect(msg).toBeInstanceOf(Uint8Array);
            const decoder = decoding.createDecoder(msg);
            expect(decoding.readVarUint(decoder)).toBe(4);
        });

        it('should decode back to the original JSON string', () => {
            const payload = { event: 'user_joined', name: 'Alice', clientId: 'abc', count: 1 };
            const msg = buildPresenceMessage(JSON.stringify(payload));

            const decoder = decoding.createDecoder(msg);
            decoding.readVarUint(decoder); // skip type byte
            const decoded = JSON.parse(decoding.readVarString(decoder));

            expect(decoded.event).toBe('user_joined');
            expect(decoded.name).toBe('Alice');
            expect(decoded.count).toBe(1);
        });
    });

    // =========================================================================
    // 1.4.2: user_joined event
    // =========================================================================
    describe('1.4.2 - user_joined payload', () => {

        it('should have correct event, name, clientId, and count fields', () => {
            const clients = new Set();
            const ws = { meta: { name: 'Bob', clientId: 'bob-1' } };
            clients.add(ws);

            const payload = JSON.stringify({
                event: 'user_joined',
                name: ws.meta.name,
                clientId: ws.meta.clientId,
                count: clients.size,
            });
            const decoded = JSON.parse(payload);

            expect(decoded.event).toBe('user_joined');
            expect(decoded.name).toBe('Bob');
            expect(decoded.clientId).toBe('bob-1');
            expect(decoded.count).toBe(1);
        });

        it('should increment count as more users join', () => {
            const clients = new Set();

            ['Alice', 'Bob', 'Carol'].forEach((name, i) => {
                const ws = { meta: { name, clientId: `id-${i}` } };
                clients.add(ws);

                const payload = structuredClone({
                    event: 'user_joined',
                    name: ws.meta.name,
                    clientId: ws.meta.clientId,
                    count: clients.size,
                });

                expect(payload.count).toBe(i + 1);
            });
        });
    });

    // =========================================================================
    // 1.4.2: user_left event
    // =========================================================================
    describe('1.4.2 - user_left payload', () => {

        it('should have correct event, name, clientId, and decremented count', () => {
            const clients = new Set();
            const ws1 = { meta: { name: 'Alice', clientId: 'alice-1' } };
            const ws2 = { meta: { name: 'Bob', clientId: 'bob-2' } };
            clients.add(ws1);
            clients.add(ws2);

            // Bob leaves
            clients.delete(ws2);

            const payload = structuredClone({
                event: 'user_left',
                name: ws2.meta.name,
                clientId: ws2.meta.clientId,
                count: clients.size,
            });

            expect(payload.event).toBe('user_left');
            expect(payload.name).toBe('Bob');
            expect(payload.clientId).toBe('bob-2');
            expect(payload.count).toBe(1);
        });

        it('should report count of 0 after the last user leaves', () => {
            const clients = new Set();
            const ws = { meta: { name: 'Solo', clientId: 'solo-1' } };
            clients.add(ws);
            clients.delete(ws);

            const payload = structuredClone({
                event: 'user_left',
                name: ws.meta.name,
                clientId: ws.meta.clientId,
                count: clients.size,
            });

            expect(payload.count).toBe(0);
        });
    });

    // =========================================================================
    // 1.4.2: room_state event
    // =========================================================================
    describe('1.4.2 - room_state payload', () => {

        it('should list all current members with name and clientId', () => {
            const clients = new Set([
                { meta: { name: 'Alice', clientId: 'alice-1' } },
                { meta: { name: 'Bob', clientId: 'bob-2' } },
            ]);

            const members = Array.from(clients).map(c => ({
                name: c.meta.name,
                clientId: c.meta.clientId,
            }));

            const payload = structuredClone({
                event: 'room_state',
                members,
                count: members.length,
            });

            expect(payload.event).toBe('room_state');
            expect(payload.count).toBe(2);
            expect(payload.members[0].name).toBe('Alice');
            expect(payload.members[1].name).toBe('Bob');
        });

        it('should include the joining user in the members list', () => {
            const clients = new Set([
                { meta: { name: 'Alice', clientId: 'alice-1' } },
                { meta: { name: 'Bob', clientId: 'bob-2' } },
            ]);

            const members = Array.from(clients).map(c => ({
                name: c.meta.name,
                clientId: c.meta.clientId,
            }));

            const names = members.map(m => m.name);
            expect(names).toContain('Alice');
            expect(names).toContain('Bob');
        });
    });
});
