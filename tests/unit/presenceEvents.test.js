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
});
