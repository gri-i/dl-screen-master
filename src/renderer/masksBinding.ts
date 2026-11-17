import type { ScreenInstance } from '@shared/types';

/**
 * Привязка маски к узлу LED-стены в дизайне.
 *
 * Маски — отдельная вкладка браузера, поэтому состояние экрана живёт в
 * localStorage по id стены (`wall` из ссылки): первое открытие создаёт экран,
 * последующие открывают тот же самый, а правки (сетка, пустые кабинеты,
 * подпись, паттерн) подхватываются. Это привязка на браузер; общая для всех
 * пользователей маска потребует серверного хранения (отдельный шаг).
 */
const PREFIX = 'dl-screen-master-masks-screen:';
const VERSION = 1;

export function boundScreenStorageKey(wallId: string): string {
  return PREFIX + wallId;
}

function isScreen(value: unknown): value is ScreenInstance {
  if (!value || typeof value !== 'object') return false;
  const screen = value as Partial<ScreenInstance>;
  return typeof screen.id === 'string' && screen.id.length > 0
    && typeof screen.name === 'string'
    && typeof screen.presetId === 'string'
    && Number.isInteger(screen.cols) && (screen.cols ?? 0) > 0
    && Number.isInteger(screen.rows) && (screen.rows ?? 0) > 0
    && Array.isArray(screen.emptyCabinetKeys)
    && !!screen.position && Number.isFinite(screen.position.x) && Number.isFinite(screen.position.y)
    && !!screen.visualSettings && typeof screen.visualSettings === 'object'
    && Number.isInteger(screen.rotation);
}

/** Сохранённый экран стены; null — если его ещё не открывали или данные битые. */
export function readBoundScreen(wallId: string, storage: Storage = window.localStorage): ScreenInstance | null {
  try {
    const raw = storage.getItem(boundScreenStorageKey(wallId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const container = parsed as { version?: number; screen?: unknown } | null;
    if (!container || container.version !== VERSION || !isScreen(container.screen)) return null;
    return container.screen;
  } catch {
    return null;
  }
}

/** Сохраняет экран стены; хранилище может быть недоступно (iframe/приватный режим). */
export function writeBoundScreen(wallId: string, screen: ScreenInstance, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(boundScreenStorageKey(wallId), JSON.stringify({ version: VERSION, screen }));
  } catch {
    // Без сохранения маска всё равно работает в этой вкладке.
  }
}

// Миниатюра маски для узла LED-стены в схеме DL Design. Контракт с дизайном:
// ключ `dl-screen-master-masks-thumb:<wall>` и значение — data URL PNG.
const THUMB_PREFIX = 'dl-screen-master-masks-thumb:';
const THUMB_LIMIT = 1_500_000;

export function boundThumbnailStorageKey(wallId: string): string {
  return THUMB_PREFIX + wallId;
}

export function readBoundThumbnail(wallId: string, storage: Storage = window.localStorage): string | null {
  try {
    const value = storage.getItem(boundThumbnailStorageKey(wallId));
    return value && value.startsWith('data:image/') && value.length <= THUMB_LIMIT ? value : null;
  } catch {
    return null;
  }
}

export function writeBoundThumbnail(wallId: string, dataUrl: string, storage: Storage = window.localStorage): void {
  if (!dataUrl.startsWith('data:image/') || dataUrl.length > THUMB_LIMIT) return;
  try {
    storage.setItem(boundThumbnailStorageKey(wallId), dataUrl);
  } catch {
    // Хранилище недоступно/переполнено — миниатюра не критична.
  }
}

export function clearBoundThumbnail(wallId: string, storage: Storage = window.localStorage): void {
  try {
    storage.removeItem(boundThumbnailStorageKey(wallId));
  } catch {
    // ignore
  }
}

/**
 * Уменьшает превью экрана до ширины maxWidth (PNG data URL). Браузерная
 * операция: в тестах/Node без document возвращает null.
 */
export async function renderThumbnail(source: string, maxWidth = 320): Promise<string | null> {
  if (!source || typeof document === 'undefined') return null;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('thumbnail image failed'));
      element.src = source;
    });
    const width = Math.max(1, Math.min(image.naturalWidth || 1, maxWidth));
    const height = Math.max(1, Math.round((image.naturalHeight || 1) * (width / (image.naturalWidth || 1))));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

// ── Сводка по силовым путям для дизайна (17.11.2026) ────────────────────────
// Дизайн показывает у LED-стены потребление и нагрузки по фазам. Сам он знает
// только модель кабинета и сетку, а фактические цепи/фазы живут в масках
// (PowerPathPlanner). Поэтому маски публикуют компактную сводку по тому же id
// стены — дизайн её читает и не выдумывает распределение по фазам.
const POWER_PREFIX = 'dl-screen-master-masks-power:';
const POWER_VERSION = 1;

export interface BoundPowerLoad {
  phase: 'L1' | 'L2' | 'L3';
  cabinets: number;
  maxPowerW: number;
  avgPowerW: number;
  amps: number;
}

export interface BoundPowerSummary {
  /** однофазный/трёхфазный план питания */
  phases: 1 | 3;
  voltage: number;
  breakerAmps: number;
  safetyMarginPercent: number;
  powerFactor: number;
  /** кабинетов в экране и сколько из них разведено по цепям */
  cabinets: number;
  assigned: number;
  /** пик и среднее по всему экрану */
  maxPowerW: number;
  avgPowerW: number;
  loads: BoundPowerLoad[];
  imbalancePercent: number;
  updatedAt: string;
}

export function boundPowerStorageKey(wallId: string): string {
  return POWER_PREFIX + wallId;
}

function isPowerSummary(value: unknown): value is BoundPowerSummary {
  if (!value || typeof value !== 'object') return false;
  const summary = value as Partial<BoundPowerSummary>;
  const finite = (number: unknown): boolean => typeof number === 'number' && Number.isFinite(number);
  return (summary.phases === 1 || summary.phases === 3)
    && finite(summary.voltage) && finite(summary.cabinets) && finite(summary.assigned)
    && finite(summary.maxPowerW) && finite(summary.avgPowerW) && finite(summary.imbalancePercent)
    && Array.isArray(summary.loads) && summary.loads.every((load) => !!load
      && (load.phase === 'L1' || load.phase === 'L2' || load.phase === 'L3')
      && finite(load.cabinets) && finite(load.maxPowerW) && finite(load.amps));
}

export function readBoundPower(wallId: string, storage: Storage = window.localStorage): BoundPowerSummary | null {
  try {
    const raw = storage.getItem(boundPowerStorageKey(wallId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; summary?: unknown } | null;
    return parsed && parsed.version === POWER_VERSION && isPowerSummary(parsed.summary) ? parsed.summary : null;
  } catch {
    return null;
  }
}

export function writeBoundPower(wallId: string, summary: BoundPowerSummary, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(boundPowerStorageKey(wallId), JSON.stringify({ version: POWER_VERSION, summary }));
  } catch {
    // Хранилище недоступно — сводка не критична, дизайн покажет «нет данных».
  }
}

export function clearBoundPower(wallId: string, storage: Storage = window.localStorage): void {
  try {
    storage.removeItem(boundPowerStorageKey(wallId));
  } catch {
    // ignore
  }
}
