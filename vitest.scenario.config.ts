import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: ['src/operations/__tests__/scenario/**/*.test.ts'],
        environment: 'node',
        testTimeout: 180_000,
        pool: 'threads',
        globals: true,
    },
})
