import type { CabinetPreset } from './types';
import type { Lang } from './lang';
import { mergeUniquePresets, validatePreset } from './presetValidation';

/**
 * Каталог кабинетов — отдельный JSON-файл, а не код приложения.
 *
 * Данные моделей (габариты, вес, потребление) не публикуются в репозитории:
 * файл лежит в `catalog/cabinet-presets.json` и целиком в .gitignore. При
 * первом запуске каталог подставляется в пользовательскую базу настроек, а
 * кнопка «Вернуть стандартные» возвращает из него удалённые модели.
 *
 * Модуль общий для main и renderer: разбор/валидация одинаковые, а откуда
 * взять файл — знает только main-процесс (см. src/main/cabinetCatalog.ts).
 */
export const CABINET_CATALOG_FORMAT = 'dl-screen-cabinet-catalog';
export const CABINET_CATALOG_VERSION = 1;

/** Разобранный файл каталога; `sources` — необязательные пометки, в пресеты не попадают. */
export interface CabinetCatalogFile {
  format: typeof CABINET_CATALOG_FORMAT;
  version: typeof CABINET_CATALOG_VERSION;
  presets: CabinetPreset[];
  sources?: Record<string, string>;
}

/**
 * Разбирает JSON каталога. Бросает исключение, если это вообще не каталог
 * (не тот формат/версия) — такой файл бесполезен и молчать о нём нельзя.
 * Отдельные невалидные пресеты пропускает с предупреждением в консоль:
 * одна опечатка в каталоге не должна оставлять пользователя без остальных
 * моделей.
 *
 * Для удобства принимает и «голый» массив пресетов, и объект с полями
 * `format`/`version` — если поля указаны, они должны совпадать.
 */
export function parseCabinetCatalog(raw: unknown, lang: Lang = 'ru'): CabinetPreset[] {
  const container = Array.isArray(raw) ? { presets: raw } : raw;
  if (!container || typeof container !== 'object') {
    throw new Error('Каталог кабинетов: ожидается JSON-объект с массивом "presets"');
  }
  const file = container as Partial<CabinetCatalogFile> & { presets?: unknown };
  if (!Array.isArray(file.presets)) {
    throw new Error('Каталог кабинетов: поле "presets" должно быть массивом');
  }
  if (file.format !== undefined && file.format !== CABINET_CATALOG_FORMAT) {
    throw new Error(`Каталог кабинетов: ожидается format "${CABINET_CATALOG_FORMAT}", получено "${String(file.format)}"`);
  }
  if (file.version !== undefined && file.version !== CABINET_CATALOG_VERSION) {
    throw new Error(`Каталог кабинетов: поддерживается version ${CABINET_CATALOG_VERSION}, получено "${String(file.version)}"`);
  }

  const valid: CabinetPreset[] = [];
  file.presets.forEach((item, index) => {
    const preset = item as CabinetPreset;
    const errors = validatePreset(preset, lang);
    if (errors.length > 0) {
      console.warn(`[cabinet-catalog] пресет #${index} пропущен: ${errors.join('; ')}`);
      return;
    }
    valid.push({
      id: preset.id.trim(),
      brand: preset.brand.trim(),
      model: preset.model.trim(),
      widthMm: preset.widthMm,
      heightMm: preset.heightMm,
      pixelPitchMm: preset.pixelPitchMm,
      resolutionX: preset.resolutionX,
      resolutionY: preset.resolutionY,
      maskResolutionX: preset.maskResolutionX,
      maskResolutionY: preset.maskResolutionY,
      weightKg: preset.weightKg,
      maxPowerW: preset.maxPowerW,
      avgPowerW: preset.avgPowerW,
      receiverCardName: preset.receiverCardName
    });
  });

  // Дубли по id или бренд+модель в каталоге — это ошибка данных; оставляем
  // первый вариант, чтобы запись в базу не падала на дубликате.
  return mergeUniquePresets([], valid, { skipDuplicates: true, lang });
}

/**
 * Достаёт список пресетов из файла пользователя. Понимает оба формата:
 * «голый» JSON-массив (так библиотека экспортировалась раньше) и файл
 * каталога с полем `presets` (в этом же формате работает стартовый каталог
 * и экспорт из текущей версии) — чтобы один и тот же файл можно было
 * и импортировать в настройках, и положить в `catalog/`.
 *
 * Полную проверку диапазонов делает вызывающая сторона (mergeUniquePresets):
 * здесь важно только отделить каталог от постороннего JSON и дать понятную
 * ошибку, если это вообще не файл пресетов.
 */
export function extractPresetList(raw: unknown): CabinetPreset[] {
  if (Array.isArray(raw)) return raw as CabinetPreset[];
  const presets = (raw as { presets?: unknown } | null)?.presets;
  if (Array.isArray(presets)) return presets as CabinetPreset[];
  throw new Error('Файл должен содержать JSON-массив пресетов или объект каталога с полем "presets"');
}

/** Собирает файл каталога из списка пресетов — формат экспорта и стартового каталога один. */
export function buildCabinetCatalogFile(presets: CabinetPreset[]): CabinetCatalogFile {
  return { format: CABINET_CATALOG_FORMAT, version: CABINET_CATALOG_VERSION, presets };
}
