// redisPersistenceService.js - Periodic sync from Redis shape cache to MongoDB.
//
// Tracks "dirty" canvases and periodically flushes their Redis state to the 
// Room collection in MongoDB to ensure long-term persistence.
//
// Used by: server.js (start on boot, stop on shutdown)

import { redisClient } from "../config/redis.js";
import Room from "../models/Room.js";
import Canvas from "../models/Canvas.js";

// Set of canvas IDs that have been modified since the last sync
const dirtyCanvases = new Set();

let syncInterval = null;

/**
 * Mark a canvas as dirty so it gets synced on the next interval.
 * @param {string} canvasId
 */
export const markDirty = (canvasId) => {
    dirtyCanvases.add(canvasId);
};

/**
 * Sync a single canvas from Redis to MongoDB.
 * Reads all shapes from the Redis hash, stores them as a JSON blob
 * alongside the existing Yjs binary data in the Room document.
 *
 * @param {string} canvasId
 */
export const syncCanvasToMongo = async (canvasId) => {
    const key = `canvas:${canvasId}:shapes`;

    try {
        const raw = await redisClient.hgetall(key);

        if (!raw || Object.keys(raw).length === 0) {
            return;
        }

        // Parse shape values
        const shapes = {};
        for (const [id, json] of Object.entries(raw)) {
            try {
                shapes[id] = JSON.parse(json);
            } catch {
                shapes[id] = json;
            }
        }

        const shapeCount = Object.keys(shapes).length;

        await Room.findByIdAndUpdate(
            canvasId,
            {
                redisShapes: shapes,
                shapeCount,
            },
            { upsert: true }
        );

        await Canvas.findByIdAndUpdate(canvasId, { lastEditedAt: new Date() });

        console.log(`[Persistence] Synced ${shapeCount} shapes for canvas ${canvasId}`);
    } catch (err) {
        console.error(`[Persistence] Sync error for canvas ${canvasId}:`, err.message);
    }
};

/**
 * Start the periodic sync loop.
 * On each tick, only dirty canvases are synced, then the dirty set is cleared.
 *
 * @param {number} intervalMs - sync interval is 30 sec
 */
export const startPeriodicSync = (intervalMs = 30000) => {
    if (syncInterval) {
        clearInterval(syncInterval);
    }

    syncInterval = setInterval(async () => {
        if (dirtyCanvases.size === 0) return;

        const canvasIds = [...dirtyCanvases];
        dirtyCanvases.clear();

        console.log(`[Persistence] Syncing ${canvasIds.length} dirty canvas(es)`);

        for (const canvasId of canvasIds) {
            await syncCanvasToMongo(canvasId);
        }
    }, intervalMs);

    console.log(`[Persistence] Periodic sync started (every ${intervalMs / 1000}s)`);
};

/**
 * Stop the periodic sync loop.
 * Called during server shutdown or in test teardown.
 */
export const stopPeriodicSync = () => {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log("[Persistence] Periodic sync stopped");
    }
};
