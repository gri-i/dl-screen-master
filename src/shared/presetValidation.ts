import type { CabinetPreset } from './types';
import type { Lang } from './lang';

const LIMITS: Record<keyof Pick<CabinetPreset,
  'widthMm' | 'heightMm' | 'pixelPitchMm' | 'resolutionX' | 'resolutionY' |
  'weightKg' | 'maxPowerW' | 'avgPowerW'>, [number, number]> = {
  widthMm: [10, 5000], heightMm: [10, 5000], pixelPitchMm: [0.1, 100],
  resolutionX: [1, 16384], resolutionY: [1, 16384], weightKg: [0.01, 500],
  maxPowerW: [0.1, 10000], avgPowerW: [0.1, 10000]
};

const MESSAGES: Record<Lang, {
  missingId: string; missingBrand: string; missingModel: string;
  range: (field: string, min: number, max: number) => string;
  avgExceedsMax: string;
  duplicate: (brand: string, model: string) => string;
}> = {
  ru: {
    missingId: 'Отсутствует id',
    missingBrand: 'Не указан бренд',
    missingModel: 'Не указана модель',
    range: (field, min, max) => `${field}: допустимо ${min}–${max}`,
    avgExceedsMax: 'Средняя мощность не может превышать максимальную',
    duplicate: (brand, model) => `Дубликат пресета: ${brand} ${model}`
  },
  en: {
    missingId: 'Missing id',
    missingBrand: 'Brand is required',
    missingModel: 'Model is required',
    range: (field, min, max) => `${field}: must be ${min}–${max}`,
    avgExceedsMax: 'Average power cannot exceed maximum power',
    duplicate: (brand, model) => `Duplicate preset: ${brand} ${model}`
  }
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Пресет в базе с тем же brand+model (без учёта регистра/пробелов) — самый надёжный признак "это тот же кабинет". */
export function findPresetByName(presets: CabinetPreset[], brand: string, model: string): CabinetPreset | undefined {
  return presets.find((preset) =>
    normalizeText(preset.brand) === normalizeText(brand) && normalizeText(preset.model) === normalizeText(model));
}

/**
 * Пресет в базе с тем же пиксельным разрешением — используется, когда
 * brand+model не совпали (кабинет переименован вручную, или импортёр не
 * знает его паспортное имя). Совпадение принимается, только если в базе
 * РОВНО один пресет с таким разрешением: несколько разных физических
 * кабинетов нередко делят одно и то же px-разрешение при разном шаге/mm,
 * и угадывать здесь нельзя — лучше создать новый технический пресет.
 */
export function findPresetByResolution(presets: CabinetPreset[], resolutionX: number, resolutionY: number): CabinetPreset | undefined {
  const matches = presets.filter((preset) => preset.resolutionX === resolutionX && preset.resolutionY === resolutionY);
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Сопоставляет импортированный кабинет (NovaStar/RCFG и т.п.) с уже
 * существующим пресетом в базе — чтобы повторный импорт того же кабинета
 * (из другого проекта или повторно того же) не плодил дубликаты вида
 * "novastar-brand-model-...", а переиспользовал реальные вес/мощность/мм
 * уже заведённого пресета.
 */
export function matchExistingPreset(
  presets: CabinetPreset[],
  candidate: { brand: string; model: string; resolutionX: number; resolutionY: number }
): CabinetPreset | undefined {
  return findPresetByName(presets, candidate.brand, candidate.model)
    ?? findPresetByResolution(presets, candidate.resolutionX, candidate.resolutionY);
}

export function validatePreset(preset: CabinetPreset, lang: Lang = 'ru'): string[] {
  const m = MESSAGES[lang];
  const errors: string[] = [];
  if (!preset.id?.trim()) errors.push(m.missingId);
  if (!preset.brand?.trim()) errors.push(m.missingBrand);
  if (!preset.model?.trim()) errors.push(m.missingModel);
  for (const [field, [min, max]] of Object.entries(LIMITS) as [keyof typeof LIMITS, [number, number]][]) {
    const value = preset[field];
    if (!Number.isFinite(value) || value < min || value > max) errors.push(m.range(field, min, max));
  }
  if (preset.avgPowerW > preset.maxPowerW) errors.push(m.avgExceedsMax);
  return errors;
}

export function mergeUniquePresets(
  existing: CabinetPreset[],
  incoming: CabinetPreset[],
  options: { skipDuplicates?: boolean; lang?: Lang } = {}
): CabinetPreset[] {
  const lang = options.lang ?? 'ru';
  const result = [...existing];
  for (const preset of incoming) {
    const errors = validatePreset(preset, lang);
    if (errors.length) throw new Error(`${preset.brand || preset.id}: ${errors.join(', ')}`);
    const duplicate = result.some((item) => item.id === preset.id) || !!findPresetByName(result, preset.brand, preset.model);
    if (duplicate) {
      if (options.skipDuplicates) continue;
      throw new Error(MESSAGES[lang].duplicate(preset.brand, preset.model));
    }
    result.push(preset);
  }
  return result;
}
