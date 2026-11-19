import type { CabinetPreset } from './types';

/**
 * Два разных разрешения одного кабинета.
 *
 * Физическое (`resolutionX` × `resolutionY`) — это пиксели, которые реально
 * ведёт приёмная карта: по нему считаются загрузка порта контроллера, канва
 * контроллера, лимиты приёмной карты и пиксели в ведомостях.
 *
 * Маска (`maskResolutionX` × `maskResolutionY`) — полотно, по которому
 * рисуется контент и экспортируется PNG. У кабинетов с неквадратным пикселем
 * (например, прозрачный 1000 × 500 мм, 256 × 64 px, шаг H3.9 / V7.8)
 * физическое разрешение 256 × 64 даёт пропорции 4:1, а сам кабинет — 2:1.
 * Контент на такой маске сжимается по вертикали, поэтому маска должна быть
 * 256 × 128 px, хотя порт по-прежнему несёт 256 × 64 px.
 */
export interface CabinetMaskSize {
  width: number;
  height: number;
}

export const MAX_MASK_DIMENSION = 16384;

/** Допустимое расхождение физических пропорций и пропорций пиксельной сетки. */
const ASPECT_TOLERANCE = 0.05;

function positiveDimension(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.min(MAX_MASK_DIMENSION, Math.max(1, Math.round(number)));
}

/**
 * Разрешение полотна маски для кабинета.
 *
 * Явные `maskResolutionX` / `maskResolutionY` имеют приоритет. Если их нет,
 * а физические пропорции кабинета заметно (больше 5 %) расходятся с
 * пропорциями пиксельной сетки, маска выводится из габаритов при сохранении
 * ширины физического разрешения: height = resolutionX × heightMm / widthMm.
 * Для обычного кабинета с квадратным пикселем это ровно физическое
 * разрешение, поэтому поведение не меняется.
 */
export function cabinetMaskSize(preset: CabinetPreset): CabinetMaskSize {
  const physicalWidth = Math.max(1, Math.round(Number(preset.resolutionX) || 1));
  const physicalHeight = Math.max(1, Math.round(Number(preset.resolutionY) || 1));

  const explicitWidth = positiveDimension(preset.maskResolutionX);
  const explicitHeight = positiveDimension(preset.maskResolutionY);
  if (explicitWidth !== null && explicitHeight !== null) {
    return { width: explicitWidth, height: explicitHeight };
  }

  const widthMm = Number(preset.widthMm);
  const heightMm = Number(preset.heightMm);
  if (!Number.isFinite(widthMm) || widthMm <= 0 || !Number.isFinite(heightMm) || heightMm <= 0) {
    return { width: physicalWidth, height: physicalHeight };
  }

  const physicalAspect = heightMm / widthMm;
  const pixelAspect = physicalHeight / physicalWidth;
  if (Math.abs(physicalAspect / pixelAspect - 1) <= ASPECT_TOLERANCE) {
    return { width: physicalWidth, height: physicalHeight };
  }

  // Горизонтальный шаг пикселя — паспортный pixelPitchMm, поэтому ширину
  // оставляем физической, а высоту растягиваем до физических пропорций.
  const derivedHeight = positiveDimension(physicalWidth * physicalAspect);
  if (derivedHeight === null || derivedHeight === physicalHeight) {
    return { width: physicalWidth, height: physicalHeight };
  }
  return { width: physicalWidth, height: derivedHeight };
}

/**
 * Пиксели кабинета для расчёта нагрузки на порт/контроллер — всегда
 * физические. Маска (контент) в эту цифру не входит.
 */
export function cabinetPhysicalPixels(preset: CabinetPreset): number {
  const width = Math.max(1, Math.round(Number(preset.resolutionX) || 1));
  const height = Math.max(1, Math.round(Number(preset.resolutionY) || 1));
  return width * height;
}

/** Пиксели полотна маски — только для рисования/экспорта контента. */
export function cabinetMaskPixels(preset: CabinetPreset): number {
  const mask = cabinetMaskSize(preset);
  return mask.width * mask.height;
}
