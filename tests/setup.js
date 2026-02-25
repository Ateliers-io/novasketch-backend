// tests/setup.js: Jest global setup. Runs before every test file.
import 'dotenv/config';
import { jest } from '@jest/globals';

// Fake credentials for auth-related unit tests
process.env.JWT_SECRET = 'test-jwt-secret-key-for-unit-tests';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';

// Use test DB in Atlas for integration tests
// Credentials come from .env
if (process.env.MONGO_URI) {
    const url = new URL(process.env.MONGO_URI);
    url.pathname = '/novasketch-test';
    process.env.MONGO_URI = url.toString();
}


// Uncomment to silence console noise during test runs
// global.console = {
//   ...console,
//   log: jest.fn(),
//   error: jest.fn(),
//   warn: jest.fn(),
// };

jest.setTimeout(10000); // 10secs (some integration tests need time for DB operations)
