/**
 * Unit Tests for User Story 3.3: Concurrent Editing (Conflict Resolution)
 * 
 * Tests cover:
 * - 3.3.1: Yjs CRDT synchronization strategy
 * - 3.3.2: Conflict resolution logic (validation, update relay)
 * - 3.3.3: Unique ID validation for object identification
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import { encoding, decoding } from 'lib0';
import { validatePropertyUpdate } from '../../src/utils/validation.js';

describe('User Story 3.3: Concurrent Editing (Conflict Resolution)', () => {

    // =========================================================================
    // 3.3.1: CRDT Synchronization Strategy (Yjs)
    // =========================================================================
    describe('3.3.1 - Yjs CRDT Synchronization', () => {

        it('should create a Yjs document with shared types', () => {
            const doc = new Y.Doc();
            const shapes = doc.getMap('shapes');
            const lines = doc.getArray('lines');

            expect(shapes).toBeDefined();
            expect(lines).toBeDefined();
            expect(shapes instanceof Y.Map).toBe(true);
            expect(lines instanceof Y.Array).toBe(true);
        });

        it('should apply updates to a Yjs document (CRDT merge)', () => {
            // Simulate two clients making concurrent edits
            const doc1 = new Y.Doc();
            const doc2 = new Y.Doc();

            const shapes1 = doc1.getMap('shapes');
            const shapes2 = doc2.getMap('shapes');

            // Client 1 adds a rectangle
            shapes1.set('rect-1', { type: 'rectangle', x: 10, y: 20 });

            // Client 2 adds a circle (concurrently)
            shapes2.set('circle-1', { type: 'circle', x: 50, y: 50 });

            // Get updates from both docs
            const update1 = Y.encodeStateAsUpdate(doc1);
            const update2 = Y.encodeStateAsUpdate(doc2);

            // Apply cross-updates (simulate server relay)
            Y.applyUpdate(doc1, update2);
            Y.applyUpdate(doc2, update1);

            // Both docs should now have both shapes (CRDT conflict resolution)
            expect(shapes1.get('rect-1')).toBeDefined();
            expect(shapes1.get('circle-1')).toBeDefined();
            expect(shapes2.get('rect-1')).toBeDefined();
            expect(shapes2.get('circle-1')).toBeDefined();
        });

        it('should preserve both edits when concurrent updates occur on different keys', () => {
            const doc1 = new Y.Doc();
            const doc2 = new Y.Doc();

            // Sync initial state
            const initialUpdate = Y.encodeStateAsUpdate(doc1);
            Y.applyUpdate(doc2, initialUpdate);

            const shapes1 = doc1.getMap('shapes');
            const shapes2 = doc2.getMap('shapes');

            // Concurrent edits on different keys
            shapes1.set('shape-A', { color: 'red' });
            shapes2.set('shape-B', { color: 'blue' });

            // Exchange updates
            const u1 = Y.encodeStateAsUpdate(doc1);
            const u2 = Y.encodeStateAsUpdate(doc2);
            Y.applyUpdate(doc1, u2);
            Y.applyUpdate(doc2, u1);

            // Assert: Both shapes exist in both docs
            expect(shapes1.size).toBe(2);
            expect(shapes2.size).toBe(2);
            expect(shapes1.get('shape-A').color).toBe('red');
            expect(shapes1.get('shape-B').color).toBe('blue');
        });

        it('should use "last writer wins" for concurrent updates on same key', () => {
            const doc1 = new Y.Doc();
            const doc2 = new Y.Doc();

            // Initial sync
            Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

            const shapes1 = doc1.getMap('shapes');
            const shapes2 = doc2.getMap('shapes');

            // Both clients edit the SAME key concurrently
            shapes1.set('shared-shape', { value: 'from-client-1' });
            shapes2.set('shared-shape', { value: 'from-client-2' });

            // Exchange updates
            const u1 = Y.encodeStateAsUpdate(doc1);
            const u2 = Y.encodeStateAsUpdate(doc2);
            Y.applyUpdate(doc1, u2);
            Y.applyUpdate(doc2, u1);

            // Both docs converge to the same value (CRDT guarantees convergence)
            expect(shapes1.get('shared-shape')).toEqual(shapes2.get('shared-shape'));
        });

        it('should encode and decode document state correctly', () => {
            const doc = new Y.Doc();
            const shapes = doc.getMap('shapes');
            shapes.set('test-shape', { id: 'test-123', x: 100, y: 200 });

            // Encode state
            const encodedState = Y.encodeStateAsUpdate(doc);
            expect(encodedState).toBeInstanceOf(Uint8Array);
            expect(encodedState.length).toBeGreaterThan(0);

            // Decode into new document
            const newDoc = new Y.Doc();
            Y.applyUpdate(newDoc, encodedState);

            const newShapes = newDoc.getMap('shapes');
            expect(newShapes.get('test-shape')).toEqual({ id: 'test-123', x: 100, y: 200 });
        });
    });

    // =========================================================================
    // 3.3.2: Conflict Resolution Logic (Validation & Relay)
    // =========================================================================
    describe('3.3.2 - Property Update Validation (Server-side)', () => {

        // Happy Path: Valid payloads
        describe('Happy Path - Valid Payloads', () => {
            it('should accept valid resize payload', () => {
                const payload = {
                    objectId: 'shape-123',
                    type: 'resize',
                    properties: { width: 100, height: 50 }
                };

                const result = validatePropertyUpdate(payload);
                expect(result.valid).toBe(true);
                expect(result.error).toBeUndefined();
            });

            it('should accept valid rotate payload', () => {
                const payload = {
                    objectId: 'shape-456',
                    type: 'rotate',
                    properties: { rotation: 45.5 }
                };

                const result = validatePropertyUpdate(payload);
                expect(result.valid).toBe(true);
            });

            it('should accept valid update payload with scale', () => {
                const payload = {
                    objectId: 'shape-789',
                    type: 'update',
                    properties: { scaleX: 1.5, scaleY: 2.0 }
                };

                const result = validatePropertyUpdate(payload);
                expect(result.valid).toBe(true);
            });

            it('should accept payload without type (optional field)', () => {
                const payload = {
                    objectId: 'shape-abc',
                    properties: { width: 200 }
                };

                const result = validatePropertyUpdate(payload);
                expect(result.valid).toBe(true);
            });
        });

        // Edge Cases: Invalid payloads
        describe('Edge Cases - Invalid Payloads', () => {
            it('should reject payload with missing objectId', () => {
                const payload = {
                    type: 'resize',
                    properties: { width: 100 }
                };

                const result = validatePropertyUpdate(payload);
                expect(result.valid).toBe(false);
                expect(result.error).toContain('objectId');
            });

            it('should reject payload with empty objectId', () => {
                const payload = {
                    objectId: '   ',
                    type: 'resize',
                    properties: { width: 100 }
                };

                const result = validatePropertyUpdate(payload);
                expect(result.valid).toBe(false);
                expect(result.error).toContain('objectId');
            });

            it('should reject payload with invalid type', () => {
                const payload = {
                    objectId: 'shape-123',
                    type: 'delete', // Not in allowed list
                    properties: {}
                };

                const result = validatePropertyUpdate(payload);
                expect(result.valid).toBe(false);
                expect(result.error).toContain('Invalid type');
            });

            it('should reject payload with missing properties object', () => {
                const payload = {
                    objectId: 'shape-123',
                    type: 'resize'
                };

                const result = validatePropertyUpdate(payload);
                expect(result.valid).toBe(false);
                expect(result.error).toContain('properties');
            });

            it('should reject non-numeric width', () => {
                const payload = {
                    objectId: 'shape-123',
                    properties: { width: '100px' } // Should be number
                };

                const result = validatePropertyUpdate(payload);
                expect(result.valid).toBe(false);
                expect(result.error).toContain('width');
            });

            it('should reject negative width', () => {
                const payload = {
                    objectId: 'shape-123',
                    properties: { width: -50 }
                };

                const result = validatePropertyUpdate(payload);
                expect(result.valid).toBe(false);
                expect(result.error).toContain('positive');
            });

            it('should reject zero height', () => {
                const payload = {
                    objectId: 'shape-123',
                    properties: { height: 0 }
                };

                const result = validatePropertyUpdate(payload);
                expect(result.valid).toBe(false);
                expect(result.error).toContain('positive');
            });

            it('should reject null payload', () => {
                const result = validatePropertyUpdate(null);
                expect(result.valid).toBe(false);
            });

            it('should reject undefined payload', () => {
                const result = validatePropertyUpdate(undefined);
                expect(result.valid).toBe(false);
            });
        });
    });

    // =========================================================================
    // 3.3.3: Unique ID Generation / Validation
    // =========================================================================
    describe('3.3.3 - Unique ID Collision Prevention', () => {

        it('should correctly identify different objects by unique ID in Yjs Map', () => {
            const doc = new Y.Doc();
            const shapes = doc.getMap('shapes');

            // Add shapes with unique IDs
            shapes.set('uuid-1234', { name: 'Shape A' });
            shapes.set('uuid-5678', { name: 'Shape B' });
            shapes.set('uuid-9012', { name: 'Shape C' });

            expect(shapes.size).toBe(3);
            expect(shapes.get('uuid-1234').name).toBe('Shape A');
            expect(shapes.get('uuid-5678').name).toBe('Shape B');
            expect(shapes.get('uuid-9012').name).toBe('Shape C');
        });

        it('should overwrite shape when same ID is used (no collision)', () => {
            const doc = new Y.Doc();
            const shapes = doc.getMap('shapes');

            shapes.set('duplicate-id', { version: 1 });
            shapes.set('duplicate-id', { version: 2 }); // Same ID, different data

            expect(shapes.size).toBe(1);
            expect(shapes.get('duplicate-id').version).toBe(2);
        });

        it('should reject objectId that is not a string in validation', () => {
            const payload = {
                objectId: 12345, // Number instead of string
                properties: { width: 100 }
            };

            const result = validatePropertyUpdate(payload);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('objectId');
        });

        it('should accept UUID-style objectId', () => {
            const payload = {
                objectId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                type: 'resize',
                properties: { width: 100, height: 50 }
            };

            const result = validatePropertyUpdate(payload);
            expect(result.valid).toBe(true);
        });

        it('should accept nanoid-style objectId', () => {
            const payload = {
                objectId: 'V1StGXR8_Z5jdHi6B-myT',
                type: 'rotate',
                properties: { rotation: 90 }
            };

            const result = validatePropertyUpdate(payload);
            expect(result.valid).toBe(true);
        });
    });

    // =========================================================================
    // Sync Protocol Message Encoding (lib0)
    // =========================================================================
    describe('Sync Protocol Message Encoding', () => {

        it('should encode and decode message type correctly', () => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 0); // Message type: Sync
            encoding.writeVarString(encoder, 'test-payload');

            const data = encoding.toUint8Array(encoder);

            const decoder = decoding.createDecoder(data);
            const messageType = decoding.readVarUint(decoder);
            const payload = decoding.readVarString(decoder);

            expect(messageType).toBe(0);
            expect(payload).toBe('test-payload');
        });

        it('should encode property update as Type 3 message', () => {
            const encoder = encoding.createEncoder();
            const propertyUpdate = { objectId: 'test-id', type: 'resize', properties: { width: 200 } };
            const payloadBytes = new TextEncoder().encode(JSON.stringify(propertyUpdate));

            encoding.writeVarUint(encoder, 3); // Message type: Property Update
            encoding.writeVarUint8Array(encoder, payloadBytes);

            const data = encoding.toUint8Array(encoder);

            // Decode
            const decoder = decoding.createDecoder(data);
            const messageType = decoding.readVarUint(decoder);
            const decodedBytes = decoding.readVarUint8Array(decoder);
            const decodedPayload = JSON.parse(new TextDecoder().decode(decodedBytes));

            expect(messageType).toBe(3);
            expect(decodedPayload.objectId).toBe('test-id');
            expect(decodedPayload.properties.width).toBe(200);
        });
    });
});
