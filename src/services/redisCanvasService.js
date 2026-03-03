// redisCanvasService.js - Redis-backed shape cache layer.
//
// Uses Redis Hashes to store the current state of each canvas's shapes.
// Key pattern: canvas:{canvasId}:shapes
// Field: shapeId, Value: JSON-stringified shape data
//
// Every write refreshes a 24-hour TTL so idle canvases are auto-cleaned.
//
// Used by: server.js (WS handlers), redisPersistenceService.js (sync to Mongo)

import { redisClient } from "../config/redis.js";

const SHAPE_TTL_SECONDS = 86400; // 24 hours

/**
 * Build the Redis hash key for a canvas's shapes.
 * @param {string} canvasId
 * @returns {string}
 */
const shapeKey = (canvasId) => `canvas:${canvasId}:shapes`;

/**
 * Save/update a shape in the Redis hash.
 * Also refreshes the 24h TTL on the hash key.
 *
 * @param {string} canvasId
 * @param {string} shapeId
 * @param {object|string} shapeData - object will be JSON-stringified
 */
export const saveShape = async (canvasId, shapeId, shapeData) => {
    const key = shapeKey(canvasId);
    const value = typeof shapeData === "string"
        ? shapeData
        : JSON.stringify(shapeData);

    await redisClient.hset(key, shapeId, value);
    await redisClient.expire(key, SHAPE_TTL_SECONDS);
};

/**
 * Retrieve all shapes for a canvas.
 * Returns a plain object: { shapeId: parsedShapeData, ... }
 *
 * @param {string} canvasId
 * @returns {Promise<Record<string, object>>}
 */
export const getCanvasShapes = async (canvasId) => {
    const raw = await redisClient.hgetall(shapeKey(canvasId));
    const parsed = {};
    for (const [id, json] of Object.entries(raw)) {
        try {
            parsed[id] = JSON.parse(json);
        } catch {
            parsed[id] = json; // return raw string if not valid JSON
        }
    }
    return parsed;
};

/**
 * Delete a single shape from the canvas hash.
 *
 * @param {string} canvasId
 * @param {string} shapeId
 * @returns {Promise<number>} 1 if deleted, 0 if field didn't exist
 */
export const deleteShape = async (canvasId, shapeId) => {
    return redisClient.hdel(shapeKey(canvasId), shapeId);
};

/**
 * Delete the entire shape hash for a canvas (full cleanup).
 *
 * @param {string} canvasId
 * @returns {Promise<number>} 1 if deleted, 0 if key didn't exist
 */
export const deleteCanvas = async (canvasId) => {
    return redisClient.del(shapeKey(canvasId));
};
