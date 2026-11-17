import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { CabinetPreset } from '../shared/types';
import { writeJsonAtomically } from './persistence';

/**
 * Пользовательская база кабинетов живёт в профиле приложения отдельно от
 * проектов: она общая для всех проектов и переживает «Новый проект».
 */
export function presetProfilePath(userDataPath: string): string {
  return path.join(userDataPath, 'cabinet-presets.json');
}

/**
 * Читает базу кабинетов из профиля. Если файла ещё нет (первый запуск) —
 * записывает туда стартовый каталог (`catalog`, см. src/main/cabinetCatalog.ts)
 * и отдаёт его, чтобы основное окно работало сразу. Пустой каталог означает,
 * что подставлять нечего: профиль создаётся пустым.
 *
 * Отсутствие файла и пустой массив — разные состояния: после «Очистить базу»
 * в профиле лежит осознанно пустой [], и стандартные модели не должны
 * возвращаться сами при следующем запуске. Вернуть их можно только вручную
 * кнопкой «Вернуть стандартные» в настройках.
 */
export async function loadPresetProfile(userDataPath: string, catalog: CabinetPreset[]): Promise<CabinetPreset[]> {
  const filePath = presetProfilePath(userDataPath);
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as CabinetPreset[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const seeded = catalog.map((preset) => ({ ...preset }));
  try {
    await writeJsonAtomically(filePath, seeded);
  } catch {
    // Профиль недоступен для записи — каталог всё равно отдаём в рендерер,
    // просто он не сохранится до следующего запуска.
  }
  return seeded;
}
