import { DEFAULT_SIGNAL } from './capacity';
import { DEFAULT_PATTERN_CONFIG, type PatternConfig } from './patterns';
import type { Lang } from './lang';
import type {
  CabinetPreset,
  OverlayPosition,
  PowerCircuit,
  PowerPlan,
  Processor,
  ProcessorPort,
  Project,
  ScreenInstance,
  ScreenVisualSettings,
  SignalFormat
} from './types';

const MAX_SCREENS = 1000;
const MAX_PRESETS = 2000;
const MAX_ROUTE_ITEMS = 1_000_000;
const MAX_TEXT = 500;
const MAX_LOGO_SOURCE = 20_000_000;
const OVERLAY_POSITIONS: OverlayPosition[] = [
  'top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'
];

type ValidationMessages = {
  object: string;
  array: string;
  required: (field: string) => string;
  type: (field: string, expected: string) => string;
  range: (field: string, min: number, max: number) => string;
  integer: (field: string) => string;
  enum: (field: string) => string;
  finite: (field: string) => string;
  invalidDate: (field: string) => string;
  duplicate: (field: string, value: string) => string;
  missingPreset: (screen: string, preset: string) => string;
  routeKey: string;
  routeDuplicate: (key: string) => string;
  unsupported: string;
};

const MESSAGES: Record<Lang, ValidationMessages> = {
  ru: {
    object: 'Ожидался JSON-объект',
    array: 'Ожидался JSON-массив',
    required: (field) => `Не заполнено поле ${field}`,
    type: (field, expected) => `Поле ${field}: ожидается ${expected}`,
    range: (field, min, max) => `Поле ${field}: допустимо ${min}–${max}`,
    integer: (field) => `Поле ${field}: требуется целое число`,
    enum: (field) => `Недопустимое значение поля ${field}`,
    finite: (field) => `Поле ${field}: число должно быть конечным`,
    invalidDate: (field) => `Поле ${field}: недопустимая дата`,
    duplicate: (field, value) => `Дубликат ${field}: ${value}`,
    missingPreset: (screen, preset) => `Экран «${screen}» ссылается на отсутствующий пресет «${preset}»`,
    routeKey: 'Маршрут содержит недопустимую координату кабинета',
    routeDuplicate: (key) => `Кабинет ${key} назначен в маршруте более одного раза`,
    unsupported: 'Неподдерживаемый формат проекта'
  },
  en: {
    object: 'A JSON object was expected',
    array: 'A JSON array was expected',
    required: (field) => `Field ${field} is required`,
    type: (field, expected) => `Field ${field}: ${expected} expected`,
    range: (field, min, max) => `Field ${field}: must be ${min}–${max}`,
    integer: (field) => `Field ${field}: an integer is required`,
    enum: (field) => `Invalid value for field ${field}`,
    finite: (field) => `Field ${field}: number must be finite`,
    invalidDate: (field) => `Field ${field}: invalid date`,
    duplicate: (field, value) => `Duplicate ${field}: ${value}`,
    missingPreset: (screen, preset) => `Screen “${screen}” references missing preset “${preset}”`,
    routeKey: 'A route contains an invalid cabinet coordinate',
    routeDuplicate: (key) => `Cabinet ${key} is assigned more than once in a route`,
    unsupported: 'Unsupported project format'
  }
};

export interface ProjectValidationOptions {
  lang?: Lang;
  /** Existing global presets may satisfy references without being copied into the file. */
  availablePresets?: CabinetPreset[];
}

export interface ProjectValidationResult {
  project?: Project;
  errors: string[];
}

export class ProjectValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[], lang: Lang = 'ru') {
    super(errors.length ? errors.join('; ') : MESSAGES[lang].unsupported);
    this.name = 'ProjectValidationError';
    this.errors = errors;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, messages: ValidationMessages, errors: string[], required = true): string | undefined {
  if (value === undefined && !required) return undefined;
  if (value === undefined || value === null) {
    errors.push(messages.required(field));
    return undefined;
  }
  if (typeof value !== 'string') {
    errors.push(messages.type(field, 'текст') as string);
    return undefined;
  }
  const result = value.trim();
  if (required && !result) errors.push(messages.required(field));
  if (result.length > MAX_TEXT) errors.push(messages.range(`${field}.length`, 0, MAX_TEXT));
  return result;
}

function finite(value: unknown, field: string, messages: ValidationMessages, errors: string[], min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(messages.finite(field));
    return undefined;
  }
  if (value < min || value > max) errors.push(messages.range(field, min, max));
  return value;
}

function integer(value: unknown, field: string, messages: ValidationMessages, errors: string[], min: number, max: number): number | undefined {
  const result = finite(value, field, messages, errors, min, max);
  if (result !== undefined && !Number.isSafeInteger(result)) errors.push(messages.integer(field));
  return result;
}

function bool(value: unknown, field: string, messages: ValidationMessages, errors: string[], fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    errors.push(messages.type(field, 'логическое значение'));
    return fallback;
  }
  return value;
}

function enumValue<T>(value: unknown, field: string, values: readonly T[], messages: ValidationMessages, errors: string[], fallback: T): T {
  if (value === undefined) return fallback;
  if (!values.includes(value as T)) {
    errors.push(messages.enum(field));
    return fallback;
  }
  return value as T;
}

function validColor(value: unknown, field: string, messages: ValidationMessages, errors: string[], fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
    errors.push(messages.type(field, '#RRGGBB'));
    return fallback;
  }
  return value;
}

function isoDate(value: unknown, field: string, messages: ValidationMessages, errors: string[], fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    errors.push(messages.invalidDate(field));
    return fallback;
  }
  return value;
}

function arrayValue(value: unknown, field: string, messages: ValidationMessages, errors: string[], optional = false): unknown[] {
  if (value === undefined && optional) return [];
  if (!Array.isArray(value)) {
    errors.push(messages.type(field, 'массив'));
    return [];
  }
  return value;
}

function parsePreset(value: unknown, field: string, messages: ValidationMessages, errors: string[]): CabinetPreset | undefined {
  if (!isRecord(value)) {
    errors.push(`${field}: ${messages.object}`);
    return undefined;
  }
  const id = text(value.id, `${field}.id`, messages, errors);
  const brand = text(value.brand, `${field}.brand`, messages, errors);
  const model = text(value.model, `${field}.model`, messages, errors);
  const widthMm = finite(value.widthMm, `${field}.widthMm`, messages, errors, 10, 5000);
  const heightMm = finite(value.heightMm, `${field}.heightMm`, messages, errors, 10, 5000);
  const pixelPitchMm = finite(value.pixelPitchMm, `${field}.pixelPitchMm`, messages, errors, .1, 100);
  const resolutionX = integer(value.resolutionX, `${field}.resolutionX`, messages, errors, 1, 16384);
  const resolutionY = integer(value.resolutionY, `${field}.resolutionY`, messages, errors, 1, 16384);
  const weightKg = finite(value.weightKg, `${field}.weightKg`, messages, errors, .01, 500);
  const maxPowerW = finite(value.maxPowerW, `${field}.maxPowerW`, messages, errors, .1, 10000);
  const avgPowerW = finite(value.avgPowerW, `${field}.avgPowerW`, messages, errors, .1, 10000);
  const receiverCardName = text(value.receiverCardName, `${field}.receiverCardName`, messages, errors, false);
  if (avgPowerW !== undefined && maxPowerW !== undefined && avgPowerW > maxPowerW) {
    errors.push(`${field}.avgPowerW: ${messages.range('average/max power', 0, maxPowerW)}`);
  }
  if (id === undefined || brand === undefined || model === undefined || widthMm === undefined || heightMm === undefined ||
    pixelPitchMm === undefined || resolutionX === undefined || resolutionY === undefined || weightKg === undefined ||
    maxPowerW === undefined || avgPowerW === undefined) return undefined;
  return { id, brand, model, widthMm, heightMm, pixelPitchMm, resolutionX, resolutionY, weightKg, maxPowerW, avgPowerW, ...(receiverCardName ? { receiverCardName } : {}) };
}

function parsePattern(value: unknown, field: string, messages: ValidationMessages, errors: string[]): PatternConfig {
  const source = isRecord(value) ? value : {};
  if (value !== undefined && !isRecord(value)) errors.push(`${field}: ${messages.object}`);
  const type = enumValue(source.type, `${field}.type`, ['checkerboard'] as const, messages, errors, 'checkerboard');
  const cellSizePx = finite(source.cellSizePx ?? DEFAULT_PATTERN_CONFIG.cellSizePx, `${field}.cellSizePx`, messages, errors, 1, 100000) ?? DEFAULT_PATTERN_CONFIG.cellSizePx;
  const colorA = validColor(source.colorA, `${field}.colorA`, messages, errors, DEFAULT_PATTERN_CONFIG.colorA);
  const colorB = validColor(source.colorB, `${field}.colorB`, messages, errors, DEFAULT_PATTERN_CONFIG.colorB);
  let palette: string[] | undefined;
  if (source.palette !== undefined) {
    const values = arrayValue(source.palette, `${field}.palette`, messages, errors);
    if (values.length < 2 || values.length > 32) errors.push(messages.range(`${field}.palette.length`, 2, 32));
    palette = values.map((item, index) => validColor(item, `${field}.palette[${index}]`, messages, errors, colorA));
  }
  return { type, cellSizePx, colorA, colorB, ...(palette ? { palette } : {}) };
}

function parseVisualSettings(value: unknown, screenName: string, messages: ValidationMessages, errors: string[]): ScreenVisualSettings {
  const source = isRecord(value) ? value : {};
  if (value !== undefined && !isRecord(value)) errors.push(`screens[${screenName}].visualSettings: ${messages.object}`);
  const logoSource = source.logoSource === undefined || source.logoSource === null
    ? null
    : typeof source.logoSource === 'string' && source.logoSource.length <= MAX_LOGO_SOURCE
      ? source.logoSource
      : (errors.push(messages.range('visualSettings.logoSource.length', 0, MAX_LOGO_SOURCE)), null);
  return {
    showCabinetGrid: bool(source.showCabinetGrid, 'visualSettings.showCabinetGrid', messages, errors, true),
    showCabinetNumbers: bool(source.showCabinetNumbers, 'visualSettings.showCabinetNumbers', messages, errors, false),
    showTestGrid: bool(source.showTestGrid, 'visualSettings.showTestGrid', messages, errors, false),
    config: parsePattern(source.config, 'visualSettings.config', messages, errors),
    screenLabel: text(source.screenLabel, 'visualSettings.screenLabel', messages, errors, false) ?? screenName,
    labelFontSize: finite(source.labelFontSize ?? 54, 'visualSettings.labelFontSize', messages, errors, 1, 1000) ?? 54,
    textColor: validColor(source.textColor, 'visualSettings.textColor', messages, errors, '#ffffff'),
    showResolution: bool(source.showResolution, 'visualSettings.showResolution', messages, errors, false),
    resolutionTextColor: validColor(source.resolutionTextColor, 'visualSettings.resolutionTextColor', messages, errors, '#ffffff'),
    logoSource,
    logoPosition: enumValue(source.logoPosition, 'visualSettings.logoPosition', OVERLAY_POSITIONS, messages, errors, 'top-right'),
    logoScalePercent: finite(source.logoScalePercent ?? 20, 'visualSettings.logoScalePercent', messages, errors, 0, 100) ?? 20,
    logoOpacityPercent: finite(source.logoOpacityPercent ?? 50, 'visualSettings.logoOpacityPercent', messages, errors, 0, 100) ?? 50
  };
}

function routeKeys(value: unknown, field: string, cols: number, rows: number, empty: Set<string>, used: Set<string>, messages: ValidationMessages, errors: string[]): string[] {
  const values = arrayValue(value, field, messages, errors, true);
  if (values.length > Math.min(MAX_ROUTE_ITEMS, cols * rows)) errors.push(messages.range(`${field}.length`, 0, Math.min(MAX_ROUTE_ITEMS, cols * rows)));
  const result: string[] = [];
  for (const [index, item] of values.entries()) {
    if (typeof item !== 'string' || !/^\d+-\d+$/.test(item)) {
      errors.push(`${field}[${index}]: ${messages.routeKey}`);
      continue;
    }
    const [col, row] = item.split('-').map(Number);
    if (col < 0 || col >= cols || row < 0 || row >= rows || empty.has(item)) {
      errors.push(`${field}[${index}]: ${messages.routeKey}`);
      continue;
    }
    if (used.has(item)) errors.push(messages.routeDuplicate(item));
    used.add(item);
    result.push(item);
  }
  return result;
}

function parseProcessor(value: unknown, field: string, screen: { cols: number; rows: number; empty: Set<string> }, messages: ValidationMessages, errors: string[]): Processor | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    errors.push(`${field}: ${messages.object}`);
    return undefined;
  }
  const id = text(value.id, `${field}.id`, messages, errors);
  const brand = text(value.brand, `${field}.brand`, messages, errors);
  const model = text(value.model, `${field}.model`, messages, errors);
  const portsValue = arrayValue(value.ports, `${field}.ports`, messages, errors);
  const used = new Set<string>();
  const ports: ProcessorPort[] = [];
  for (const [index, raw] of portsValue.entries()) {
    const portField = `${field}.ports[${index}]`;
    if (!isRecord(raw)) {
      errors.push(`${portField}: ${messages.object}`);
      continue;
    }
    const portId = text(raw.portId, `${portField}.portId`, messages, errors);
    const controllerId = text(raw.controllerId, `${portField}.controllerId`, messages, errors, false);
    const controllerName = text(raw.controllerName, `${portField}.controllerName`, messages, errors, false);
    const sourcePortName = text(raw.sourcePortName, `${portField}.sourcePortName`, messages, errors, false);
    const maxPixels = finite(raw.maxPixels, `${portField}.maxPixels`, messages, errors, 1, 1_000_000_000);
    const maxCabinets = raw.maxCabinets === undefined ? undefined : integer(raw.maxCabinets, `${portField}.maxCabinets`, messages, errors, 1, screen.cols * screen.rows);
    let link: ProcessorPort['link'];
    if (raw.link !== undefined) {
      if (!isRecord(raw.link)) errors.push(`${portField}.link: ${messages.object}`);
      else {
        const speedGbps = finite(raw.link.speedGbps, `${portField}.link.speedGbps`, messages, errors, .001, 1000);
        const efficiency = finite(raw.link.efficiency, `${portField}.link.efficiency`, messages, errors, .01, 1);
        const packing = enumValue(raw.link.packing, `${portField}.link.packing`, ['container', 'container-legacy', 'naive'] as const, messages, errors, 'container');
        if (speedGbps !== undefined && efficiency !== undefined) link = { speedGbps, efficiency, packing };
      }
    }
    const assignedCabinets = routeKeys(raw.assignedCabinets, `${portField}.assignedCabinets`, screen.cols, screen.rows, screen.empty, used, messages, errors);
    if (portId && maxPixels !== undefined) ports.push({ portId, ...(controllerId ? { controllerId } : {}), ...(controllerName ? { controllerName } : {}), ...(sourcePortName ? { sourcePortName } : {}), maxPixels, ...(maxCabinets !== undefined ? { maxCabinets } : {}), ...(link ? { link } : {}), assignedCabinets });
  }
  if (!id || !brand || !model) return undefined;
  return { id, brand, model, ports };
}

function parsePowerPlan(value: unknown, field: string, screen: { cols: number; rows: number; empty: Set<string> }, messages: ValidationMessages, errors: string[]): PowerPlan | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    errors.push(`${field}: ${messages.object}`);
    return undefined;
  }
  const voltage = finite(value.voltage, `${field}.voltage`, messages, errors, 1, 1000);
  const circuitBreakerAmps = finite(value.circuitBreakerAmps, `${field}.circuitBreakerAmps`, messages, errors, .1, 1000);
  const safetyMarginPercent = finite(value.safetyMarginPercent, `${field}.safetyMarginPercent`, messages, errors, 0, 100);
  const powerFactor = finite(value.powerFactor, `${field}.powerFactor`, messages, errors, .01, 1);
  const phases = enumValue<PowerPlan['phases']>(value.phases, `${field}.phases`, [1, 3] as const, messages, errors, 1);
  const circuitsValue = arrayValue(value.circuits, `${field}.circuits`, messages, errors);
  const used = new Set<string>();
  const circuits: PowerCircuit[] = [];
  for (const [index, raw] of circuitsValue.entries()) {
    const circuitField = `${field}.circuits[${index}]`;
    if (!isRecord(raw)) {
      errors.push(`${circuitField}: ${messages.object}`);
      continue;
    }
    const id = text(raw.id, `${circuitField}.id`, messages, errors);
    const name = text(raw.name, `${circuitField}.name`, messages, errors);
    const phase = enumValue(raw.phase, `${circuitField}.phase`, ['L1', 'L2', 'L3'] as const, messages, errors, 'L1');
    const assignedCabinets = routeKeys(raw.assignedCabinets, `${circuitField}.assignedCabinets`, screen.cols, screen.rows, screen.empty, used, messages, errors);
    if (id && name) circuits.push({ id, name, phase, assignedCabinets });
  }
  if (voltage === undefined || circuitBreakerAmps === undefined || safetyMarginPercent === undefined || powerFactor === undefined) return undefined;
  return { voltage, circuitBreakerAmps, safetyMarginPercent, powerFactor, phases, circuits };
}

function parseSignal(value: unknown, messages: ValidationMessages, errors: string[]): SignalFormat | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    errors.push(`signal: ${messages.object}`);
    return undefined;
  }
  const bitDepth = enumValue<SignalFormat['bitDepth']>(value.bitDepth, 'signal.bitDepth', [8, 10, 12] as const, messages, errors, DEFAULT_SIGNAL.bitDepth);
  const frameRateHz = finite(value.frameRateHz, 'signal.frameRateHz', messages, errors, 1, 240) ?? DEFAULT_SIGNAL.frameRateHz;
  return { bitDepth, frameRateHz };
}

function normalizePresetList(value: unknown, field: string, messages: ValidationMessages, errors: string[]): CabinetPreset[] {
  const values = arrayValue(value, field, messages, errors, true);
  if (values.length > MAX_PRESETS) errors.push(messages.range(`${field}.length`, 0, MAX_PRESETS));
  const result: CabinetPreset[] = [];
  const ids = new Set<string>();
  for (const [index, raw] of values.entries()) {
    const preset = parsePreset(raw, `${field}[${index}]`, messages, errors);
    if (!preset) continue;
    if (ids.has(preset.id)) errors.push(messages.duplicate(`${field}.id`, preset.id));
    ids.add(preset.id);
    result.push(preset);
  }
  return result;
}

function parseScreen(value: unknown, index: number, presetIds: Set<string>, messages: ValidationMessages, errors: string[]): ScreenInstance | undefined {
  const field = `screens[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${field}: ${messages.object}`);
    return undefined;
  }
  const id = text(value.id, `${field}.id`, messages, errors);
  const name = text(value.name, `${field}.name`, messages, errors) ?? id ?? `Screen_${index + 1}`;
  const presetId = text(value.presetId, `${field}.presetId`, messages, errors);
  const cols = integer(value.cols, `${field}.cols`, messages, errors, 1, 1000) ?? 1;
  const rows = integer(value.rows, `${field}.rows`, messages, errors, 1, 1000) ?? 1;
  const emptyValue = arrayValue(value.emptyCabinetKeys, `${field}.emptyCabinetKeys`, messages, errors, true);
  const empty = new Set<string>();
  const emptyCabinetKeys: string[] = [];
  for (const [emptyIndex, raw] of emptyValue.entries()) {
    if (typeof raw !== 'string' || !/^\d+-\d+$/.test(raw)) {
      errors.push(`${field}.emptyCabinetKeys[${emptyIndex}]: ${messages.routeKey}`);
      continue;
    }
    const [col, row] = raw.split('-').map(Number);
    if (col >= cols || row >= rows) errors.push(`${field}.emptyCabinetKeys[${emptyIndex}]: ${messages.routeKey}`);
    if (empty.has(raw)) errors.push(messages.duplicate(`${field}.emptyCabinetKeys`, raw));
    empty.add(raw);
    emptyCabinetKeys.push(raw);
  }
  if (presetId && !presetIds.has(presetId)) errors.push(messages.missingPreset(name, presetId));
  const positionSource = isRecord(value.position) ? value.position : {};
  if (value.position !== undefined && !isRecord(value.position)) errors.push(`${field}.position: ${messages.object}`);
  const x = finite(positionSource.x ?? 0, `${field}.position.x`, messages, errors, -10_000_000, 10_000_000) ?? 0;
  const y = finite(positionSource.y ?? 0, `${field}.position.y`, messages, errors, -10_000_000, 10_000_000) ?? 0;
  const rotation = enumValue<ScreenInstance['rotation']>(value.rotation, `${field}.rotation`, [0, 90, 180, 270] as const, messages, errors, 0);
  const visualSettings = parseVisualSettings(value.visualSettings, name, messages, errors);
  const routeGrid = { cols, rows, empty };
  const processor = parseProcessor(value.processor, `${field}.processor`, routeGrid, messages, errors);
  const powerPlan = parsePowerPlan(value.powerPlan, `${field}.powerPlan`, routeGrid, messages, errors);
  if (!id || !presetId) return undefined;
  return { id, name, presetId, cols, rows, emptyCabinetKeys, position: { x, y }, rotation, visualSettings, ...(processor ? { processor } : {}), ...(powerPlan ? { powerPlan } : {}) };
}

export function validateProject(value: unknown, options: ProjectValidationOptions = {}): ProjectValidationResult {
  const lang = options.lang ?? 'ru';
  const messages = MESSAGES[lang];
  const errors: string[] = [];
  if (!isRecord(value)) return { errors: [messages.object] };
  if (value.format !== 'dl-screen-master-project' || value.version !== 1) errors.push(messages.unsupported);
  const customPresets = normalizePresetList(value.customPresets, 'customPresets', messages, errors);
  const sessionPresets = normalizePresetList(value.sessionPresets, 'sessionPresets', messages, errors);
  const available = options.availablePresets ?? [];
  const presetIds = new Set([...available, ...customPresets, ...sessionPresets].map((preset) => preset.id));
  const screensValue = arrayValue(value.screens, 'screens', messages, errors);
  if (screensValue.length > MAX_SCREENS) errors.push(messages.range('screens.length', 0, MAX_SCREENS));
  const screenIds = new Set<string>();
  const screens: ScreenInstance[] = [];
  for (const [index, raw] of screensValue.entries()) {
    const screen = parseScreen(raw, index, presetIds, messages, errors);
    if (!screen) continue;
    if (screenIds.has(screen.id)) errors.push(messages.duplicate('screens.id', screen.id));
    screenIds.add(screen.id);
    screens.push(screen);
  }
  const name = text(value.name, 'name', messages, errors, false) ?? 'Untitled';
  const now = new Date().toISOString();
  const createdAt = isoDate(value.createdAt, 'createdAt', messages, errors, now);
  const updatedAt = isoDate(value.updatedAt, 'updatedAt', messages, errors, now);
  const signal = parseSignal(value.signal, messages, errors);
  if (errors.length) return { errors };
  return {
    errors: [],
    project: {
      format: 'dl-screen-master-project', version: 1, name, createdAt, updatedAt,
      screens, customPresets, sessionPresets, ...(signal ? { signal } : {})
    }
  };
}

export function parseProject(value: unknown, options: ProjectValidationOptions = {}): Project {
  const result = validateProject(value, options);
  if (!result.project) throw new ProjectValidationError(result.errors, options.lang ?? 'ru');
  return result.project;
}
