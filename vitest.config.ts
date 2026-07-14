import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
        exclude: [
            'src/__tests__/test-config.ts',
            'src/operations/__tests__/fixtures/**',
            'src/operations/__tests__/harness/**',
            'src/operations/__tests__/chain/framework/**',
            'src/operations/__tests__/chain/harness/**',
            'src/operations/__tests__/chain/data/**',
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
