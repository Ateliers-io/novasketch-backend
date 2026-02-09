/**
 * Jest Configuration for NovaSketch Backend
 * Configured for ES Modules support
 */
export default {
    // Use native ES modules
    testEnvironment: 'node',

    // Transform ES modules (not needed with --experimental-vm-modules)
    transform: {},

    // File extensions to consider
    moduleFileExtensions: ['js', 'mjs', 'json'],

    // Test file patterns
    testMatch: [
        '**/tests/**/*.test.js',
        '**/tests/**/*.spec.js'
    ],

    // Setup file for environment variables and global mocks
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

    // Coverage configuration
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/config/**',
        '!**/node_modules/**'
    ],

    // Ignore patterns
    testPathIgnorePatterns: ['/node_modules/'],

    // Verbose output for debugging
    verbose: true,

    // Clear mocks between tests
    clearMocks: true,

    // Restore mocks after each test
    restoreMocks: true
};
