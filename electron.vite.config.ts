import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      lib: { entry: 'src/main/main.ts' }
    }
  },
  preload: {
    build: {
      outDir: 'dist/preload',
      lib: { entry: 'src/main/preload.ts' }
    }
  },
  renderer: {
    root: 'src/renderer',
    server: {
      host: '127.0.0.1'
    },
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared')
      }
    },
    plugins: [react()],
    build: {
      outDir: 'dist/renderer'
    }
  }
});
