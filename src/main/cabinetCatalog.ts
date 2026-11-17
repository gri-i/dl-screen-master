import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { parseCabinetCatalog } from '../shared/cabinetCatalog';
import type { CabinetPreset } from '../shared/types';

/**
 * Где искать каталог кабинетов. Порядок важен: явный путь из окружения
 * (проверки, CI, «подменить каталог не пересобирая приложение») идёт первым,
 * затем файл рядом с приложением — в разработке это <корень проекта>/catalog,
 * в установленной сборке — тот же путь внутри app.asar, если каталог был
 * упакован.
 */
export function cabinetCatalogCandidates(baseDir: string, envPath?: string): string[] {
  return [envPath, path.join(baseDir, 'catalog', 'cabinet-presets.json')]
    .filter((candidate): candidate is string => Boolean(candidate));
}

/**
 * Читает и валидирует каталог кабинетов. Пустой массив означает «каталога
 * нет или он непригоден»: приложение тогда работает без стартовой библиотеки
 * (пользователь заводит кабинеты вручную или импортом), а не падает.
 *
 * Ошибки чтения/разбора не глушим: пишем в консоль, чтобы в разработке и в
 * логах сборки было видно, почему модели не подставились.
 */
export async function loadCabinetCatalog(baseDir: string, envPath = process.env.DL_CABINET_CATALOG): Promise<CabinetPreset[]> {
  for (const candidate of cabinetCatalogCandidates(baseDir, envPath)) {
    let raw: string;
    try {
      raw = await readFile(candidate, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      console.warn(`[cabinet-catalog] не удалось прочитать ${candidate}: ${(error as Error).message}`);
      return [];
    }
    try {
      const presets = parseCabinetCatalog(JSON.parse(raw));
      console.log(`[cabinet-catalog] загружено моделей: ${presets.length} — ${candidate}`);
      return presets;
    } catch (error) {
      console.warn(`[cabinet-catalog] ${candidate}: ${(error as Error).message}`);
      return [];
    }
  }
  return [];
}
