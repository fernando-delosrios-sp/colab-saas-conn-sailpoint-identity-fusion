import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts', 'scripts/__tests__/**/*.test.cjs'],
        exclude: [
            'src/__tests__/test-config.ts',
            'src/operations/__tests__/fixtures/**',
            'src/operations/__tests__/harness/**',
            'src/operations/__tests__/scenario/**',
        ],
        environment: 'node',
        testTimeout: 180_000,
        pool: 'threads',
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
        },
    },
})
