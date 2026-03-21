import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  esbuild: {
    // Inline the tsconfig options to avoid tsconfck resolution issues on Windows
    target: 'es2022',
    format: 'esm',
    tsconfigRaw: JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        declaration: true,
        sourceMap: true,
      },
    }),
  },
});
