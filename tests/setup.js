// tests/setup.js: Jest global setup. Runs before every test file.
//
// We mock all env variables here because test isolation matters.

import { jest } from '@jest/globals';

// Fake credentials
process.env.JWT_SECRET = 'test-jwt-secret-key-for-unit-tests';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.MONGO_URI = 'mongodb://localhost:27017/novasketch-test';

// Uncomment to silence console noise during test runs
// global.console = {
//   ...console,
//   log: jest.fn(),
//   error: jest.fn(),
//   warn: jest.fn(),
// };

jest.setTimeout(10000); // 10secs (some integration tests need time for DB operations)
