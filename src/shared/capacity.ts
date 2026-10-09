import type { ProcessorPort, SignalFormat } from './types';

/**
 * Модель пропускной способности Ethernet-порта контроллера (адаптировано из
 * pixel-peeker, MIT, domain/capacity.ts).
 *
 * Пиксель на линке занимает не 3 × глубина цвета, а контейнер степени двойки:
 * 8 бит → 24, 10 бит → 32, 12 бит → 48 (NovaStar COEX). У старого поколения
 * MCTRL нет 32-битного пути — там 10 бит стоят все 48. Brompton упаковывает
 * «наивно» (3 × глубина). Частота обновления светодиодов на линк НЕ влияет —
 * только частота кадров.
 */
export const DEFAULT_SIGNAL: SignalFormat = { bitDepth: 8, frameRateHz: 60 };

export type PixelPacking = 'container' | 'container-legacy' | 'naive';

export interface PortLink {
  speedGbps: number;
  efficiency: number;
  packing: PixelPacking;
}

/**
 * Гигабитный порт MCTRL/H-серии: 650 000 px при 8 бит и 60 Гц
 * (1e9 × 0.936 / 24 / 60), 325 000 px при 10/12 бит.
 */
export const GIGABIT_LEGACY_LINK: PortLink = { speedGbps: 1, efficiency: 0.936, packing: 'container-legacy' };

export function wireBitsPerPixel(bitDepth: number, packing: PixelPacking = 'container'): number {
  if (packing === 'naive') return 3 * bitDepth;
  if (bitDepth <= 8) return 24;
  if (packing === 'container-legacy') return 48;
  return bitDepth <= 10 ? 32 : 48;
}

export function linkCapacityPx(link: PortLink, signal: SignalFormat): number {
  const bits = wireBitsPerPixel(signal.bitDepth, link.packing);
  // +1e-6 — защита от 649999.9999 из-за плавающей точки при точных долях.
  return Math.floor((link.speedGbps * 1e9 * link.efficiency) / bits / signal.frameRateHz + 1e-6);
}

/** Линк порта: явный, либо (для старых проектов и импортов) 650 000 px = гигабитный порт. */
function linkOf(port: ProcessorPort): PortLink | null {
  if (port.link) return port.link;
  return port.maxPixels === 650000 ? GIGABIT_LEGACY_LINK : null;
}

/** Сколько пикселей порт тянет при заданном сигнале; без модели линка — фиксированный maxPixels. */
export function portMaxPixels(port: ProcessorPort, signal: SignalFormat = DEFAULT_SIGNAL): number {
  const link = linkOf(port);
  return link ? linkCapacityPx(link, signal) : port.maxPixels;
}

/** Максимальная частота кадров, которую порт держит на заданном числе пикселей. */
export function portMaxFrameRate(port: ProcessorPort, pixels: number, bitDepth: SignalFormat['bitDepth']): number | null {
  const link = linkOf(port);
  if (!link || pixels <= 0) return null;
  return (link.speedGbps * 1e9 * link.efficiency) / wireBitsPerPixel(bitDepth, link.packing) / pixels;
}
