import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    maxWorkers: 4,
    // SPI v1 builders run a ts.Program per call, which is materially slower
    // under v8 coverage on shared CI runners (Windows + Linux) than the
    // 5s vitest default. 15s comfortably covers any single buildSpi call;
    // tests that build twice carry their own per-test overrides.
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 85,
        lines: 75,
      },
    },
  },
})
