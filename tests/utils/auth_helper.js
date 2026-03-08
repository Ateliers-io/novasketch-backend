/**
 * Authentication test helper utilities.
 *
 * Simplifies creating authenticated users in integration tests.
 * Each call generates a unique email to avoid inter-test collisions.
 */

import request from 'supertest';

let counter = 0;

/**
 * Register a new user via the REST API and return their token + profile.
 * Generates a unique email on every call so tests stay isolated.
 *
 * @param {import('express').Application} app  - the Express app under test
 * @param {Partial<{ name: string, email: string, password: string }>} [overrides]
 * @returns {Promise<{ token: string, userId: string, user: object }>}
 */
export const registerAndLogin = async (app, overrides = {}) => {
    const id = ++counter;
    const defaults = {
        name: `TestUser${id}`,
        email: `testuser${id}@regression.test`,
        password: 'Password123!',
    };
    const userData = { ...defaults, ...overrides };

    const res = await request(app)
        .post('/api/auth/register')
        .send(userData);

    if (res.statusCode !== 201) {
        throw new Error(
            `registerAndLogin failed (${res.statusCode}): ${JSON.stringify(res.body)}`
        );
    }

    return {
        token: res.body.token,
        userId: res.body.user.id,
        user: res.body.user,
    };
};

/**
 * Returns the Authorization header object to pass to supertest's .set().
 * @param {string} token
 * @returns {{ Authorization: string }}
 */
export const getAuthHeaders = (token) => ({ Authorization: `Bearer ${token}` });
