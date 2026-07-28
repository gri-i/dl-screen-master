import type { CabinetPreset } from './types';

const LIMITS: Record<keyof Pick<CabinetPreset,
  'widthMm' | 'heightMm' | 'pixelPitchMm' | 'resolutionX' | 'resolutionY' |
  'weightKg' | 'maxPowerW' | 'avgPowerW'>, [number, number]> = {
  widthMm: [10, 5000], heightMm: [10, 5000], pixelPitchMm: [0.1, 100],
  resolutionX: [1, 16384], resolutionY: [1, 16384], weightKg: [0.01, 500],
  maxPowerW: [0.1, 10000], avgPowerW: [0.1, 10000]
};

export function validatePreset(preset: CabinetPreset): string[] {
  const errors: string[] = [];
  if (!preset.id?.trim()) errors.push('Отсутствует id');
  if (!preset.brand?.trim()) errors.push('Не указан бренд');
  if (!preset.model?.trim()) errors.push('Не указана модель');
  for (const [field, [min, max]] of Object.entries(LIMITS) as [keyof typeof LIMITS, [number, number]][]) {
    const value = preset[field];
    if (!Number.isFinite(value) || value < min || value > max) errors.push(`${field}: допустимо ${min}–${max}`);
  }
  if (preset.avgPowerW > preset.maxPowerW) errors.push('Средняя мощность не может превышать максимальную');
  return errors;
}

export function mergeUniquePresets(
  existing: CabinetPreset[],
  incoming: CabinetPreset[],
  options: { skipDuplicates?: boolean } = {}
): CabinetPreset[] {
  const result = [...existing];
  for (const preset of incoming) {
    const errors = validatePreset(preset);
    if (errors.length) throw new Error(`${preset.brand || preset.id}: ${errors.join(', ')}`);
    const duplicate = result.some((item) =>
      item.id === preset.id ||
      (item.brand.trim().toLowerCase() === preset.brand.trim().toLowerCase() &&
        item.model.trim().toLowerCase() === preset.model.trim().toLowerCase())
    );
    if (duplicate) {
      if (options.skipDuplicates) continue;
      throw new Error(`Дубликат пресета: ${preset.brand} ${preset.model}`);
    }
    result.push(preset);
  }
  return result;
}
