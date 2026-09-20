import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/src/**/*.test.ts?(x)'],
    coverage: { provider: 'v8', include: ['packages/*/src/**'] },
  },
});
