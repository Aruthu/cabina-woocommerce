import { defineConfig } from 'vite';
import path from 'path';

/**
 * Story 14.2 — lo script Wix (`dist/wix-eventi.js`), un modulo ES con dentro
 * `@wix/sdk` e `@wix/site`. Build separata dal widget: il widget resta un IIFE
 * senza dipendenze. Gira DOPO la build del widget e non svuota `dist/`.
 */
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/wix/wix-eventi.ts'),
      fileName: () => 'wix-eventi.js',
      formats: ['es'],
    },
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
    minify: 'esbuild',
  },
});
