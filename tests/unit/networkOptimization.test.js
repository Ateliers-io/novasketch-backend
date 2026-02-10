/**
 * Unit Tests for User Story 3.4: Network Optimization
 * 
 * Tests cover:
 * - 3.4.1: Optimistic UI updates (draw immediately, sync later)
 * - 3.4.2: Message batching (grouping multiple updates into one packet)
 * 
 * Backend responsibilities:
 * - Efficient message relay (excluding sender to prevent echo)
 * - Debounced persistence to reduce DB writes
 * - Handling rapid sequential updates
 * - Ephemeral message broadcasting (Type 2)
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as Y from 'yjs';
import { encoding, decoding } from 'lib0';

describe('User Story 3.4: Network Optimization', () => {

    // =========================================================================
    // 3.4.1: Optimistic UI Updates
    // =========================================================================
    describe('3.4.1 - Optimistic UI Updates (Draw Immediately, Sync Later)', () => {

        describe('Ephemeral Message Encoding (Type 2)', () => {
            it('should encode ephemeral position update as Type 2 message', () => {
                const encoder = encoding.createEncoder();
                const positionUpdate = {
                    objectId: 'shape-123',
                    x: 150,
                    y: 200,
                    isDragging: true
                };
                const payloadBytes = new TextEncoder().encode(JSON.stringify(positionUpdate));

                encoding.writeVarUint(encoder, 2); // Message type: Ephemeral
                encoding.writeVarUint8Array(encoder, payloadBytes);

                const data = encoding.toUint8Array(encoder);

                // Decode and verify
                const decoder = decoding.createDecoder(data);
                const messageType = decoding.readVarUint(decoder);
                const decodedBytes = decoding.readVarUint8Array(decoder);
                const decodedPayload = JSON.parse(new TextDecoder().decode(decodedBytes));

                expect(messageType).toBe(2);
                expect(decodedPayload.objectId).toBe('shape-123');
                expect(decodedPayload.x).toBe(150);
                expect(decodedPayload.y).toBe(200);
                expect(decodedPayload.isDragging).toBe(true);
            });

            it('should encode cursor position for real-time tracking', () => {
                const encoder = encoding.createEncoder();
                const cursorUpdate = {
                    userId: 'user-abc',
                    cursor: { x: 300, y: 400 },
                    color: '#FF5733'
                };
                const payloadBytes = new TextEncoder().encode(JSON.stringify(cursorUpdate));

                encoding.writeVarUint(encoder, 2);
                encoding.writeVarUint8Array(encoder, payloadBytes);

                const data = encoding.toUint8Array(encoder);

                const decoder = decoding.createDecoder(data);
                const messageType = decoding.readVarUint(decoder);
                const decodedBytes = decoding.readVarUint8Array(decoder);
                const decodedPayload = JSON.parse(new TextDecoder().decode(decodedBytes));

                expect(messageType).toBe(2);
                expect(decodedPayload.userId).toBe('user-abc');
                expect(decodedPayload.cursor.x).toBe(300);
                expect(decodedPayload.cursor.y).toBe(400);
            });

            it('should handle rapid sequential position updates', () => {
                const updates = [];

                // Simulate rapid updates (like mouse move events)
                for (let i = 0; i < 100; i++) {
                    const encoder = encoding.createEncoder();
                    const positionUpdate = {
                        objectId: 'shape-moving',
                        x: i * 5,
                        y: i * 3,
                        timestamp: Date.now()
                    };
                    const payloadBytes = new TextEncoder().encode(JSON.stringify(positionUpdate));

                    encoding.writeVarUint(encoder, 2);
                    encoding.writeVarUint8Array(encoder, payloadBytes);

                    updates.push(encoding.toUint8Array(encoder));
                }

                expect(updates.length).toBe(100);

                // Verify all messages are valid
                updates.forEach((data, index) => {
                    const decoder = decoding.createDecoder(data);
                    const messageType = decoding.readVarUint(decoder);
                    const decodedBytes = decoding.readVarUint8Array(decoder);
                    const payload = JSON.parse(new TextDecoder().decode(decodedBytes));

                    expect(messageType).toBe(2);
                    expect(payload.x).toBe(index * 5);
                    expect(payload.y).toBe(index * 3);
                });
            });
        });

        describe('Yjs Optimistic Updates', () => {
            it('should apply local update immediately before sync', () => {
                const doc = new Y.Doc();
                const shapes = doc.getMap('shapes');

                // Simulate optimistic update
                const beforeUpdate = performance.now();
                shapes.set('optimistic-shape', { x: 0, y: 0, pending: true });
                const afterUpdate = performance.now();

                // Local update should be immediate (< 1ms)
                expect(afterUpdate - beforeUpdate).toBeLessThan(5);
                expect(shapes.get('optimistic-shape')).toBeDefined();
            });

            it('should track pending state for optimistic updates', () => {
                const doc = new Y.Doc();
                const shapes = doc.getMap('shapes');

                // Add shape with pending state
                shapes.set('shape-1', { x: 100, y: 100, synced: false });

                // Verify pending state exists
                expect(shapes.get('shape-1').synced).toBe(false);

                // Simulate sync confirmation
                shapes.set('shape-1', { x: 100, y: 100, synced: true });

                expect(shapes.get('shape-1').synced).toBe(true);
            });

            it('should handle concurrent optimistic updates from multiple sources', () => {
                const doc1 = new Y.Doc();
                const doc2 = new Y.Doc();

                // Initial sync
                Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

                const shapes1 = doc1.getMap('shapes');
                const shapes2 = doc2.getMap('shapes');

                // Both clients make optimistic updates simultaneously
                shapes1.set('shape-local-1', { from: 'client1', optimistic: true });
                shapes2.set('shape-local-2', { from: 'client2', optimistic: true });

                // Both should have their local state immediately
                expect(shapes1.get('shape-local-1')).toBeDefined();
                expect(shapes2.get('shape-local-2')).toBeDefined();

                // After sync, both have all updates
                const u1 = Y.encodeStateAsUpdate(doc1);
                const u2 = Y.encodeStateAsUpdate(doc2);
                Y.applyUpdate(doc1, u2);
                Y.applyUpdate(doc2, u1);

                expect(shapes1.size).toBe(2);
                expect(shapes2.size).toBe(2);
            });
        });
    });

    // =========================================================================
    // 3.4.2: Message Batching
    // =========================================================================
    describe('3.4.2 - Message Batching (Multiple Updates in One Packet)', () => {

        describe('Batch Encoding', () => {
            it('should encode multiple updates into a single Yjs transaction', () => {
                const doc = new Y.Doc();
                const shapes = doc.getMap('shapes');

                let updateCount = 0;
                doc.on('update', () => {
                    updateCount++;
                });

                // Batch multiple operations in a single transaction
                doc.transact(() => {
                    shapes.set('batch-1', { type: 'rect' });
                    shapes.set('batch-2', { type: 'circle' });
                    shapes.set('batch-3', { type: 'line' });
                });

                // Should emit only ONE update event for the entire transaction
                expect(updateCount).toBe(1);
                expect(shapes.size).toBe(3);
            });

            it('should produce smaller payload when batching vs individual updates', () => {
                // Individual updates
                const doc1 = new Y.Doc();
                const shapes1 = doc1.getMap('shapes');

                shapes1.set('shape-1', { x: 10 });
                const update1a = Y.encodeStateAsUpdate(doc1);
                shapes1.set('shape-2', { x: 20 });
                const update1b = Y.encodeStateAsUpdate(doc1);
                shapes1.set('shape-3', { x: 30 });
                const update1c = Y.encodeStateAsUpdate(doc1);

                const individualSize = update1a.length + update1b.length + update1c.length;

                // Batched update
                const doc2 = new Y.Doc();
                const shapes2 = doc2.getMap('shapes');

                doc2.transact(() => {
                    shapes2.set('shape-1', { x: 10 });
                    shapes2.set('shape-2', { x: 20 });
                    shapes2.set('shape-3', { x: 30 });
                });

                const batchedSize = Y.encodeStateAsUpdate(doc2).length;

                // Batched should be more efficient (or at least not larger)
                // Note: Due to CRDT overhead, comparison may vary, but batching reduces update events
                expect(batchedSize).toBeLessThanOrEqual(individualSize);
            });

            it('should batch property updates into single message', () => {
                const encoder = encoding.createEncoder();

                const batchedUpdates = {
                    type: 'batch',
                    updates: [
                        { objectId: 'shape-1', properties: { x: 100, y: 100 } },
                        { objectId: 'shape-2', properties: { x: 200, y: 200 } },
                        { objectId: 'shape-3', properties: { x: 300, y: 300 } }
                    ]
                };

                const payloadBytes = new TextEncoder().encode(JSON.stringify(batchedUpdates));

                encoding.writeVarUint(encoder, 3); // Property update type
                encoding.writeVarUint8Array(encoder, payloadBytes);

                const data = encoding.toUint8Array(encoder);

                // Decode
                const decoder = decoding.createDecoder(data);
                const messageType = decoding.readVarUint(decoder);
                const decodedBytes = decoding.readVarUint8Array(decoder);
                const decodedPayload = JSON.parse(new TextDecoder().decode(decodedBytes));

                expect(messageType).toBe(3);
                expect(decodedPayload.type).toBe('batch');
                expect(decodedPayload.updates.length).toBe(3);
                expect(decodedPayload.updates[0].objectId).toBe('shape-1');
                expect(decodedPayload.updates[2].properties.x).toBe(300);
            });
        });

        describe('Debounced Persistence', () => {
            it('should debounce multiple rapid updates into single save', async () => {
                let saveCount = 0;
                let lastSaveTime = 0;

                // Simulate debounced save function
                const DEBOUNCE_MS = 100; // Using shorter time for testing
                let saveTimer = null;

                const saveToDB = () => {
                    if (saveTimer) clearTimeout(saveTimer);
                    saveTimer = setTimeout(() => {
                        saveCount++;
                        lastSaveTime = Date.now();
                    }, DEBOUNCE_MS);
                };

                // Simulate rapid updates
                for (let i = 0; i < 10; i++) {
                    saveToDB();
                    await new Promise(r => setTimeout(r, 20)); // 20ms between updates
                }

                // Wait for debounce to complete
                await new Promise(r => setTimeout(r, DEBOUNCE_MS + 50));

                // Should only have saved once due to debouncing
                expect(saveCount).toBe(1);
            });

            it('should batch Yjs updates before persisting', () => {
                const doc = new Y.Doc();
                const shapes = doc.getMap('shapes');

                const updates = [];
                doc.on('update', (update) => {
                    updates.push(update);
                });

                // Multiple rapid operations
                shapes.set('s1', { data: 1 });
                shapes.set('s2', { data: 2 });
                shapes.set('s3', { data: 3 });

                // Get final state for persistence
                const finalState = Y.encodeStateAsUpdate(doc);

                // Verify final state contains all updates
                const newDoc = new Y.Doc();
                Y.applyUpdate(newDoc, finalState);
                const newShapes = newDoc.getMap('shapes');

                expect(newShapes.size).toBe(3);
                expect(newShapes.get('s1')).toBeDefined();
                expect(newShapes.get('s2')).toBeDefined();
                expect(newShapes.get('s3')).toBeDefined();
            });
        });

        describe('Broadcast Optimization', () => {
            it('should simulate broadcast to multiple clients', () => {
                const clients = new Set();
                const senderClient = { id: 'sender', messages: [] };

                // Add clients
                for (let i = 0; i < 5; i++) {
                    clients.add({ id: `client-${i}`, messages: [] });
                }
                clients.add(senderClient);

                // Broadcast function (excluding sender)
                const broadcastToRoom = (message, excludeClient) => {
                    let sentCount = 0;
                    clients.forEach(client => {
                        if (client !== excludeClient) {
                            client.messages.push(message);
                            sentCount++;
                        }
                    });
                    return sentCount;
                };

                // Send message
                const messageSent = broadcastToRoom({ type: 'update', data: 'test' }, senderClient);

                // Verify sender didn't receive (prevents echo)
                expect(senderClient.messages.length).toBe(0);

                // Verify all others received
                expect(messageSent).toBe(5); // 6 total - 1 sender = 5
                clients.forEach(client => {
                    if (client !== senderClient) {
                        expect(client.messages.length).toBe(1);
                    }
                });
            });

            it('should handle empty room broadcast gracefully', () => {
                const clients = new Set();

                const broadcastToRoom = (message, excludeClient) => {
                    let sentCount = 0;
                    clients.forEach(client => {
                        if (client !== excludeClient) {
                            sentCount++;
                        }
                    });
                    return sentCount;
                };

                // Broadcast to empty room
                const messageSent = broadcastToRoom({ type: 'update' }, null);

                expect(messageSent).toBe(0);
            });

            it('should calculate efficient message size for batch updates', () => {
                // Single update message
                const singleEncoder = encoding.createEncoder();
                const singleUpdate = { objectId: 'shape-1', x: 100, y: 100 };
                encoding.writeVarUint(singleEncoder, 2);
                encoding.writeVarUint8Array(singleEncoder, new TextEncoder().encode(JSON.stringify(singleUpdate)));
                const singleSize = encoding.toUint8Array(singleEncoder).length;

                // Batch of 5 similar updates
                const batchEncoder = encoding.createEncoder();
                const batchUpdates = [];
                for (let i = 0; i < 5; i++) {
                    batchUpdates.push({ objectId: `shape-${i}`, x: i * 100, y: i * 100 });
                }
                encoding.writeVarUint(batchEncoder, 2);
                encoding.writeVarUint8Array(batchEncoder, new TextEncoder().encode(JSON.stringify(batchUpdates)));
                const batchSize = encoding.toUint8Array(batchEncoder).length;

                // 5 individual messages would be ~5x the size
                const fiveIndividualSize = singleSize * 5;

                // Batch should be significantly smaller than 5 individual messages
                expect(batchSize).toBeLessThan(fiveIndividualSize);
            });
        });
    });

    // =========================================================================
    // Message Type Validation
    // =========================================================================
    describe('Network Message Type Handling', () => {

        it('should differentiate between message types correctly', () => {
            const messageTypes = {
                SYNC: 0,
                AWARENESS: 1,
                EPHEMERAL: 2,
                PROPERTY_UPDATE: 3
            };

            Object.entries(messageTypes).forEach(([name, type]) => {
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, type);
                encoding.writeVarString(encoder, `Test ${name}`);

                const data = encoding.toUint8Array(encoder);
                const decoder = decoding.createDecoder(data);
                const decodedType = decoding.readVarUint(decoder);

                expect(decodedType).toBe(type);
            });
        });

        it('should handle message with empty payload', () => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 2); // Ephemeral type
            encoding.writeVarUint8Array(encoder, new Uint8Array(0)); // Empty payload

            const data = encoding.toUint8Array(encoder);

            const decoder = decoding.createDecoder(data);
            const messageType = decoding.readVarUint(decoder);
            const payload = decoding.readVarUint8Array(decoder);

            expect(messageType).toBe(2);
            expect(payload.length).toBe(0);
        });

        it('should handle large payload efficiently', () => {
            const encoder = encoding.createEncoder();

            // Create large payload (1000 position updates)
            const largePayload = [];
            for (let i = 0; i < 1000; i++) {
                largePayload.push({ id: `obj-${i}`, x: Math.random() * 1000, y: Math.random() * 1000 });
            }

            const payloadBytes = new TextEncoder().encode(JSON.stringify(largePayload));

            encoding.writeVarUint(encoder, 2);
            encoding.writeVarUint8Array(encoder, payloadBytes);

            const data = encoding.toUint8Array(encoder);

            // Verify it can be decoded
            const decoder = decoding.createDecoder(data);
            const messageType = decoding.readVarUint(decoder);
            const decodedBytes = decoding.readVarUint8Array(decoder);
            const decodedPayload = JSON.parse(new TextDecoder().decode(decodedBytes));

            expect(messageType).toBe(2);
            expect(decodedPayload.length).toBe(1000);
            expect(decodedPayload[0].id).toBe('obj-0');
        });
    });
});
