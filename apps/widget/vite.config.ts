import { defineConfig } from 'vite';
import path from 'path';
import { copyFileSync, readdirSync, mkdirSync, existsSync, statSync } from 'fs';

/** Copia i file di traduzione i18n in dist/locales/ come asset statici. */
function copyLocales() {
  return {
    name: 'copy-locales',
    writeBundle() {
      const src = path.resolve(__dirname, 'src/i18n');
      const dest = path.resolve(__dirname, 'dist/locales');
      if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
      for (const file of ['it.json', 'en.json', 'fr.json', 'es.json', 'de.json']) {
        try {
          copyFileSync(path.resolve(src, file), path.resolve(dest, file));
        } catch (err) {
          throw new Error(`[copy-locales] Failed to copy ${file}: ${(err as Error).message}`);
        }
      }
    },
  };
}

/**
 * Story 12.2 (AC2): copia le immagini delle modelle predefinite in dist/models/
 * come asset statici, serviti dallo stesso baseUrl del widget su CDN Cabina.
 *
 * Mirror di `copyLocales` (pattern già collaudato): copia TUTTI i file di
 * src/models/ — così aggiungere/sostituire un'immagine non richiede toccare
 * questo plugin. Le immagini NON sono inline nel bundle JS (budget IIFE <50KB):
 * sono caricate a runtime dal CDN. Nessun endpoint backend (Task 1.2).
 */
function copyModels() {
  return {
    name: 'copy-models',
    writeBundle() {
      const src = path.resolve(__dirname, 'src/models');
      const dest = path.resolve(__dirname, 'dist/models');
      if (!existsSync(src)) return; // nessun asset → no-op (robusto)
      if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
      let files: string[];
      try {
        files = readdirSync(src);
      } catch (err) {
        throw new Error(`[copy-models] Failed to read src/models: ${(err as Error).message}`);
      }
      for (const file of files) {
        const srcFile = path.resolve(src, file);
        // Salta le sottocartelle (P10 code review): copyFileSync lancerebbe EISDIR
        // e aborterebbe l'intera build del widget. Copia solo file regolari.
        if (!statSync(srcFile).isFile()) continue;
        try {
          copyFileSync(srcFile, path.resolve(dest, file));
        } catch (err) {
          throw new Error(`[copy-models] Failed to copy ${file}: ${(err as Error).message}`);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [copyLocales(), copyModels()],
  // Nessuna sezione `worker`: il widget non ne ha più. L'unico era quello di
  // MediaPipe, rimosso il 2026-08-04 con la stima da landmark.
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'CabinaWidget',
      fileName: 'widget',
      formats: ['iife'],
    },
    outDir: 'dist',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: 'esbuild',
  },
  resolve: {
    alias: {
      '@cabina/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
});
