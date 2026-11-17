import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { copyFile, mkdir } from 'node:fs/promises';

/**
 * Сборка web-версии для встраивания в CRM (без Electron).
 *
 * Собирается только renderer: мост window.*Files в браузере подставляет
 * src/renderer/platform.ts. `base: './'` — чтобы статику можно было положить
 * в любую подпапку CRM и открывать через iframe без привязки к корню домена.
 *
 * Каталог кабинетов (catalog/cabinet-presets.json) — локальные данные, в git
 * его нет. Если файл есть, сборка копирует его в dist-web/catalog/, чтобы
 * web-версия читала стартовую библиотеку рядом с index.html.
 */
function cabinetCatalog(): Plugin {
  let outDir = '';
  return {
    name: 'cabinet-catalog',
    apply: 'build',
    configResolved(config) {
      // build.outDir в configResolved остаётся относительным к root, а не к cwd.
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const source = path.resolve(__dirname, 'catalog', 'cabinet-presets.json');
      const target = path.join(outDir, 'catalog', 'cabinet-presets.json');
      try {
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(source, target);
        console.log(`[cabinet-catalog] скопирован в ${target}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.warn('[cabinet-catalog] не удалось скопировать:', (error as Error).message);
        }
      }
    }
  };
}

export default defineConfig({
  root: 'src/renderer',
  base: './',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared')
    }
  },
  plugins: [react(), cabinetCatalog()],
  build: {
    outDir: '../../dist-web',
    emptyOutDir: true
  }
});
