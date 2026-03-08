/**
 * Jest Configuration for NovaSketch Backend
 * Configured for ES Modules support
 */
export default {
    // Use native ES modules
    testEnvironment: 'node',

    // Each test file gets its own isolated MongoDB database (see tests/utils/db_handler.js),
    // so suites can run in parallel without interfering with each other.
    maxWorkers: '50%',

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
    restoreMocks: true,

    // HTML Reporter for visual test reports
    reporters: [
        'default',
        ['jest-html-reporter', {
            pageTitle: 'NovaSketch Backend Tests',
            outputPath: './tests/reports/test-report.html',
            includeFailureMsg: true,
            includeSuiteFailure: true,
            dateFormat: 'yyyy-mm-dd HH:MM:ss'
        }]
    ]
};
