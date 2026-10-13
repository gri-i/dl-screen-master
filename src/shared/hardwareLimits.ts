import type { CabinetPreset, Processor, ProcessorPort, SignalFormat } from './types';

/**
 * Hardware limits are deliberately kept separate from the routing model.
 * A limit is only reported as known when the saved project contains the
 * configuration fields required by the manufacturer's specification.
 */
export type HardwareCheckStatus = 'ok' | 'overload' | 'unknown';
type BitDepth = SignalFormat['bitDepth'];

const NOVASTAR_SOURCES = {
  mctrl4k: 'https://www.novastar.tech/product/detail.html?catid=2&id=24',
  mctrl660: 'https://oss.novastar.tech/uploads/2024/11/MCTRL660-LED-Display-Controller-Specifications-V1.4.4.pdf',
  mctrl660Pro: 'https://oss.novastar.tech/uploads/2024/11/MCTRL660-PRO-Independent-Controller-Specifications-V1.4.1.pdf',
  h9: 'https://oss.novastar.tech/uploads/2024/01/H9-Video-Wall-Splicer-Specifications-V1.11.0.pdf',
  h15: 'https://oss.novastar.tech/uploads/2023/11/H15-Video-Wall-Splicer-Specifications-V1.8.0.pdf',
  a10sPro: 'https://oss.novastar.tech/uploads/2024/12/A10s-Pro-Receiving-Card-Specifications-V1.3.0.pdf',
  a8s: 'https://oss.novastar.tech/uploads/2023/01/A8s-Receiving-Card-Specifications-V2.2.3.pdf',
  a5sPlus: 'https://oss.novastar.tech/uploads/2025/05/A5s-Plus-Receiving-Card-Specifications-V1.4.1.pdf',
  a4s: 'https://oss.novastar.tech/uploads/2021/08/A4s-Receiving-Card-Specifications-V2.1.4.pdf'
} as const;

export interface ControllerLimit {
  model: string;
  /** Input canvas pixel capacity. H-series is intentionally configuration-dependent. */
  maxCanvasPx?: number;
  /** Input canvas capacity when the source gives depth-specific values. */
  maxCanvasPxByBitDepth?: Partial<Record<BitDepth, number>>;
  /** Hardware Ethernet capacity by input bit depth, when the source states it. */
  maxPixelsPerPort: Partial<Record<BitDepth, number>>;
  /** Standard chassis card count; enhanced alternatives are kept explicit. */
  maxSendingCards?: number;
  maxSendingCardsEnhanced?: number;
  source: string;
  applicability: string;
}

const CONTROLLER_LIMITS: ControllerLimit[] = [
  {
    model: 'MCTRL4K',
    maxCanvasPx: 8_800_000,
    maxPixelsPerPort: { 8: 650_000, 10: 320_000, 12: 320_000 },
    source: NOVASTAR_SOURCES.mctrl4k,
    applicability: 'MCTRL 4K input pixel capacity and RJ45 output ports'
  },
  {
    model: 'MCTRL660 PRO',
    maxCanvasPx: 2_304_000,
    maxCanvasPxByBitDepth: { 8: 2_304_000, 10: 2_073_600, 12: 2_073_600 },
    maxPixelsPerPort: { 8: 650_000, 10: 325_000, 12: 325_000 },
    source: NOVASTAR_SOURCES.mctrl660Pro,
    applicability: 'MCTRL660 PRO single-controller 1920×1200 capacity and RJ45 output ports'
  },
  {
    model: 'MCTRL660',
    maxCanvasPx: 2_304_000,
    maxCanvasPxByBitDepth: { 8: 2_304_000, 12: 1_296_000 },
    maxPixelsPerPort: { 8: 650_000 },
    source: NOVASTAR_SOURCES.mctrl660,
    applicability: 'MCTRL660 single-controller 1920×1200 capacity; per-port depth beyond 8-bit is not stated in the current specification'
  },
  {
    model: 'H9',
    maxPixelsPerPort: { 8: 650_000, 10: 320_000 },
    maxSendingCards: 5,
    maxSendingCardsEnhanced: 5,
    source: NOVASTAR_SOURCES.h9,
    applicability: 'H9/H9 Enhanced with H_16xRJ45+2xfiber LED sending cards; total canvas depends on card type and chassis configuration'
  },
  {
    model: 'H15',
    maxPixelsPerPort: { 8: 650_000, 10: 320_000 },
    maxSendingCards: 10,
    maxSendingCardsEnhanced: 16,
    source: NOVASTAR_SOURCES.h15,
    applicability: 'H15/H15 Enhanced with H_16xRJ45+2xfiber LED sending cards; total canvas depends on card type and chassis configuration'
  }
];

export interface ReceiverLimitVariant {
  id: string;
  maxWidthPx: number;
  maxHeightPx: number;
  maxWidthPx12bit?: number;
  maxHeightPx12bit?: number;
  applicability: string;
}

export interface ReceiverLimit {
  model: string;
  variants: ReceiverLimitVariant[];
  source: string;
  applicability: string;
}

const RECEIVER_LIMITS: ReceiverLimit[] = [
  {
    model: 'A10s Pro',
    variants: [{
      id: 'pwm',
      maxWidthPx: 512,
      maxHeightPx: 512,
      maxWidthPx12bit: 512,
      maxHeightPx12bit: 256,
      applicability: 'PWM driver ICs; 8/10-bit or 12-bit video source'
    }],
    source: NOVASTAR_SOURCES.a10sPro,
    applicability: 'A10s Pro receiving card'
  },
  {
    model: 'A8s',
    variants: [
      { id: 'pwm', maxWidthPx: 512, maxHeightPx: 384, applicability: 'PWM driver ICs' },
      { id: 'common', maxWidthPx: 384, maxHeightPx: 384, applicability: 'common driver ICs' }
    ],
    source: NOVASTAR_SOURCES.a8s,
    applicability: 'A8s receiving card; driver IC type is required'
  },
  {
    model: 'A5s Plus',
    variants: [
      { id: 'pwm', maxWidthPx: 512, maxHeightPx: 384, maxWidthPx12bit: 256, maxHeightPx12bit: 384, applicability: 'PWM driver ICs; 8-bit versus 10/12-bit source' },
      { id: 'common', maxWidthPx: 384, maxHeightPx: 384, maxWidthPx12bit: 192, maxHeightPx12bit: 384, applicability: 'common driver ICs; 8-bit versus 10/12-bit source' }
    ],
    source: NOVASTAR_SOURCES.a5sPlus,
    applicability: 'A5s Plus receiving card; driver IC type is required'
  },
  {
    model: 'A4s',
    variants: [{ id: 'default', maxWidthPx: 256, maxHeightPx: 256, applicability: 'A4s receiving card' }],
    source: NOVASTAR_SOURCES.a4s,
    applicability: 'A4s receiving card'
  }
];

const normalize = (value: string): string => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

function modelMatch(value: string, model: string): boolean {
  const text = normalize(value);
  const key = normalize(model);
  if (text === key) return true;
  const start = text.indexOf(key);
  if (start < 0) return false;
  const suffix = text.slice(start + key.length);
  // A model suffix is a different card/controller unless that profile is
  // explicitly present (for example A8s Pro must not fall back to A8s).
  return !suffix.startsWith('pro') && !suffix.startsWith('plus');
}

function controllerModel(port: ProcessorPort, processor: Processor): string {
  return port.controllerName ?? processor.model;
}

function controllerUnitKey(port: ProcessorPort, processor: Processor): string {
  const model = controllerModel(port, processor);
  const controllerId = port.controllerId ?? '';
  return `${model}\u0000${controllerId}`;
}

function sendingCardGroupKey(port: ProcessorPort, processor: Processor): string {
  return controllerModel(port, processor);
}

function controllerLabel(model: string, controllerId: string): string {
  return controllerId ? `${model} #${controllerId}` : model;
}

function checkStatus(pixels: number, limit: number | undefined): HardwareCheckStatus {
  if (limit === undefined) return 'unknown';
  return pixels <= limit ? 'ok' : 'overload';
}

export function controllerLimit(model: string | undefined): ControllerLimit | undefined {
  if (!model) return undefined;
  return CONTROLLER_LIMITS
    .slice()
    .sort((a, b) => normalize(b.model).length - normalize(a.model).length)
    .find((limit) => modelMatch(model, limit.model));
}

/**
 * Returns a card profile only for the small, source-backed list. In particular,
 * A8s Pro and arbitrary imported names stay unknown rather than being matched
 * to a nearby model.
 */
export function receiverLimit(cardName: string | undefined): ReceiverLimit | undefined {
  if (!cardName) return undefined;
  return RECEIVER_LIMITS
    .slice()
    .sort((a, b) => normalize(b.model).length - normalize(a.model).length)
    .find((card) => modelMatch(cardName, card.model));
}

function receiverVariant(cardName: string, limit: ReceiverLimit): ReceiverLimitVariant | undefined {
  const normalized = normalize(cardName);
  if (limit.variants.length === 1) return limit.variants[0];
  if (normalized.includes('pwm')) return limit.variants.find((variant) => variant.id === 'pwm');
  if (normalized.includes('common')) return limit.variants.find((variant) => variant.id === 'common');
  return undefined;
}

export interface ControllerCanvasCheck {
  controller: string;
  pixels: number;
  limit?: number;
  ok: boolean;
  status: HardwareCheckStatus;
  source?: string;
  applicability?: string;
  reason?: string;
}

/**
 * Checks the aggregate pixels assigned to each physical controller. H9/H15
 * deliberately return unknown: their total loading is a function of chassis
 * variant and sending-card type, neither of which exists in Processor today.
 */
export function checkControllerCanvas(
  processor: Processor | undefined,
  pixelsPerCabinet: number,
  signal: SignalFormat = { bitDepth: 8, frameRateHz: 60 }
): ControllerCanvasCheck[] {
  if (!processor) return [];
  const groups = new Map<string, { model: string; cabinets: number }>();
  for (const port of processor.ports) {
    const model = controllerModel(port, processor);
    const profile = controllerLimit(model);
    // A modular H-series chassis has no single aggregate canvas in the
    // specification. Keep its cards together so the result is one explicit
    // unknown, while known standalone controllers remain per sending card.
    const key = profile?.maxCanvasPx === undefined
      ? model
      : controllerUnitKey(port, processor);
    const group = groups.get(key) ?? { model, cabinets: 0 };
    group.cabinets += port.assignedCabinets.length;
    groups.set(key, group);
  }

  return Array.from(groups.entries()).map(([key, group]) => {
    const profile = controllerLimit(group.model);
    const pixels = group.cabinets * pixelsPerCabinet;
    const limit = profile?.maxCanvasPxByBitDepth
      ? profile.maxCanvasPxByBitDepth[signal.bitDepth]
      : profile?.maxCanvasPx;
    const status = checkStatus(pixels, limit);
    const controllerId = key.split('\u0000')[1] ?? '';
    return {
      controller: controllerLabel(group.model, controllerId),
      pixels,
      ...(limit === undefined ? {} : { limit }),
      ok: status === 'ok',
      status,
      source: profile?.source,
      applicability: profile?.applicability,
      reason: profile
        ? limit === undefined
          ? profile.maxCanvasPx === undefined
            ? 'Total canvas limit requires the H-series chassis variant and sending-card type.'
            : `The ${signal.bitDepth}-bit canvas capacity is not stated in the cited specification.`
          : undefined
        : 'Controller model is not identified by the saved project.'
    };
  });
}

export interface ControllerPortCheck {
  controller: string;
  port: string;
  pixels: number;
  limit?: number;
  ok: boolean;
  status: HardwareCheckStatus;
  source?: string;
  applicability?: string;
  reason?: string;
}

/** Capacity check for the physical RJ45 port represented by a ProcessorPort. */
export function checkControllerPorts(
  processor: Processor | undefined,
  pixelsPerCabinet: number,
  signal: SignalFormat
): ControllerPortCheck[] {
  if (!processor) return [];
  return processor.ports.map((port) => {
    const model = port.controllerName ?? processor.model;
    const profile = controllerLimit(model);
    const limit = profile?.maxPixelsPerPort[signal.bitDepth];
    const pixels = port.assignedCabinets.length * pixelsPerCabinet;
    const status = checkStatus(pixels, limit);
    return {
      controller: model,
      port: port.sourcePortName ?? port.portId,
      pixels,
      ...(limit === undefined ? {} : { limit }),
      ok: status === 'ok',
      status,
      source: profile?.source,
      applicability: profile?.applicability,
      reason: profile
        ? limit === undefined
          ? `The ${signal.bitDepth}-bit port capacity is not stated in the cited specification.`
          : undefined
        : 'Controller model is not identified by the saved project.'
    };
  });
}

export interface SendingCardCheck {
  controller: string;
  cards: number;
  limit?: number;
  ok: boolean;
  status: HardwareCheckStatus;
  source?: string;
  applicability?: string;
  reason?: string;
}

/**
 * Checks installed sending-card count without collapsing H9/H15 variants.
 * H15 counts 11–16 are unknown until Standard versus Enhanced is supplied;
 * above 16 is an actual over-limit configuration.
 */
export function checkSendingCardCount(processor: Processor | undefined): SendingCardCheck[] {
  if (!processor) return [];
  const groups = new Map<string, { model: string; ids: Set<string> }>();
  for (const port of processor.ports) {
    const model = controllerModel(port, processor);
    const key = sendingCardGroupKey(port, processor);
    const group = groups.get(key) ?? { model, ids: new Set<string>() };
    group.ids.add(port.controllerId ?? '');
    groups.set(key, group);
  }

  return Array.from(groups.entries()).map(([, group]) => {
    const profile = controllerLimit(group.model);
    const cards = group.ids.size;
    const standardLimit = profile?.maxSendingCards;
    const enhancedLimit = profile?.maxSendingCardsEnhanced;
    if (standardLimit === undefined && enhancedLimit === undefined) return null;
    let status: HardwareCheckStatus;
    let limit: number | undefined;
    let reason: string | undefined;
    if (!profile || standardLimit === undefined || group.ids.has('')) {
      status = 'unknown';
      reason = !profile
        ? 'Controller model is not identified by the saved project.'
        : group.ids.has('')
          ? 'Sending-card identity is missing from the saved project.'
          : 'Sending-card count is not stated for this controller profile.';
    } else if (cards <= standardLimit) {
      status = 'ok';
      limit = standardLimit;
    } else if (enhancedLimit !== undefined && cards > standardLimit && cards <= enhancedLimit) {
      status = 'unknown';
      limit = enhancedLimit;
      reason = 'H-series Standard versus Enhanced chassis variant is not present in the saved project.';
    } else {
      limit = enhancedLimit ?? standardLimit;
      status = cards <= limit ? 'ok' : 'overload';
    }
    return {
      controller: group.model,
      cards,
      ...(limit === undefined ? {} : { limit }),
      ok: status === 'ok',
      status,
      source: profile?.source,
      applicability: profile?.applicability,
      reason
    };
  }).filter((check): check is SendingCardCheck => check !== null);
}

export interface ReceiverCheck {
  card: string;
  ok: boolean;
  status: HardwareCheckStatus;
  limitWidth?: number;
  limitHeight?: number;
  source?: string;
  applicability?: string;
  reason?: string;
}

export function checkReceiverCard(preset: CabinetPreset, signal: SignalFormat): ReceiverCheck {
  const cardName = preset.receiverCardName;
  const card = receiverLimit(cardName);
  if (!card || !cardName) {
    return {
      card: cardName || 'unknown',
      ok: false,
      status: 'unknown',
      reason: 'Receiving-card model is missing or is not identified by the saved project.'
    };
  }
  const variant = receiverVariant(cardName, card);
  if (!variant) {
    return {
      card: card.model,
      ok: false,
      status: 'unknown',
      source: card.source,
      applicability: card.applicability,
      reason: 'The receiving-card driver IC variant is required by the cited specification.'
    };
  }
  const limitWidth = signal.bitDepth === 12 && variant.maxWidthPx12bit !== undefined
    ? variant.maxWidthPx12bit
    : variant.maxWidthPx;
  const limitHeight = signal.bitDepth === 12 && variant.maxHeightPx12bit !== undefined
    ? variant.maxHeightPx12bit
    : variant.maxHeightPx;
  const status = preset.resolutionX <= limitWidth && preset.resolutionY <= limitHeight ? 'ok' : 'overload';
  return {
    card: card.model,
    ok: status === 'ok',
    status,
    limitWidth,
    limitHeight,
    source: card.source,
    applicability: variant.applicability
  };
}
