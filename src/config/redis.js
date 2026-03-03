// Redis connection via ioredis.
//
// Provides three client instances:
//   - redisClient : general data operations (HSET, HGETALL, HDEL, etc.)
//   - pubClient   : Redis Pub/Sub publisher
//   - subClient   : Redis Pub/Sub subscriber (duplicate of pubClient)
//
// All clients read from REDIS_URL (fallback: redis://localhost:6379).
// Called once at startup from server.js.

import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Creates a new ioredis client with standard error/reconnect logging.
 * @param {string} label — friendly name for log messages
 * @returns {Redis} configured ioredis instance
 */
const createClient = (label) => {
    const client = new Redis(REDIS_URL, {
        // Retry with exponential backoff, cap at 3 seconds
        retryStrategy(times) {
            const delay = Math.min(times * 200, 3000);
            console.log(`[Redis:${label}] Reconnecting in ${delay}ms (attempt ${times})`);
            return delay;
        },
        maxRetriesPerRequest: 3,
        lazyConnect: false,
    });

    client.on("connect", () => {
        console.log(`[Redis:${label}] Connected to ${REDIS_URL}`);
    });

    client.on("error", (err) => {
        console.error(`[Redis:${label}] Error: ${err.message}`);
    });

    client.on("close", () => {
        console.log(`[Redis:${label}] Connection closed`);
    });

    return client;
};

// General-purpose client for data operations (HSET, HGETALL, etc.)
export const redisClient = createClient("data");

// Separate dedicated connections for subscriber and publisher 
export const pubClient = createClient("pub");
export const subClient = createClient("sub");

/**
 * Close all Redis connections.
 * Use during server shutdown and in test teardown.
 */
export const closeRedisConnections = async () => {
    await Promise.allSettled([
        redisClient.quit(),
        pubClient.quit(),
        subClient.quit(),
    ]);
    console.log("[Redis] All connections closed");
};
