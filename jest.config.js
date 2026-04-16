module.exports = {
    preset: 'ts-jest',
    testTimeout: 180000,
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.+(ts|tsx|js)', '**/?(*.)+(spec|test).+(ts|tsx|js)'],
    testPathIgnorePatterns: [
        '<rootDir>/src/__tests__/test-config.ts',
        '<rootDir>/src/operations/__tests__/fixtures/',
        '<rootDir>/src/operations/__tests__/harness/',
    ],
    // Allow Jest to transform ESM-only packages (e.g. double-metaphone) via Babel
    transformIgnorePatterns: ['node_modules/(?!(double-metaphone)/)'],
    transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest',
        '^.+\\.js$': 'babel-jest',
    },
}
