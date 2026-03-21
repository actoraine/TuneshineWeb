import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'backend',
          include: ['tests/backend/**/*.test.js'],
          environment: 'node'
        }
      },
      {
        test: {
          name: 'frontend',
          include: ['tests/frontend/**/*.test.js'],
          environment: 'jsdom'
        }
      }
    ],
    coverage: {
      provider: 'v8',
      enabled: true,
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      include: [
        'src/backend/app.js',
        'src/backend/config.js',
        'src/backend/openapi.js',
        'src/backend/tuneshineClient.js',
        'src/backend/connectivity/**/*.js',
        'src/frontend/app.js'
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90
      }
    }
  }
});
