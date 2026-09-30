/**
 * Базовая модель данных для LED design tool.
 * Всё остальное приложение (canvas-редактор, data path, power path,
 * экспорт в pick-лист) строится вокруг этих интерфейсов.
 */

/** Один LED-кабинет/модуль конкретной модели (напр. Absen A3 Pro) */
export interface CabinetPreset {
  id: string;              // уникальный id пресета, напр. "absen-a3pro-500x500"
  brand: string;           // "Absen"
  model: string;           // "A3 Pro"
  widthMm: number;         // ширина кабинета, мм
  heightMm: number;        // высота кабинета, мм
  pixelPitchMm: number;    // шаг пикселя, мм (напр. 2.9)
  resolutionX: number;     // разрешение по X на кабинет, px
  resolutionY: number;     // разрешение по Y на кабинет, px
  weightKg: number;        // вес одного кабинета, кг
  maxPowerW: number;       // максимальное потребление, Вт (пиковое)
  avgPowerW: number;       // среднее потребление, Вт (обычно ~40-50% от max)
  receiverCardName?: string; // информационное поле из RCFG/RCFGX
}

/** Позиция одного кабинета в раскладке экрана */
export interface CabinetInstance {
  presetId: string;   // ссылка на CabinetPreset.id
  col: number;        // позиция в сетке, столбец (0-indexed)
  row: number;        // позиция в сетке, строка (0-indexed)
}

/** Экран целиком: сетка кабинетов + метаданные */
export interface Screen {
  id: string;
  name: string;                  // напр. "Главный экран сцены"
  cabinets: CabinetInstance[];   // все кабинеты раскладки
  cols: number;                  // размер сетки по X (кабинетов)
  rows: number;                  // размер сетки по Y (кабинетов)
}

export type OverlayPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

/** Цветовая тема интерфейса (скин DreamLaser Design System). */
export type UiSkin =
  | 'vscode' | 'corporate' | 'midnight' | 'carbon'
  | 'graphite' | 'ocean' | 'forest' | 'plum';

/** Все сохраняемые визуальные параметры одного экрана. */
export interface ScreenVisualSettings {
  showCabinetGrid: boolean;
  showCabinetNumbers: boolean;
  showTestGrid: boolean;
  config: PatternConfig;
  screenLabel: string;
  labelFontSize: number;
  textColor: string;
  showResolution: boolean;
  resolutionTextColor: string;
  logoSource: string | null;
  logoPosition: OverlayPosition;
  logoScalePercent: number;
  logoOpacityPercent: number;
}

/** Экран на рабочей области проекта; imageSource намеренно не сохраняется. */
export interface ScreenInstance {
  id: string;
  name: string;
  presetId: string;
  cols: number;
  rows: number;
  emptyCabinetKeys: string[];
  position: { x: number; y: number };
  rotation: 0 | 90 | 180 | 270;
  processor?: Processor;
  powerPlan?: PowerPlan;
  visualSettings: ScreenVisualSettings;
}

export interface Project {
  format: 'dl-screen-master-project';
  version: 1;
  name: string;
  createdAt: string;
  updatedAt: string;
  screens: ScreenInstance[];
  customPresets: CabinetPreset[];
}

/** Процессор/контроллер (напр. Novastar) — для data path mapping */
export interface Processor {
  id: string;
  brand: string;              // "Novastar"
  model: string;               // "MX40 Pro"
  ports: ProcessorPort[];
}

export interface ProcessorPort {
  portId: string;              // "Port 1"
  controllerId?: string;       // id/номер отправляющего устройства из исходного проекта
  controllerName?: string;     // модель отправляющего устройства, напр. "MCTRL4K"
  sourcePortName?: string;     // физическое имя выхода, напр. "A1"
  maxPixels: number;           // макс. пикселей на порт (ограничение железа)
  maxCabinets?: number;        // опционально: лимит по кол-ву кабинетов на порт
  assignedCabinets: string[];  // id назначенных CabinetInstance (col-row ключи)
}

export type PowerPhase = 'L1' | 'L2' | 'L3';

export interface PowerCircuit {
  id: string;
  name: string;
  phase: PowerPhase;
  assignedCabinets: string[];
}

export interface PowerPlan {
  voltage: number;
  circuitBreakerAmps: number;
  safetyMarginPercent: number;
  powerFactor: number;
  phases: 1 | 3;
  circuits: PowerCircuit[];
}

/** Результат расчёта питания для экрана */
export interface PowerCalculationResult {
  totalCabinets: number;
  totalWeightKg: number;
  totalWidthMm: number;
  totalHeightMm: number;
  totalMaxPowerW: number;
  totalAvgPowerW: number;
  recommendedCircuits: {
    phase: 'single' | 'three';
    circuitsNeeded: number;
    ampsPerCircuit: number;
  };
}

/** Настройки электросети для расчёта автоматов/фаз */
export interface PowerGridConfig {
  /** Для 3ф сети — линейное (межфазное) напряжение, например 400 В. */
  voltage: number;              // 230 (1ф EU), 400 (3ф EU) или 120 (US) и т.д.
  phase: 'single' | 'three';
  circuitBreakerAmps: number;   // напр. 16A, 32A
  safetyMarginPercent: number;  // запас, напр. 20 (= использовать 80% от лимита автомата)
  powerFactor: number;          // cos φ нагрузки, от 0 до 1 (например 0.95)
}
import type { PatternConfig } from './patterns';
