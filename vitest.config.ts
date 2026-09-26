import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
  test: { testTimeout: 30000, hookTimeout: 30000, fileParallelism: false },
  resolve: {
    alias: {
      '../main': path.resolve(__dirname, './main.ts')
    }
  }
});
