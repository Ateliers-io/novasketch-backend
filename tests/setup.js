/**
 * Jest Test Setup File
 * Sets up environment variables and global mocks for tests
 */

import { jest } from '@jest/globals';

// Mock environment variables for testing
process.env.JWT_SECRET = 'test-jwt-secret-key-for-unit-tests';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.MONGO_URI = 'mongodb://localhost:27017/novasketch-test';

// Silence console logs during tests (comment out for debugging)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   error: jest.fn(),
//   warn: jest.fn(),
// };

// Global test timeout (10 seconds)
jest.setTimeout(10000);
