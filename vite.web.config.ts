import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Сборка web-версии для встраивания в CRM (без Electron).
 *
 * Собирается только renderer: мост window.*Files в браузере подставляет
 * src/renderer/platform.ts. `base: './'` — чтобы статику можно было положить
 * в любую подпапку CRM и открывать через iframe без привязки к корню домена.
 *
 * Каталог кабинетов в сборку не копируется: web-версия при необходимости
 * читает `catalog/cabinet-presets.json` рядом с index.html (см. platform.ts).
 */
export default defineConfig({
  root: 'src/renderer',
  base: './',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared')
    }
  },
  plugins: [react()],
  build: {
    outDir: '../../dist-web',
    emptyOutDir: true
  }
});
