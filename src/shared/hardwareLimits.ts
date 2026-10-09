import type { CabinetPreset, Processor, SignalFormat } from './types';

/**
 * Лимиты контроллеров и приёмных карт NovaStar (данные из даташитов, через
 * pixel-peeker, MIT). Для моделей, которых здесь нет (H9/H15, импорт с
 * неизвестным именем), проверка не выполняется — лимит не выдумываем.
 */

export interface ControllerLimit {
  /** Потолок канвы входа, px. Не зависит от битности и fps: отправитель маппит вход 1:1. */
  maxCanvasPx: number;
  source: string;
}

const CONTROLLER_LIMITS: Record<string, ControllerLimit> = {
  'MCTRL4K': { maxCanvasPx: 8_800_000, source: 'MCTRL4K Specifications V1.2.1' },
  'MCTRL660 PRO': { maxCanvasPx: 2_304_000, source: 'MCTRL660 PRO Specifications V1.4.1' },
  'MCTRL660': { maxCanvasPx: 2_304_000, source: 'MCTRL660 Specifications V1.4.4' }
};

export interface ReceiverLimit {
  model: string;
  maxWidthPx: number;
  maxHeightPx: number;
  /** Если при 12 бит лимит меньше (A10s Pro: 512×384). */
  maxHeightPx12bit?: number;
}

const RECEIVER_LIMITS: ReceiverLimit[] = [
  { model: 'A10s Pro', maxWidthPx: 512, maxHeightPx: 512, maxHeightPx12bit: 384 },
  { model: 'A8s Pro', maxWidthPx: 512, maxHeightPx: 512 },
  { model: 'A8s', maxWidthPx: 512, maxHeightPx: 384 },
  { model: 'A5s Plus', maxWidthPx: 512, maxHeightPx: 384 },
  { model: 'A4s', maxWidthPx: 256, maxHeightPx: 256 }
];

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

export function controllerLimit(model: string | undefined): ControllerLimit | undefined {
  if (!model) return undefined;
  const key = Object.keys(CONTROLLER_LIMITS).find((name) => normalize(name) === normalize(model));
  return key ? CONTROLLER_LIMITS[key] : undefined;
}

/** Самая длинная подходящая модель выигрывает: «A8s Pro» не должна матчиться как «A8s». */
export function receiverLimit(cardName: string | undefined): ReceiverLimit | undefined {
  if (!cardName) return undefined;
  const text = normalize(cardName);
  return [...RECEIVER_LIMITS]
    .sort((a, b) => normalize(b.model).length - normalize(a.model).length)
    .find((card) => text.includes(normalize(card.model)));
}

export interface ControllerCanvasCheck {
  controller: string;
  pixels: number;
  limit: number;
  ok: boolean;
}

/** Суммарные пиксели, назначенные на каждый физический контроллер, против потолка его канвы. */
export function checkControllerCanvas(processor: Processor | undefined, pixelsPerCabinet: number): ControllerCanvasCheck[] {
  if (!processor) return [];
  const groups = new Map<string, { model: string; cabinets: number }>();
  for (const port of processor.ports) {
    const model = port.controllerName ?? processor.model;
    if (!controllerLimit(model)) continue;
    const key = `${model}#${port.controllerId ?? ''}`;
    const group = groups.get(key) ?? { model, cabinets: 0 };
    group.cabinets += port.assignedCabinets.length;
    groups.set(key, group);
  }
  return Array.from(groups.entries()).map(([key, group]) => {
    const limit = controllerLimit(group.model)!.maxCanvasPx;
    const pixels = group.cabinets * pixelsPerCabinet;
    const unit = key.split('#')[1];
    return { controller: unit ? `${group.model} #${unit}` : group.model, pixels, limit, ok: pixels <= limit };
  });
}

export interface ReceiverCheck {
  card: string;
  ok: boolean;
  limitWidth: number;
  limitHeight: number;
}

export function checkReceiverCard(preset: CabinetPreset, signal: SignalFormat): ReceiverCheck | null {
  const card = receiverLimit(preset.receiverCardName);
  if (!card) return null;
  const limitHeight = signal.bitDepth === 12 && card.maxHeightPx12bit ? card.maxHeightPx12bit : card.maxHeightPx;
  return {
    card: card.model,
    limitWidth: card.maxWidthPx,
    limitHeight,
    ok: preset.resolutionX <= card.maxWidthPx && preset.resolutionY <= limitHeight
  };
}
