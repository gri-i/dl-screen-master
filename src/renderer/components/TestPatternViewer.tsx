import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CabinetPreset,
  OverlayPosition,
  ScreenInstance,
  ScreenVisualSettings,
  Processor,
  ProcessorPort,
  PowerPlan
} from '@shared/types';
import {
  DEFAULT_PATTERN_CONFIG,
  drawPattern,
  drawCabinetGrid,
  type PatternConfig
} from '@shared/patterns';
import type { ScreenConfig } from './PowerCalculator';
import { importNovaStarProject } from '../novastarImport';
import { PowerPathPlanner } from './PowerPathPlanner';
import { buildReportHtml, type ExportScreen } from '../projectExport';
import {
  generateCabinetOrder,
  generatePowerPlan,
  routeProcessor,
  type RoutingPattern,
  type StartCorner
} from '@shared/autoRouting';
import { usablePowerPerPortW } from '@shared/powerLimits';
import type { Lang } from '@shared/lang';
import { useLanguage } from '../i18n/context';

function overlayPositionLabels(t: (key: string) => string): Record<OverlayPosition, string> {
  return {
    'top-left': t('tpv.direction.topLeft'),
    'top-center': t('tpv.direction.topCenter'),
    'top-right': t('tpv.direction.topRight'),
    'bottom-left': t('tpv.direction.bottomLeft'),
    'bottom-center': t('tpv.direction.bottomCenter'),
    'bottom-right': t('tpv.direction.bottomRight')
  };
}

const CHECKERBOARD_COLOR_PRESETS = [
  {
    id: 'multicolor25',
    nameKey: 'tpv.colorScheme.multicolor25',
    colorA: '#400000',
    colorB: '#004000',
    palette: ['#400000', '#004000', '#000040', '#004040', '#400040', '#404000']
  },
  { id: 'green', nameKey: 'tpv.colorScheme.green', colorA: '#25b43a', colorB: '#454545' },
  { id: 'red', nameKey: 'tpv.colorScheme.red', colorA: '#ef3340', colorB: '#454545' },
  { id: 'blue', nameKey: 'tpv.colorScheme.blue', colorA: '#0752ce', colorB: '#454545' },
  { id: 'yellow', nameKey: 'tpv.colorScheme.yellow', colorA: '#ffda19', colorB: '#454545' },
  { id: 'orange', nameKey: 'tpv.colorScheme.orange', colorA: '#ff4b26', colorB: '#454545' },
  { id: 'teal', nameKey: 'tpv.colorScheme.teal', colorA: '#16a9ba', colorB: '#454545' },
  { id: 'purple', nameKey: 'tpv.colorScheme.purple', colorA: '#9a6bd1', colorB: '#454545' }
] as const;

function fullBrightnessColor(color: string): string {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return color;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16));
  const peak = Math.max(...channels);
  if (peak === 0 || peak === 255) return color;
  return `#${channels.map((channel) => Math.round(channel * 255 / peak).toString(16).padStart(2, '0')).join('')}`;
}

function colorBrightness(color: string): number {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return 255;
  const red = Number.parseInt(match[1].slice(0, 2), 16);
  const green = Number.parseInt(match[1].slice(2, 4), 16);
  const blue = Number.parseInt(match[1].slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000;
}

function visiblePatternConfig(source: PatternConfig): PatternConfig {
  const colors = source.palette && source.palette.length > 1 ? source.palette : [source.colorA, source.colorB];
  const brightest = Math.max(...colors.map(colorBrightness));
  const darkest = Math.min(...colors.map(colorBrightness));
  if (brightest < 55 || brightest - darkest < 28) return clonePatternConfig(DEFAULT_PATTERN_CONFIG);
  return clonePatternConfig(source);
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TEXT_COLOR_PALETTE = [
  '#ffffff', '#000000', '#ef4444', '#f59e0b', '#facc15',
  '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'
];

function dataPortsBySendingCard(ports: ProcessorPort[]): Array<{ key: string; title: string; ports: ProcessorPort[] }> {
  const groups = new Map<string, { key: string; title: string; ports: ProcessorPort[] }>();
  for (const port of ports) {
    const key = `${port.controllerId ?? ''}\u0000${port.controllerName ?? ''}` || 'default';
    const current = groups.get(key);
    if (current) {
      current.ports.push(port);
      continue;
    }
    const cardNumber = port.controllerId?.match(/\d+/)?.[0] ?? port.controllerId;
    const sendingCard = cardNumber ? `Sending card ${cardNumber}` : 'Sending card';
    groups.set(key, {
      key,
      title: port.controllerName ? `${sendingCard} · ${port.controllerName}` : sendingCard,
      ports: [port]
    });
  }
  return [...groups.values()];
}

function overlayCoordinates(
  position: OverlayPosition,
  contentWidth: number,
  contentHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  padding = 24
): { x: number; y: number } {
  const x = position.endsWith('left')
    ? padding
    : position.endsWith('right')
      ? canvasWidth - contentWidth - padding
      : (canvasWidth - contentWidth) / 2;
  const y = position.startsWith('top') ? padding : canvasHeight - contentHeight - padding;
  return { x, y };
}

interface TestPatternViewerProps {
  projectName: string;
  workspaceMode: 'pixel-mask' | 'wiring';
  screenConfig: ScreenConfig;
  onScreenConfigChange: React.Dispatch<React.SetStateAction<ScreenConfig>>;
  onScreenSummariesChange: (summaries: ScreenHeaderSummary[]) => void;
  addScreenSignal: number;
  clearScreensSignal: number;
  presets: CabinetPreset[];
  onPresetsImport: (presets: CabinetPreset[]) => void;
  projectScreens: ScreenInstance[] | null;
  projectLoadSignal: number;
  onProjectScreensChange: (screens: ScreenInstance[]) => void;
}

export interface ScreenHeaderSummary {
  id: string;
  name: string;
  cabinetLabel: string;
  sizeLabel: string;
  layoutLabel: string;
  isSelected: boolean;
}

interface PlacedScreen {
  id: string;
  name: string;
  imageSource: string;
  screenConfig: ScreenConfig;
  visualSettings: ScreenVisualSettings;
  width: number;
  height: number;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  processor?: Processor;
  powerPlan?: PowerPlan;
}

const SNAP_DISTANCE_PX = 10;
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
// Экраны на холсте раскладки размещаются пропорционально пиксельному
// разрешению (resolutionX/Y), а не физическому размеру кабинета в мм —
// иначе два экрана на одинаковых по мм кабинетах, но с разным шагом
// пикселя, выглядели бы на холсте одного размера, хотя разрешение у них разное.
// Масштаб 1 = один CSS-пиксель холста на один нативный пиксель маски: при
// меньшем масштабе <img> растягивает/сжимает PNG заметно сильнее native-размера
// и даёт замыленную картинку (особенно на небольших по разрешению экранах);
// обзор больших раскладок регулируется колесом (workspaceZoom), а не этим множителем.
const WORKSPACE_PX_PER_PIXEL = 1;

// Для H9/H15 ports/maxPixelsPerPort — характеристики ОДНОЙ сендинг-карты
// H_16xRJ45; maxSendingCards — сколько таких карт вмещает шасси. Итоговое
// число портов контроллера = ports × выбранное количество карт (см. UI
// «Sending-карт» и createNovaStarProcessor).
const NOVASTAR_CONTROLLERS: { model: string; ports: number; maxPixelsPerPort: number; maxSendingCards?: number }[] = [
  { model: 'MCTRL4K', ports: 16, maxPixelsPerPort: 650000 },
  { model: 'MCTRL660', ports: 4, maxPixelsPerPort: 650000 },
  { model: 'MCTRL660 Pro', ports: 6, maxPixelsPerPort: 650000 },
  { model: 'H9', ports: 16, maxPixelsPerPort: 650000, maxSendingCards: 5 },
  { model: 'H15', ports: 16, maxPixelsPerPort: 650000, maxSendingCards: 10 }
];

function screenDisplaySize(
  preset: CabinetPreset,
  cols: number,
  rows: number,
  rotation: 0 | 90 | 180 | 270
): { width: number; height: number } {
  const width = preset.resolutionX * cols * WORKSPACE_PX_PER_PIXEL;
  const height = preset.resolutionY * rows * WORKSPACE_PX_PER_PIXEL;
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

function screensOverlap(screens: PlacedScreen[]): boolean {
  return screens.some((screen, index) => screens.slice(index + 1).some((other) =>
    screen.x < other.x + other.width && screen.x + screen.width > other.x &&
    screen.y < other.y + other.height && screen.y + screen.height > other.y
  ));
}

function cloneProcessor(processor?: Processor): Processor | undefined {
  return processor ? {
    ...processor,
    ports: processor.ports.map((port) => ({ ...port, assignedCabinets: [...port.assignedCabinets] }))
  } : undefined;
}

function clonePowerPlan(plan?: PowerPlan): PowerPlan | undefined {
  return plan ? {
    ...plan,
    circuits: plan.circuits.map((circuit) => ({ ...circuit, assignedCabinets: [...circuit.assignedCabinets] }))
  } : undefined;
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function clonePatternConfig(config: PatternConfig): PatternConfig {
  return {
    type: 'checkerboard',
    cellSizePx: Number.isFinite(config.cellSizePx) ? config.cellSizePx : DEFAULT_PATTERN_CONFIG.cellSizePx,
    colorA: config.colorA || DEFAULT_PATTERN_CONFIG.colorA,
    colorB: config.colorB || DEFAULT_PATTERN_CONFIG.colorB,
    palette: config.palette ? [...config.palette] : undefined
  };
}

const DEFAULT_VISUAL_SETTINGS: ScreenVisualSettings = {
  showCabinetGrid: true,
  showCabinetNumbers: false,
  showTestGrid: false,
  config: clonePatternConfig(DEFAULT_PATTERN_CONFIG),
  screenLabel: 'Screen_1',
  labelFontSize: 54,
  textColor: '#ffffff',
  showResolution: false,
  resolutionTextColor: '#ffffff',
  logoSource: null,
  logoPosition: 'top-right',
  logoScalePercent: 20,
  logoOpacityPercent: 50
};

const LABEL_REFERENCE_DIAGONAL = Math.hypot(6 * 128, 4 * 128);

function scaledLabelFontSize(baseSize: number, width: number, height: number): number {
  const scale = Math.hypot(width, height) / LABEL_REFERENCE_DIAGONAL;
  return Math.round(Math.max(12, Math.min(Math.min(width, height) * .34, baseSize * scale)));
}

function renderProjectPreview(screen: ScreenInstance, preset: CabinetPreset): string {
  const canvas = document.createElement('canvas');
  canvas.width = preset.resolutionX * screen.cols;
  canvas.height = preset.resolutionY * screen.rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const settings = screen.visualSettings;
  const effectiveLabelFontSize = scaledLabelFontSize(settings.labelFontSize, canvas.width, canvas.height);
  drawPattern(ctx, canvas.width, canvas.height, settings.config, {
    checkerCellWidthPx: preset.resolutionX,
    checkerCellHeightPx: preset.resolutionY
  });
  if (settings.showCabinetGrid) {
    drawCabinetGrid(ctx, preset.resolutionX, preset.resolutionY, screen.cols, screen.rows);
  }
  if (settings.screenLabel) {
    ctx.save();
    ctx.font = `700 ${effectiveLabelFontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, effectiveLabelFontSize * 0.08);
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = fullBrightnessColor(settings.textColor);
    ctx.strokeText(settings.screenLabel, canvas.width / 2, canvas.height / 2);
    ctx.fillText(settings.screenLabel, canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }
  if (settings.showResolution) {
    ctx.save();
    ctx.font = `500 ${Math.max(10, effectiveLabelFontSize * .72)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = fullBrightnessColor(settings.resolutionTextColor);
    ctx.fillText(`${canvas.width} × ${canvas.height}`, canvas.width / 2, canvas.height / 2 + effectiveLabelFontSize);
    ctx.restore();
  }
  for (const key of screen.emptyCabinetKeys) {
    const [col, row] = key.split('-').map(Number);
    ctx.clearRect(col * preset.resolutionX, row * preset.resolutionY, preset.resolutionX, preset.resolutionY);
  }
  return canvas.toDataURL('image/png');
}

/**
 * Новый раздел приложения: визуальный превью тестовых паттернов
 * (шахматка, цветные полосы, градиент, сетка) в реальном разрешении
 * экрана, с настройками и информационной панелью (разрешение, физический
 * размер, шаг пикселя).
 *
 * Модель и размеры экрана приходят из общего состояния App, поэтому
 * совпадают с данными в калькуляторе питания.
 */
export function TestPatternViewer({
  projectName,
  workspaceMode,
  screenConfig,
  onScreenConfigChange,
  onScreenSummariesChange,
  addScreenSignal,
  clearScreensSignal,
  presets,
  onPresetsImport,
  projectScreens,
  projectLoadSignal,
  onProjectScreensChange
}: TestPatternViewerProps): JSX.Element {
  const { t, lang } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasPaneRef = useRef<HTMLDivElement>(null);
  const canvasStageRef = useRef<HTMLDivElement>(null);

  const { presetId, cols, rows } = screenConfig;
  const [showCabinetGrid, setShowCabinetGrid] = useState(true);
  const [showCabinetNumbers, setShowCabinetNumbers] = useState(false);
  const [showTestGrid, setShowTestGrid] = useState(false);
  const [config, setConfig] = useState<PatternConfig>(DEFAULT_PATTERN_CONFIG);
  const [screenLabel, setScreenLabel] = useState('Screen_1');
  const [labelFontSize, setLabelFontSize] = useState(54);
  const [textColor, setTextColor] = useState('#ffffff');
  const [showResolution, setShowResolution] = useState(false);
  const [resolutionTextColor, setResolutionTextColor] = useState('#ffffff');
  const [logoSource, setLogoSource] = useState<string | null>(null);
  const [logoName, setLogoName] = useState('');
  const [logoPosition, setLogoPosition] = useState<OverlayPosition>('top-right');
  const [logoScalePercent, setLogoScalePercent] = useState(20);
  const [logoOpacityPercent, setLogoOpacityPercent] = useState(50);
  const [logoLoadRevision, setLogoLoadRevision] = useState(0);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const [placedScreens, setPlacedScreens] = useState<PlacedScreen[]>([]);
  const [selectedPlacedScreenId, setSelectedPlacedScreenId] = useState<string | null>(null);
  const [selectedScreenIds, setSelectedScreenIds] = useState<string[]>([]);
  const [isEditingScreen, setIsEditingScreen] = useState(false);
  const [workspaceZoom, setWorkspaceZoom] = useState(1);
  const [workspaceOffset, setWorkspaceOffset] = useState({ x: 0, y: 0 });
  const [isPanningWorkspace, setIsPanningWorkspace] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [activeDataPortId, setActiveDataPortId] = useState<string | null>(null);
  const [isEditingDataPath, setIsEditingDataPath] = useState(false);
  const [activePowerCircuitId, setActivePowerCircuitId] = useState<string | null>(null);
  const [isEditingPowerPath, setIsEditingPowerPath] = useState(false);
  const [newControllerModel, setNewControllerModel] = useState<string>(NOVASTAR_CONTROLLERS[0].model);
  const [newControllerSendingCards, setNewControllerSendingCards] = useState(1);
  const [controllerFormMode, setControllerFormMode] = useState<'change' | 'add' | null>(null);
  const [pathPanelMode, setPathPanelMode] = useState<'data' | 'power'>('data');
  const [autoRoutingPattern, setAutoRoutingPattern] = useState<RoutingPattern>('snake-rows');
  const [autoRoutingCorner, setAutoRoutingCorner] = useState<StartCorner>('top-left');
  const [autoRoutingReverse, setAutoRoutingReverse] = useState(false);
  const [showAutoRoutingPreview, setShowAutoRoutingPreview] = useState(false);
  // Превью-сетка красит кабинеты либо по data-портам, либо по силовым цепям —
  // эти две раскладки группируют кабинеты по РАЗНЫМ лимитам (пиксели порта
  // против мощности цепи) и границы групп почти никогда не совпадают, так что
  // не стоит показывать одну из них и выдавать за превью обеих "Применить".
  const [autoPreviewMode, setAutoPreviewMode] = useState<'data' | 'power'>('data');
  // null = лимит кабинетов на силовую линию считается автоматически из
  // мощности кабинета/автомата; число — ручной лимит (напр. из-за длины
  // кабеля), который может электрически перегрузить линию — тогда покажем
  // предупреждение, а не молча подрежем его до "безопасного" значения.
  const [autoPowerCabinetLimit, setAutoPowerCabinetLimit] = useState<number | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ x?: number; y?: number }>({});
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number; additive: boolean } | null>(null);
  const pathDrawRef = useRef<{ screenId: string; cabinetKey: string; button: 0 | 2; moved: boolean } | null>(null);
  const placedDragRef = useRef<{
    id: string; x: number; y: number; origins: Record<string, { x: number; y: number }>;
  } | null>(null);
  const workspacePanRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const historyRef = useRef<{ past: PlacedScreen[][]; future: PlacedScreen[][] }>({ past: [], future: [] });
  const [historyRevision, setHistoryRevision] = useState(0);
  const lastHandledAddScreenSignal = useRef(addScreenSignal);
  const lastHandledClearScreensSignal = useRef(clearScreensSignal);

  const preset = presets.find((item) => item.id === presetId) ?? presets[0];

  function cloneScreens(screens: PlacedScreen[]): PlacedScreen[] {
    return screens.map((screen) => ({
      ...screen,
      screenConfig: { ...screen.screenConfig, emptyCabinetKeys: [...screen.screenConfig.emptyCabinetKeys] },
      visualSettings: { ...screen.visualSettings, config: clonePatternConfig(screen.visualSettings.config) },
      processor: cloneProcessor(screen.processor),
      powerPlan: clonePowerPlan(screen.powerPlan)
    }));
  }

  function rememberState(): void {
    historyRef.current.past.push(cloneScreens(placedScreens));
    if (historyRef.current.past.length > 50) historyRef.current.past.shift();
    historyRef.current.future = [];
    setHistoryRevision((value) => value + 1);
  }

  function restoreHistory(direction: 'undo' | 'redo'): void {
    const source = direction === 'undo' ? historyRef.current.past : historyRef.current.future;
    const target = direction === 'undo' ? historyRef.current.future : historyRef.current.past;
    const snapshot = source.pop();
    if (!snapshot) return;
    target.push(cloneScreens(placedScreens));
    setPlacedScreens(cloneScreens(snapshot));
    setSelectedPlacedScreenId(null);
    setSelectedScreenIds([]);
    setHistoryRevision((value) => value + 1);
  }

  const widthPx = preset.resolutionX * cols;
  const heightPx = preset.resolutionY * rows;
  const widthMm = preset.widthMm * cols;
  const heightMm = preset.heightMm * rows;
  const displayWidthPx = widthPx * WORKSPACE_PX_PER_PIXEL;
  const displayHeightPx = heightPx * WORKSPACE_PX_PER_PIXEL;
  const effectiveLabelFontSize = scaledLabelFontSize(labelFontSize, widthPx, heightPx);
  const resolutionFontSize = Math.max(10, Math.round(effectiveLabelFontSize * .72));
  const stageSize = useMemo(() => {
    const padding = 160;
    const maxRight = placedScreens.reduce((max, screen) => Math.max(max, screen.x + screen.width), 0);
    const maxBottom = placedScreens.reduce((max, screen) => Math.max(max, screen.y + screen.height), 0);
    return {
      width: Math.max(1200, maxRight + padding),
      height: Math.max(800, maxBottom + padding)
    };
  }, [placedScreens]);
  const nearestMeasurement = useMemo(() => {
    const selected = placedScreens.find((screen) => screen.id === selectedPlacedScreenId);
    if (!selected || placedScreens.length < 2) return null;
    let nearest: { distance: number; x: number; y: number } | null = null;
    for (const other of placedScreens) {
      if (other.id === selected.id) continue;
      const dx = Math.max(other.x - (selected.x + selected.width), selected.x - (other.x + other.width), 0);
      const dy = Math.max(other.y - (selected.y + selected.height), selected.y - (other.y + other.height), 0);
      const distance = Math.hypot(dx, dy);
      if (!nearest || distance < nearest.distance) {
        nearest = {
          distance,
          x: (Math.max(selected.x, Math.min(other.x, selected.x + selected.width)) + Math.max(other.x, Math.min(selected.x, other.x + other.width))) / 2,
          y: (Math.max(selected.y, Math.min(other.y, selected.y + selected.height)) + Math.max(other.y, Math.min(selected.y, other.y + other.height))) / 2
        };
      }
    }
    return nearest ? { ...nearest, pixels: nearest.distance / WORKSPACE_PX_PER_PIXEL } : null;
  }, [placedScreens, selectedPlacedScreenId]);

  useEffect(() => {
    if (workspaceMode !== 'pixel-mask') return;
    setIsEditingDataPath(false);
    setIsEditingPowerPath(false);
  }, [workspaceMode]);

  useEffect(() => {
    onScreenSummariesChange(placedScreens.map((screen) => {
      const screenPreset = presets.find((item) => item.id === screen.screenConfig.presetId) ?? presets[0];
      const screenWidthMm = screenPreset.widthMm * screen.screenConfig.cols;
      const screenHeightMm = screenPreset.heightMm * screen.screenConfig.rows;
      return {
        id: screen.id,
        name: screen.name,
        cabinetLabel: `${screenPreset.brand} ${screenPreset.model}`,
        sizeLabel: `${(screenWidthMm / 1000).toFixed(2)} × ${(screenHeightMm / 1000).toFixed(2)} м`,
        layoutLabel: `${screen.screenConfig.cols} × ${screen.screenConfig.rows}`,
        isSelected: selectedScreenIds.includes(screen.id)
      };
    }));
  }, [onScreenSummariesChange, placedScreens, presets, selectedScreenIds]);

  useEffect(() => {
    onProjectScreensChange(placedScreens.map((screen) => ({
      id: screen.id,
      name: screen.name,
      presetId: screen.screenConfig.presetId,
      cols: screen.screenConfig.cols,
      rows: screen.screenConfig.rows,
      emptyCabinetKeys: [...screen.screenConfig.emptyCabinetKeys],
      position: { x: screen.x, y: screen.y },
      rotation: screen.rotation,
      processor: cloneProcessor(screen.processor),
      powerPlan: clonePowerPlan(screen.powerPlan),
      visualSettings: {
        ...screen.visualSettings,
        config: clonePatternConfig(screen.visualSettings.config)
      }
    })));
  }, [placedScreens, onProjectScreensChange]);

  useEffect(() => {
    if (!projectScreens) return;
    const loaded = projectScreens.map((screen) => {
      const screenPreset = presets.find((item) => item.id === screen.presetId) ?? presets[0];
      const rotation = screen.rotation ?? 0;
      const size = screenDisplaySize(screenPreset, screen.cols, screen.rows, rotation);
      return {
        id: screen.id,
        name: screen.name,
        imageSource: renderProjectPreview(screen, screenPreset),
        screenConfig: {
          presetId: screen.presetId,
          cols: screen.cols,
          rows: screen.rows,
          emptyCabinetKeys: [...screen.emptyCabinetKeys]
        },
        visualSettings: {
          ...screen.visualSettings,
          config: clonePatternConfig(screen.visualSettings.config)
        },
        width: size.width,
        height: size.height,
        x: screen.position.x,
        y: screen.position.y,
        rotation,
        processor: cloneProcessor(screen.processor),
        powerPlan: clonePowerPlan(screen.powerPlan)
      } satisfies PlacedScreen;
    });
    setPlacedScreens(loaded);
    setSelectedPlacedScreenId(null);
    setSelectedScreenIds([]);
    historyRef.current = { past: [], future: [] };
    setHistoryRevision((value) => value + 1);
    resetVisualSettings();
  }, [projectLoadSignal]);

  function currentVisualSettings(): ScreenVisualSettings {
    return {
      showCabinetGrid,
      showCabinetNumbers,
      showTestGrid,
      config: clonePatternConfig(config),
      screenLabel,
      labelFontSize,
      textColor,
      showResolution,
      resolutionTextColor,
      logoSource,
      logoPosition,
      logoScalePercent,
      logoOpacityPercent
    };
  }

  function applyVisualSettings(settings: ScreenVisualSettings): void {
    setShowCabinetGrid(settings.showCabinetGrid);
    setShowCabinetNumbers(settings.showCabinetNumbers ?? false);
    setShowTestGrid(settings.showTestGrid ?? false);
    setConfig(clonePatternConfig(settings.config));
    setScreenLabel(settings.screenLabel);
    setLabelFontSize(settings.labelFontSize);
    setTextColor(settings.textColor);
    setShowResolution(settings.showResolution);
    setResolutionTextColor(settings.resolutionTextColor);
    setLogoSource(settings.logoSource);
    setLogoPosition(settings.logoPosition);
    setLogoScalePercent(settings.logoScalePercent);
    setLogoOpacityPercent(settings.logoOpacityPercent ?? 50);
  }

  function resetVisualSettings(): void {
    applyVisualSettings({
      ...DEFAULT_VISUAL_SETTINGS,
      config: clonePatternConfig(DEFAULT_VISUAL_SETTINGS.config)
    });
  }

  useEffect(() => {
    if (!logoSource) {
      logoRef.current = null;
      return;
    }

    const image = new Image();
    image.onload = () => {
      logoRef.current = image;
      setLogoLoadRevision((value) => value + 1);
    };
    image.src = logoSource;
  }, [logoSource]);

  function drawOverlays(
    ctx: CanvasRenderingContext2D,
    logo: HTMLImageElement | null,
    label = screenLabel
  ): void {
    const textLines = [
      ...(label.trim()
        ? [{ text: label.trim(), fontSize: effectiveLabelFontSize, color: textColor }]
        : []),
      ...(showResolution
        ? [{ text: `${widthPx} × ${heightPx} px`, fontSize: resolutionFontSize, color: resolutionTextColor }]
        : [])
    ];

    if (textLines.length > 0) {
      const lineGap = 12;
      const blockHeight = textLines.reduce((total, line) => total + line.fontSize, 0)
        + lineGap * (textLines.length - 1);
      let y = (heightPx - blockHeight) / 2;

      for (const line of textLines) {
        ctx.save();
        ctx.font = `600 ${line.fontSize}px sans-serif`;
        ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = Math.max(3, line.fontSize * 0.1);
        ctx.shadowOffsetX = Math.max(1, line.fontSize * 0.035);
        ctx.shadowOffsetY = Math.max(1, line.fontSize * 0.045);
        const metrics = ctx.measureText(line.text);
        const x = (widthPx - metrics.width) / 2;
        ctx.globalAlpha = 1;
        ctx.fillStyle = fullBrightnessColor(line.color);
        ctx.fillText(line.text, x, y);
        ctx.restore();
        y += line.fontSize + lineGap;
      }
    }

    if (logo) {
      const logoWidth = widthPx * (logoScalePercent / 100);
      const logoHeight = logoWidth * (logo.naturalHeight / logo.naturalWidth);
      const { x, y } = overlayCoordinates(logoPosition, logoWidth, logoHeight, widthPx, heightPx);
      ctx.save();
      ctx.globalAlpha = logoOpacityPercent / 100;
      ctx.drawImage(logo, x, y, logoWidth, logoHeight);
      ctx.restore();
    }
  }

  function drawCabinetNumbers(ctx: CanvasRenderingContext2D): void {
    if (!showCabinetNumbers) return;

    const fontSize = Math.max(12, Math.min(40, Math.min(preset.resolutionX, preset.resolutionY) * 0.14));
    const padding = Math.max(6, fontSize * 0.35);

    ctx.save();
    ctx.font = `700 ${fontSize}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (screenConfig.emptyCabinetKeys.includes(`${col}-${row}`)) continue;
        ctx.fillText(
          `${row + 1}.${col + 1}`,
          col * preset.resolutionX + padding,
          row * preset.resolutionY + padding
        );
      }
    }
    ctx.restore();
  }

  function drawTestGrid(ctx: CanvasRenderingContext2D): void {
    if (!showTestGrid) return;

    const lineWidth = Math.max(1, Math.min(widthPx, heightPx) / 900) + 1;

    ctx.save();
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = '#00ffff';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(widthPx, heightPx);
    ctx.moveTo(0, heightPx);
    ctx.lineTo(widthPx, 0);
    ctx.stroke();

    const centerRadius = Math.max(0, (Math.min(widthPx, heightPx) - lineWidth) / 2);
    const cabinetResolution = Math.max(1, Math.min(preset.resolutionX, preset.resolutionY));
    // Верхний и нижний (или левый и правый) круги стоят на одной стороне
    // экрана на расстоянии друг от друга в sideDiameter от каждого края —
    // чтобы они не пересекались, диаметр не должен быть больше половины
    // меньшей стороны экрана. На экране высотой в 3 кабинета диаметр в 2
    // кабинета (прежний максимум) уже даёт пересечение — уменьшаем до
    // одного кабинета, если места не хватает.
    const maxSideDiameterUnits = Math.min(widthPx, heightPx) / (2 * cabinetResolution);
    const sideDiameterUnits = Math.max(1, Math.min(2, Math.floor(maxSideDiameterUnits)));
    const sideDiameter = sideDiameterUnits * cabinetResolution;
    const sideRadius = Math.max(0, sideDiameter / 2 - lineWidth / 2);
    const sideXLeft = sideDiameter / 2;
    const sideXRight = widthPx - sideDiameter / 2;
    const topY = sideDiameter / 2;
    const bottomY = heightPx - sideDiameter / 2;
    const circles = [
      [sideXLeft, topY, sideRadius, '#ff0000'],
      [sideXLeft, bottomY, sideRadius, '#0000ff'],
      [sideXRight, topY, sideRadius, '#00ff00'],
      [sideXRight, bottomY, sideRadius, '#ffff00'],
      [widthPx / 2, heightPx / 2, centerRadius, '#ffffff']
    ] as const;
    for (const [x, y, radius, color] of circles) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    const sizeFont = Math.max(12, Math.min(28, heightPx * 0.055));
    ctx.font = `500 ${sizeFont}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ffff00';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 3;
    ctx.fillText(`${widthPx}x${heightPx}`, 4, heightPx - 2);
    ctx.restore();
  }

  function drawScreen(
    ctx: CanvasRenderingContext2D,
    includeGrid: boolean,
    label = screenLabel,
    patternConfig = config
  ): void {
    ctx.clearRect(0, 0, widthPx, heightPx);
    drawPattern(ctx, widthPx, heightPx, patternConfig, {
      checkerCellWidthPx: preset.resolutionX,
      checkerCellHeightPx: preset.resolutionY
    });
    drawTestGrid(ctx);

    if (includeGrid && showCabinetGrid) {
      drawCabinetGrid(ctx, preset.resolutionX, preset.resolutionY, cols, rows);
    }
    drawCabinetNumbers(ctx);
    drawOverlays(ctx, logoRef.current, label);

    for (const key of screenConfig.emptyCabinetKeys) {
      const [col, row] = key.split('-').map(Number);
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
      ctx.clearRect(
        col * preset.resolutionX,
        row * preset.resolutionY,
        preset.resolutionX,
        preset.resolutionY
      );
      if (includeGrid) {
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(
          col * preset.resolutionX + 1,
          row * preset.resolutionY + 1,
          preset.resolutionX - 2,
          preset.resolutionY - 2
        );
        ctx.setLineDash([]);
      }
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = widthPx;
    canvas.height = heightPx;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    drawScreen(ctx, true);

    if (selectedPlacedScreenId) {
      const imageSource = canvas.toDataURL('image/png');
      setPlacedScreens((current) => current.map((screen) =>
        screen.id === selectedPlacedScreenId
          ? {
              ...screen,
              imageSource,
              screenConfig: {
                ...screenConfig,
                emptyCabinetKeys: [...screenConfig.emptyCabinetKeys]
              },
              visualSettings: currentVisualSettings(),
              ...screenDisplaySize(preset, screenConfig.cols, screenConfig.rows, screen.rotation)
            }
          : screen
      ));
    }
  }, [
    widthPx,
    heightPx,
    config,
    showCabinetGrid,
    showCabinetNumbers,
    showTestGrid,
    preset.resolutionX,
    preset.resolutionY,
    cols,
    rows,
    screenConfig.emptyCabinetKeys,
    screenLabel,
    labelFontSize,
    resolutionFontSize,
    textColor,
    showResolution,
    resolutionTextColor,
    logoSource,
    logoPosition,
    logoScalePercent,
    logoOpacityPercent,
    logoLoadRevision,
    displayWidthPx,
    displayHeightPx,
    selectedPlacedScreenId
  ]);

  function addScreenToCanvas(): void {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const id = crypto.randomUUID();
    const nextIndex = placedScreens.reduce((max, screen) => {
      const index = Number(screen.name.match(/(\d+)\s*$/)?.[1] ?? 0);
      return Number.isSafeInteger(index) ? Math.max(max, index) : max;
    }, placedScreens.length) + 1;
    const name = `Screen_${nextIndex}`;
    const label = name;
    const previousScreen = placedScreens.reduce<PlacedScreen | undefined>((rightmost, screen) =>
      !rightmost || screen.x + screen.width > rightmost.x + rightmost.width ? screen : rightmost, undefined);
    let phasedConfig = clonePatternConfig(config);
    if (previousScreen) {
      const previousConfig = previousScreen.visualSettings.config;
      if (previousConfig.palette && previousConfig.palette.length > 1 && config.palette?.length === previousConfig.palette.length) {
        const offset = previousScreen.screenConfig.cols % previousConfig.palette.length;
        phasedConfig.palette = [
          ...previousConfig.palette.slice(offset),
          ...previousConfig.palette.slice(0, offset)
        ];
      } else {
        const previousLastColor = previousScreen.screenConfig.cols % 2 === 1
          ? previousConfig.colorA
          : previousConfig.colorB;
        const desiredFirstColor = previousLastColor.toLowerCase() === config.colorA.toLowerCase()
          ? config.colorB
          : config.colorA;
        if (desiredFirstColor.toLowerCase() !== config.colorA.toLowerCase()) {
          phasedConfig = { ...phasedConfig, colorA: config.colorB, colorB: config.colorA };
        }
      }
    }
    const context = canvas.getContext('2d');
    if (context) drawScreen(context, true, label, phasedConfig);
    const imageSource = canvas.toDataURL('image/png');
    rememberState();
    setPlacedScreens((current) => {
      const nextX = current.length === 0 ? 32 : Math.max(...current.map((item) => item.x + item.width)) + 40;
      return [
        ...current,
        {
          id,
          name,
          imageSource,
          screenConfig: {
            ...screenConfig,
            emptyCabinetKeys: [...screenConfig.emptyCabinetKeys]
          },
          visualSettings: { ...currentVisualSettings(), config: phasedConfig, screenLabel: label },
          width: displayWidthPx,
          height: displayHeightPx,
          x: nextX,
          y: 32,
          rotation: 0,
          processor: undefined
        }
      ];
    });
    setConfig(phasedConfig);
    setScreenLabel(label);
    setSelectedPlacedScreenId(id);
    setSelectedScreenIds([id]);
  }

  useEffect(() => {
    if (addScreenSignal === lastHandledAddScreenSignal.current) return;
    lastHandledAddScreenSignal.current = addScreenSignal;
    addScreenToCanvas();
  }, [addScreenSignal]);

  useEffect(() => {
    if (clearScreensSignal === lastHandledClearScreensSignal.current) return;
    lastHandledClearScreensSignal.current = clearScreensSignal;
    placedDragRef.current = null;
    rememberState();
    setPlacedScreens([]);
    setSelectedPlacedScreenId(null);
    setSelectedScreenIds([]);
    resetVisualSettings();
  }, [clearScreensSignal]);

  useEffect(() => {
    function handleEditorShortcut(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      const isEditingText = target?.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
      if (!isEditingText && (isEditingDataPath || isEditingPowerPath) && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        if (addPathCabinetByArrow(event.key)) event.preventDefault();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !isEditingText && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        restoreHistory(event.shiftKey ? 'redo' : 'undo');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !isEditingText && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        restoreHistory('redo');
        return;
      }
      const isWindowsDelete = event.key === 'Delete';
      const isMacDelete = event.metaKey && event.key === 'Backspace';
      if (!isWindowsDelete && !isMacDelete) return;
      if (selectedScreenIds.length === 0) return;
      if (isEditingText) return;

      event.preventDefault();
      rememberState();
      setPlacedScreens((current) => current.filter((screen) => !selectedScreenIds.includes(screen.id)));
      setSelectedPlacedScreenId(null);
      setSelectedScreenIds([]);
    }

    window.addEventListener('keydown', handleEditorShortcut);
    return () => window.removeEventListener('keydown', handleEditorShortcut);
  }, [selectedScreenIds, placedScreens, isEditingDataPath, isEditingPowerPath, activeDataPortId, activePowerCircuitId, pathPanelMode, selectedPlacedScreenId]);

  function selectPlacedScreen(screen: PlacedScreen): void {
    setSelectedPlacedScreenId(screen.id);
    setSelectedScreenIds([screen.id]);
    setActiveDataPortId(screen.processor?.ports[0]?.portId ?? null);
    applyVisualSettings(screen.visualSettings);
    onScreenConfigChange({
      ...screen.screenConfig,
      emptyCabinetKeys: [...screen.screenConfig.emptyCabinetKeys]
    });
  }

  function toggleDataPathEditor(): void {
    if (!selectedDataScreen?.processor) return;
    setIsEditingDataPath((current) => {
      const next = !current;
      if (next && !selectedDataScreen.processor?.ports.some((port) => port.portId === activeDataPortId)) {
        setActiveDataPortId(selectedDataScreen.processor?.ports[0]?.portId ?? null);
      }
      return next;
    });
  }

  function addNovaStarController(): void {
    if (!selectedPlacedScreenId) return;
    const processor = createNovaStarProcessor();
    if (!processor) return;
    rememberState();
    setPlacedScreens((current) => current.map((screen) => screen.id === selectedPlacedScreenId
      ? { ...screen, processor }
      : screen));
    setActiveDataPortId(processor.ports[0]?.portId ?? null);
    setIsEditingDataPath(true);
    setControllerFormMode(null);
  }

  function startChangingController(processor: Processor): void {
    // Предзаполняем выбор текущей моделью/числом sending-карт контроллера —
    // иначе форма открывалась бы на дефолтном контроллере из списка, что
    // легко спутать с "уже выбран текущий".
    const template = NOVASTAR_CONTROLLERS.find((controller) => controller.model === processor.model);
    setNewControllerModel(template?.model ?? NOVASTAR_CONTROLLERS[0].model);
    if (template?.maxSendingCards) {
      const cardCount = new Set(processor.ports.map((port) => port.controllerId)).size;
      setNewControllerSendingCards(Math.min(Math.max(1, cardCount), template.maxSendingCards));
    }
    setControllerFormMode('change');
  }

  function startAddingController(): void {
    setNewControllerModel(NOVASTAR_CONTROLLERS[0].model);
    setNewControllerSendingCards(1);
    setControllerFormMode('add');
  }

  // Нумерует "sending card" дополнительного контроллера начиная со следующего
  // числа после уже занятых controllerId — иначе при добавлении второго
  // контроллера той же модели оба получили бы одинаковые controllerId/portId
  // ("Sending card 1 · Port 1"), и UI (группировка по card, React key) не
  // смог бы отличить порты разных физических контроллеров друг от друга.
  function nextCardNumberOffset(processor?: Processor): number {
    const numbers = (processor?.ports ?? [])
      .map((port) => Number(port.controllerId?.match(/\d+/)?.[0]))
      .filter((value) => Number.isFinite(value));
    return numbers.length ? Math.max(...numbers) : 0;
  }

  function buildNovaStarPorts(model: string, requestedCardCount: number, cardNumberOffset: number): ProcessorPort[] {
    const template = NOVASTAR_CONTROLLERS.find((controller) => controller.model === model);
    if (!template) return [];
    const cardCount = template.maxSendingCards
      ? Math.min(Math.max(1, requestedCardCount), template.maxSendingCards)
      : 1;
    const totalPorts = template.ports * cardCount;
    // Нумеруем sending-карту и порт на ней по отдельности (а не один общий
    // счётчик 1..totalPorts) — иначе при нескольких sending-картах (H9/H15)
    // controllerId всегда был бы "1", и в подписи S{card}P{port} на схеме
    // карты было бы невозможно различить.
    return Array.from({ length: totalPorts }, (_, index) => {
      const cardNumber = cardNumberOffset + Math.floor(index / template.ports) + 1;
      const portInCard = (index % template.ports) + 1;
      return {
        portId: `Sending card ${cardNumber} · Port ${portInCard}`,
        controllerId: String(cardNumber),
        controllerName: template.model,
        sourcePortName: String(portInCard),
        maxPixels: template.maxPixelsPerPort,
        assignedCabinets: []
      };
    });
  }

  function createNovaStarProcessor(): Processor | null {
    const ports = buildNovaStarPorts(newControllerModel, newControllerSendingCards, 0);
    if (!ports.length) return null;
    return { id: crypto.randomUUID(), brand: 'NovaStar', model: newControllerModel, ports };
  }

  function addAdditionalController(): void {
    const processor = selectedDataScreen?.processor;
    if (!selectedPlacedScreenId || !processor) return;
    const newPorts = buildNovaStarPorts(newControllerModel, newControllerSendingCards, nextCardNumberOffset(processor));
    if (!newPorts.length) return;
    rememberState();
    setPlacedScreens((current) => current.map((screen) => screen.id === selectedPlacedScreenId && screen.processor
      ? { ...screen, processor: { ...screen.processor, ports: [...screen.processor.ports, ...newPorts] } }
      : screen));
    setActiveDataPortId(newPorts[0].portId);
    setIsEditingDataPath(true);
    setControllerFormMode(null);
  }

  /** Отображаемое название контроллера(ов) экрана — с учётом того, что после
   * «Добавить контроллер» на экране может быть несколько разных моделей/юнитов. */
  function controllerSummaryLabel(processor: Processor): string {
    const unitsByModel = new Map<string, Set<string>>();
    for (const port of processor.ports) {
      const model = port.controllerName ?? processor.model;
      const units = unitsByModel.get(model) ?? new Set<string>();
      units.add(port.controllerId ?? '');
      unitsByModel.set(model, units);
    }
    return [...unitsByModel.entries()]
      .map(([model, units]) => units.size > 1 ? `${model} ×${units.size}` : model)
      .join(' + ');
  }

  function editDataPathCabinet(screenId: string, cabinetKey: string, truncateExisting = true): void {
    if (!isEditingDataPath || !activeDataPortId) return;
    const screen = placedScreens.find((item) => item.id === screenId);
    const activePort = screen?.processor?.ports.find((port) => port.portId === activeDataPortId);
    const activeIndex = activePort?.assignedCabinets.indexOf(cabinetKey) ?? -1;
    if (activeIndex >= 0 && !truncateExisting) return;
    rememberState();
    setPlacedScreens((current) => current.map((screen) => {
      if (screen.id !== screenId || !screen.processor) return screen;
      return {
        ...screen,
        processor: {
          ...screen.processor,
          ports: screen.processor.ports.map((port) => ({
            ...port,
            assignedCabinets: port.portId !== activeDataPortId
              ? port.assignedCabinets.filter((key) => key !== cabinetKey)
              : activeIndex >= 0
                ? port.assignedCabinets.slice(0, activeIndex + 1)
                : port.assignedCabinets.filter((key) => key !== cabinetKey).concat(cabinetKey)
          }))
        }
      };
    }));
  }

  function clearDataPath(portOnly: boolean): void {
    if (!selectedPlacedScreenId) return;
    rememberState();
    setPlacedScreens((current) => current.map((screen) => screen.id === selectedPlacedScreenId && screen.processor
      ? {
          ...screen,
          processor: {
            ...screen.processor,
            ports: screen.processor.ports.map((port) => portOnly && port.portId !== activeDataPortId
              ? port
              : { ...port, assignedCabinets: [] })
          }
        }
      : screen));
  }

  function updatePowerPlan(plan: PowerPlan): void {
    if (!selectedPlacedScreenId) return;
    rememberState();
    setPlacedScreens((current) => current.map((screen) => screen.id === selectedPlacedScreenId
      ? { ...screen, powerPlan: clonePowerPlan(plan) }
      : screen));
  }

  function editPowerPathCabinet(screenId: string, cabinetKey: string, truncateExisting = true): void {
    if (!isEditingPowerPath || !activePowerCircuitId) return;
    const screen = placedScreens.find((item) => item.id === screenId);
    const plan = screen?.powerPlan;
    if (!plan) return;
    const activeCircuit = plan.circuits.find((circuit) => circuit.id === activePowerCircuitId);
    const activeIndex = activeCircuit?.assignedCabinets.indexOf(cabinetKey) ?? -1;
    if (activeIndex >= 0 && !truncateExisting) return;
    rememberState();
    setPlacedScreens((current) => current.map((item) => {
      if (item.id !== screenId || !item.powerPlan) return item;
      return {
        ...item,
        powerPlan: {
          ...item.powerPlan,
          circuits: item.powerPlan.circuits.map((circuit) => ({
            ...circuit,
            assignedCabinets: circuit.id !== activePowerCircuitId
              ? circuit.assignedCabinets.filter((key) => key !== cabinetKey)
              : activeIndex >= 0
                ? circuit.assignedCabinets.slice(0, activeIndex + 1)
                : circuit.assignedCabinets.filter((key) => key !== cabinetKey).concat(cabinetKey)
          }))
        }
      };
    }));
  }

  function startWorkspacePan(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as HTMLElement;
    if (target.closest('.placed-screen-frame') && event.button !== 1 && !event.altKey) return;

    placedDragRef.current = null;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.button === 0 && !event.altKey) {
      const stage = canvasStageRef.current;
      if (!stage) return;
      const bounds = stage.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / workspaceZoom;
      const y = (event.clientY - bounds.top) / workspaceZoom;
      selectionStartRef.current = { x, y, additive: event.ctrlKey || event.metaKey };
      setSelectionRect({ x, y, width: 0, height: 0 });
      if (!event.ctrlKey && !event.metaKey) {
        setSelectedPlacedScreenId(null);
        setSelectedScreenIds([]);
      }
      return;
    }
    workspacePanRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: workspaceOffset.x,
      scrollTop: workspaceOffset.y
    };
    event.stopPropagation();
    setIsPanningWorkspace(true);
  }

  function moveWorkspace(event: React.PointerEvent<HTMLDivElement>): void {
    const selectionStart = selectionStartRef.current;
    if (selectionStart) {
      const stage = canvasStageRef.current;
      if (!stage) return;
      const bounds = stage.getBoundingClientRect();
      const currentX = (event.clientX - bounds.left) / workspaceZoom;
      const currentY = (event.clientY - bounds.top) / workspaceZoom;
      setSelectionRect({
        x: Math.min(selectionStart.x, currentX),
        y: Math.min(selectionStart.y, currentY),
        width: Math.abs(currentX - selectionStart.x),
        height: Math.abs(currentY - selectionStart.y)
      });
      return;
    }
    const panStart = workspacePanRef.current;
    if (!panStart) return;
    setWorkspaceOffset({
      x: panStart.scrollLeft + event.clientX - panStart.x,
      y: panStart.scrollTop + event.clientY - panStart.y
    });
  }

  function stopWorkspacePan(event: React.PointerEvent<HTMLDivElement>): void {
    const selectionStart = selectionStartRef.current;
    if (selectionStart && selectionRect) {
      const hits = placedScreens.filter((screen) =>
        screen.x < selectionRect.x + selectionRect.width && screen.x + screen.width > selectionRect.x &&
        screen.y < selectionRect.y + selectionRect.height && screen.y + screen.height > selectionRect.y
      ).map((screen) => screen.id);
      setSelectedScreenIds((current) => selectionStart.additive ? Array.from(new Set([...current, ...hits])) : hits);
      setSelectedPlacedScreenId(hits[hits.length - 1] ?? null);
      const primary = placedScreens.find((screen) => screen.id === hits[hits.length - 1]);
      if (primary) {
        applyVisualSettings(primary.visualSettings);
        onScreenConfigChange({ ...primary.screenConfig, emptyCabinetKeys: [...primary.screenConfig.emptyCabinetKeys] });
      }
    }
    selectionStartRef.current = null;
    setSelectionRect(null);
    workspacePanRef.current = null;
    setIsPanningWorkspace(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function zoomWorkspaceAtPointer(event: React.WheelEvent<HTMLDivElement>): void {
    event.preventDefault();
    const pane = canvasPaneRef.current;
    if (!pane) return;

    const bounds = canvasStageRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    const contentX = pointerX / workspaceZoom;
    const contentY = pointerY / workspaceZoom;
    const nextZoom = clampZoom(workspaceZoom * Math.exp(-event.deltaY * 0.0015));
    if (nextZoom === workspaceZoom) return;

    setWorkspaceZoom(nextZoom);
    setWorkspaceOffset({
      x: workspaceOffset.x + contentX * (workspaceZoom - nextZoom),
      y: workspaceOffset.y + contentY * (workspaceZoom - nextZoom)
    });
  }

  function fitScreensInWorkspace(screens = placedScreens): void {
    setWorkspaceOffset({ x: 0, y: 0 });
    const pane = canvasPaneRef.current;
    if (!pane || screens.length === 0) {
      setWorkspaceZoom(1);
      return;
    }

    const contentWidth = Math.max(...screens.map((screen) => screen.x + screen.width)) + 160;
    const contentHeight = Math.max(...screens.map((screen) => screen.y + screen.height)) + 160;
    const availableWidth = Math.max(1, pane.clientWidth - 64);
    const availableHeight = Math.max(1, pane.clientHeight - 64);
    const nextZoom = clampZoom(Math.min(availableWidth / contentWidth, availableHeight / contentHeight));
    setWorkspaceZoom(nextZoom);
    window.requestAnimationFrame(() => {
      pane.scrollLeft = 0;
      pane.scrollTop = 0;
    });
  }

  function toggleCabinetInScreen(event: React.MouseEvent<HTMLDivElement>, screen: PlacedScreen): void {
    if (!isEditingScreen) return;
    event.preventDefault();
    event.stopPropagation();

    const screenPreset = presets.find((item) => item.id === screen.screenConfig.presetId) ?? presets[0];
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * screenPreset.resolutionX * screen.screenConfig.cols;
    const y = ((event.clientY - bounds.top) / bounds.height) * screenPreset.resolutionY * screen.screenConfig.rows;
    const col = Math.floor(x / screenPreset.resolutionX);
    const row = Math.floor(y / screenPreset.resolutionY);

    if (col < 0 || col >= screen.screenConfig.cols || row < 0 || row >= screen.screenConfig.rows) return;

    const key = `${col}-${row}`;
    const emptyCabinetKeys = screen.screenConfig.emptyCabinetKeys.includes(key)
      ? screen.screenConfig.emptyCabinetKeys.filter((item) => item !== key)
      : [...screen.screenConfig.emptyCabinetKeys, key];
    const nextConfig = {
      ...screen.screenConfig,
      emptyCabinetKeys
    };

    setSelectedPlacedScreenId(screen.id);
    setSelectedScreenIds([screen.id]);
    applyVisualSettings(screen.visualSettings);
    onScreenConfigChange(nextConfig);
    setPlacedScreens((current) => current.map((item) =>
      item.id === screen.id
        ? {
            ...item,
            screenConfig: {
              ...nextConfig,
              emptyCabinetKeys: [...nextConfig.emptyCabinetKeys]
            },
            processor: item.processor ? {
              ...item.processor,
              ports: item.processor.ports.map((port) => ({
                ...port,
                assignedCabinets: emptyCabinetKeys.includes(key)
                  ? port.assignedCabinets.filter((cabinetKey) => cabinetKey !== key)
                  : port.assignedCabinets
              }))
            } : undefined,
            powerPlan: item.powerPlan ? {
              ...item.powerPlan,
              circuits: item.powerPlan.circuits.map((circuit) => ({
                ...circuit,
                assignedCabinets: emptyCabinetKeys.includes(key)
                  ? circuit.assignedCabinets.filter((cabinetKey) => cabinetKey !== key)
                  : circuit.assignedCabinets
              }))
            } : undefined
          }
        : item
    ));
  }

  function startPlacedScreenDrag(event: React.PointerEvent<HTMLDivElement>, screen: PlacedScreen): void {
    if (isEditingDataPath) {
      selectPlacedScreen(screen);
      return;
    }
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const next = selectedScreenIds.includes(screen.id)
        ? selectedScreenIds.filter((id) => id !== screen.id)
        : [...selectedScreenIds, screen.id];
      setSelectedScreenIds(next);
      setSelectedPlacedScreenId(next.includes(screen.id) ? screen.id : next[next.length - 1] ?? null);
      if (!next.includes(screen.id)) return;
    } else if (!selectedScreenIds.includes(screen.id)) {
      selectPlacedScreen(screen);
    } else {
      setSelectedPlacedScreenId(screen.id);
      applyVisualSettings(screen.visualSettings);
      onScreenConfigChange({ ...screen.screenConfig, emptyCabinetKeys: [...screen.screenConfig.emptyCabinetKeys] });
    }
    rememberState();
    event.currentTarget.setPointerCapture(event.pointerId);
    const movingIds = selectedScreenIds.includes(screen.id) ? selectedScreenIds : [screen.id];
    placedDragRef.current = {
      id: screen.id,
      x: event.clientX,
      y: event.clientY,
      origins: Object.fromEntries(placedScreens.filter((item) => movingIds.includes(item.id)).map((item) => [item.id, { x: item.x, y: item.y }]))
    };
  }

  function movePlacedScreen(event: React.PointerEvent<HTMLDivElement>): void {
    const dragStart = placedDragRef.current;
    if (!dragStart) return;
    const primaryOrigin = dragStart.origins[dragStart.id];
    if (!primaryOrigin) return;
    const deltaX = (event.clientX - dragStart.x) / workspaceZoom;
    const deltaY = (event.clientY - dragStart.y) / workspaceZoom;
    const nextX = primaryOrigin.x + deltaX;
    const nextY = primaryOrigin.y + deltaY;

    setPlacedScreens((current) => {
      const movingScreen = current.find((screen) => screen.id === dragStart.id);
      if (!movingScreen) return current;
      const movingIds = Object.keys(dragStart.origins);
      const others = current.filter((screen) => !movingIds.includes(screen.id));
      let snappedX = nextX;
      let snappedY = nextY;
      let bestSnapXDistance = SNAP_DISTANCE_PX + 1;
      let bestSnapYDistance = SNAP_DISTANCE_PX + 1;

      for (const other of others) {
        const horizontalCandidates = [
          other.x - movingScreen.width,
          other.x,
          other.x + other.width - movingScreen.width,
          other.x + other.width
        ];
        const verticalCandidates = [
          other.y - movingScreen.height,
          other.y,
          other.y + other.height - movingScreen.height,
          other.y + other.height
        ];

        for (const candidate of horizontalCandidates) {
          const distance = Math.abs(nextX - candidate);
          if (distance <= SNAP_DISTANCE_PX && distance < bestSnapXDistance) {
            snappedX = candidate;
            bestSnapXDistance = distance;
          }
        }

        for (const candidate of verticalCandidates) {
          const distance = Math.abs(nextY - candidate);
          if (distance <= SNAP_DISTANCE_PX && distance < bestSnapYDistance) {
            snappedY = candidate;
            bestSnapYDistance = distance;
          }
        }
      }
      setSnapGuides({
        x: bestSnapXDistance <= SNAP_DISTANCE_PX ? snappedX : undefined,
        y: bestSnapYDistance <= SNAP_DISTANCE_PX ? snappedY : undefined
      });
      const snappedDeltaX = snappedX - primaryOrigin.x;
      const snappedDeltaY = snappedY - primaryOrigin.y;
      const candidate = current.map((screen) => {
        const origin = dragStart.origins[screen.id];
        return origin ? { ...screen, x: origin.x + snappedDeltaX, y: origin.y + snappedDeltaY } : screen;
      });
      const moving = candidate.filter((screen) => movingIds.includes(screen.id));
      const hasCollision = moving.some((screen) => others.some((other) =>
        screen.x < other.x + other.width && screen.x + screen.width > other.x &&
        screen.y < other.y + other.height && screen.y + screen.height > other.y
      ));
      return hasCollision ? current : candidate;
    });
  }

  function stopPlacedScreenDrag(event: React.PointerEvent<HTMLDivElement>): void {
    placedDragRef.current = null;
    setSnapGuides({});
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function alignSelected(mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'): void {
    const selected = placedScreens.filter((screen) => selectedScreenIds.includes(screen.id));
    if (selected.length < 2) return;
    rememberState();
    const left = Math.min(...selected.map((screen) => screen.x));
    const right = Math.max(...selected.map((screen) => screen.x + screen.width));
    const top = Math.min(...selected.map((screen) => screen.y));
    const bottom = Math.max(...selected.map((screen) => screen.y + screen.height));
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    setPlacedScreens((current) => {
      const candidate = current.map((screen) => {
      if (!selectedScreenIds.includes(screen.id)) return screen;
      if (mode === 'left') return { ...screen, x: left };
      if (mode === 'hcenter') return { ...screen, x: centerX - screen.width / 2 };
      if (mode === 'right') return { ...screen, x: right - screen.width };
      if (mode === 'top') return { ...screen, y: top };
      if (mode === 'vcenter') return { ...screen, y: centerY - screen.height / 2 };
      return { ...screen, y: bottom - screen.height };
      });
      return screensOverlap(candidate) ? current : candidate;
    });
  }

  function distributeSelected(axis: 'horizontal' | 'vertical'): void {
    const selected = placedScreens.filter((screen) => selectedScreenIds.includes(screen.id));
    if (selected.length < 3) return;
    rememberState();
    const sorted = [...selected].sort((a, b) => axis === 'horizontal' ? a.x - b.x : a.y - b.y);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const span = axis === 'horizontal' ? last.x - first.x : last.y - first.y;
    const positions = new Map(sorted.map((screen, index) => [screen.id, (axis === 'horizontal' ? first.x : first.y) + span * index / (sorted.length - 1)]));
    setPlacedScreens((current) => {
      const candidate = current.map((screen) => {
      const position = positions.get(screen.id);
      if (position === undefined) return screen;
      return axis === 'horizontal' ? { ...screen, x: position } : { ...screen, y: position };
      });
      return screensOverlap(candidate) ? current : candidate;
    });
  }

  function rotateSelected(): void {
    if (selectedScreenIds.length === 0) return;
    rememberState();
    setPlacedScreens((current) => {
      const candidate = current.map((screen) => {
      if (!selectedScreenIds.includes(screen.id)) return screen;
      const rotation = ((screen.rotation + 90) % 360) as 0 | 90 | 180 | 270;
      const centerX = screen.x + screen.width / 2;
      const centerY = screen.y + screen.height / 2;
      return {
        ...screen,
        rotation,
        width: screen.height,
        height: screen.width,
        x: centerX - screen.height / 2,
        y: centerY - screen.width / 2
      };
      });
      return screensOverlap(candidate) ? current : candidate;
    });
  }

  function renderImportedPreview(
    importedConfig: ScreenConfig,
    importedPreset: CabinetPreset,
    name: string
  ): string {
    if (importedPreset.brand === 'NovaLCT') {
      return renderImportedSvgPreview(importedConfig, importedPreset, name);
    }

    const nativeWidth = importedPreset.resolutionX * importedConfig.cols;
    const nativeHeight = importedPreset.resolutionY * importedConfig.rows;
    const scale = Math.min(1, 2048 / nativeWidth, 2048 / nativeHeight);
    const preview = document.createElement('canvas');
    preview.width = Math.max(1, Math.round(nativeWidth * scale));
    preview.height = Math.max(1, Math.round(nativeHeight * scale));
    const context = preview.getContext('2d');
    if (!context) return '';

    const previewConfig = visiblePatternConfig(config);
    drawPattern(context, preview.width, preview.height, previewConfig, {
      checkerCellWidthPx: importedPreset.resolutionX * scale,
      checkerCellHeightPx: importedPreset.resolutionY * scale
    });
    if (showCabinetGrid) {
      drawCabinetGrid(
        context,
        importedPreset.resolutionX * scale,
        importedPreset.resolutionY * scale,
        importedConfig.cols,
        importedConfig.rows
      );
    }

    const fontSize = Math.max(16, labelFontSize * scale);
    context.save();
    context.font = `600 ${fontSize}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.globalAlpha = 1;
    context.fillStyle = fullBrightnessColor(textColor);
    context.shadowColor = 'rgba(0, 0, 0, 0.95)';
    context.shadowBlur = Math.max(3, fontSize * 0.1);
    context.shadowOffsetX = Math.max(1, fontSize * 0.035);
    context.shadowOffsetY = Math.max(1, fontSize * 0.045);
    context.fillText(name, preview.width / 2, preview.height / 2);
    context.restore();

    for (const key of importedConfig.emptyCabinetKeys) {
      const [col, row] = key.split('-').map(Number);
      context.clearRect(
        col * importedPreset.resolutionX * scale,
        row * importedPreset.resolutionY * scale,
        importedPreset.resolutionX * scale,
        importedPreset.resolutionY * scale
      );
    }
    return preview.toDataURL('image/png');
  }

  function addPathCabinetByArrow(key: string): boolean {
    const screen = placedScreens.find((item) => item.id === selectedPlacedScreenId);
    if (!screen) return false;
    const activeKeys = pathPanelMode === 'data'
      ? screen.processor?.ports.find((port) => port.portId === activeDataPortId)?.assignedCabinets ?? []
      : screen.powerPlan?.circuits.find((circuit) => circuit.id === activePowerCircuitId)?.assignedCabinets ?? [];
    const origin = activeKeys.at(-1);
    if (!origin) return false;
    const [col, row] = origin.split('-').map(Number);
    const delta = key === 'ArrowLeft' ? [-1, 0] : key === 'ArrowRight' ? [1, 0] : key === 'ArrowUp' ? [0, -1] : [0, 1];
    let nextCol = col + delta[0];
    let nextRow = row + delta[1];
    const empty = new Set(screen.screenConfig.emptyCabinetKeys);
    while (nextCol >= 0 && nextCol < screen.screenConfig.cols && nextRow >= 0 && nextRow < screen.screenConfig.rows) {
      const nextKey = `${nextCol}-${nextRow}`;
      if (!empty.has(nextKey)) {
        if (pathPanelMode === 'data' && isEditingDataPath) editDataPathCabinet(screen.id, nextKey);
        else if (pathPanelMode === 'power' && isEditingPowerPath) editPowerPathCabinet(screen.id, nextKey);
        else return false;
        return true;
      }
      nextCol += delta[0];
      nextRow += delta[1];
    }
    return false;
  }

  function drawPathPointerDown(event: React.PointerEvent<SVGRectElement>, screenId: string, cabinetKey: string): void {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    event.stopPropagation();
    pathDrawRef.current = { screenId, cabinetKey, button: event.button, moved: false };
    if (event.button === 2) {
      pathDrawRef.current.moved = true;
      if (pathPanelMode === 'data') editDataPathCabinet(screenId, cabinetKey, false);
      else editPowerPathCabinet(screenId, cabinetKey, false);
    }
  }

  function drawPathPointerEnter(event: React.PointerEvent<SVGRectElement>, screenId: string, cabinetKey: string): void {
    const draw = pathDrawRef.current;
    if (!draw || event.buttons !== draw.button || draw.screenId !== screenId || draw.cabinetKey === cabinetKey) return;
    event.preventDefault();
    if (draw.button === 0 && !draw.moved) {
      if (pathPanelMode === 'data') editDataPathCabinet(screenId, draw.cabinetKey, false);
      else editPowerPathCabinet(screenId, draw.cabinetKey, false);
    }
    pathDrawRef.current = { ...draw, cabinetKey, moved: true };
    if (pathPanelMode === 'data') editDataPathCabinet(screenId, cabinetKey, false);
    else editPowerPathCabinet(screenId, cabinetKey, false);
  }

  function finishPathPointerDraw(): void {
    const draw = pathDrawRef.current;
    if (draw?.button === 0 && !draw.moved) {
      if (pathPanelMode === 'data') editDataPathCabinet(draw.screenId, draw.cabinetKey);
      else editPowerPathCabinet(draw.screenId, draw.cabinetKey);
    }
    pathDrawRef.current = null;
  }

  function updateSelectedPowerPreset(presetId: string): void {
    if (!selectedPlacedScreenId) return;
    rememberState();
    setPlacedScreens((current) => current.map((screen) => screen.id === selectedPlacedScreenId
      ? { ...screen, screenConfig: { ...screen.screenConfig, presetId } }
      : screen));
  }

  function renderImportedSvgPreview(
    importedConfig: ScreenConfig,
    importedPreset: CabinetPreset,
    name: string
  ): string {
    const nativeWidth = importedPreset.resolutionX * importedConfig.cols;
    const nativeHeight = importedPreset.resolutionY * importedConfig.rows;
    const empty = new Set(importedConfig.emptyCabinetKeys);
    const pattern = visiblePatternConfig(config);
    const palette = pattern.palette && pattern.palette.length > 1 ? pattern.palette : [pattern.colorA, pattern.colorB];
    const cells: string[] = [];

    for (let row = 0; row < importedConfig.rows; row += 1) {
      for (let col = 0; col < importedConfig.cols; col += 1) {
        if (empty.has(`${col}-${row}`)) continue;
        const color = palette[(row + col) % palette.length] ?? DEFAULT_PATTERN_CONFIG.colorA;
        cells.push(`<rect x="${col * importedPreset.resolutionX}" y="${row * importedPreset.resolutionY}" width="${importedPreset.resolutionX}" height="${importedPreset.resolutionY}" fill="${color}"/>`);
      }
    }

    const grid = showCabinetGrid
      ? `<g fill="none" stroke="#ffffff" stroke-width="${Math.max(2, Math.round(Math.min(importedPreset.resolutionX, importedPreset.resolutionY) * 0.008))}" opacity=".85">${Array.from({ length: importedConfig.cols + 1 }, (_, col) => `<path d="M${col * importedPreset.resolutionX} 0V${nativeHeight}"/>`).join('')}${Array.from({ length: importedConfig.rows + 1 }, (_, row) => `<path d="M0 ${row * importedPreset.resolutionY}H${nativeWidth}"/>`).join('')}</g>`
      : '';
    const labelSize = Math.max(34, Math.min(nativeWidth, nativeHeight) * 0.08);
    const label = `<text x="${nativeWidth / 2}" y="${nativeHeight / 2}" fill="${fullBrightnessColor(textColor)}" stroke="rgba(0,0,0,.85)" stroke-width="${Math.max(3, labelSize * 0.08)}" paint-order="stroke" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${labelSize}" font-weight="700">${escapeSvgText(name)}</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${nativeWidth}" height="${nativeHeight}" viewBox="0 0 ${nativeWidth} ${nativeHeight}"><rect width="100%" height="100%" fill="#111827"/>${cells.join('')}${grid}${label}</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  async function handleNovaStarImport(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImportStatus(t('tpv.status.readingNovaStar'));
    try {
      // Сопоставляем кабинеты из файла с уже существующими в базе пресетами
      // (по brand+model, затем по разрешению) — повторный импорт того же
      // кабинета переиспользует существующий пресет вместо нового дубликата
      // "novastar-brand-model-...". Геометрия (разрешение/мм) всегда берётся
      // из самого файла — её нельзя подменять выбранным в базе пресетом,
      // иначе для некавадратных кабинетов (напр. 256×64) раскладка/пути
      // визуально разъедутся с реальным кабинетом.
      const imported = await importNovaStarProject(file, presets, lang);
      // SRCX/SCR часто не содержат паспортные вес/мощность кабинета. Для
      // несматченных (новых) пресетов с такими "пустыми" значениями донором
      // веса/мощности служит кабинет, выбранный пользователем в базе —
      // геометрия при этом не трогается.
      const powerDonor = preset;
      const newPresetsById = new Map<string, CabinetPreset>();
      const baseY = placedScreens.reduce((bottom, screen) => Math.max(bottom, screen.y + screen.height), 0) + 80;
      let nextX = 32;
      const screens = imported.screens.map((screen) => {
        const looksPlaceholder = screen.preset.maxPowerW <= 0.1 || screen.preset.weightKg <= 0.01;
        const finalPreset = !screen.matchedExistingPreset && looksPlaceholder && powerDonor
          ? { ...screen.preset, weightKg: powerDonor.weightKg, maxPowerW: powerDonor.maxPowerW, avgPowerW: powerDonor.avgPowerW }
          : screen.preset;
        if (!screen.matchedExistingPreset) newPresetsById.set(finalPreset.id, finalPreset);
        const screenConfig: ScreenConfig = { ...screen.config, presetId: finalPreset.id };
        const width = screenConfig.cols * finalPreset.resolutionX * WORKSPACE_PX_PER_PIXEL;
        const height = screenConfig.rows * finalPreset.resolutionY * WORKSPACE_PX_PER_PIXEL;
        const visualSettings = {
          ...currentVisualSettings(),
          config: visiblePatternConfig(config),
          screenLabel: screen.name
        };
        const placed: PlacedScreen = {
          id: crypto.randomUUID(),
          name: screen.name,
          imageSource: renderImportedPreview(screenConfig, finalPreset, screen.name),
          screenConfig,
          visualSettings,
          width,
          height,
          x: nextX,
          y: baseY,
          rotation: 0,
          processor: cloneProcessor(screen.processor)
        };
        nextX += width + 80;
        return placed;
      });
      const newPresets = Array.from(newPresetsById.values());
      if (newPresets.length > 0) onPresetsImport(newPresets);
      const allScreens = [...placedScreens, ...screens];
      setPlacedScreens(allScreens);
      setSelectedPlacedScreenId(null);
      setSelectedScreenIds([]);
      window.requestAnimationFrame(() => fitScreensInWorkspace(allScreens));
      const matchedCount = imported.screens.filter((screen) => screen.matchedExistingPreset).length;
      setImportStatus(t('tpv.status.importedScreens', { count: screens.length }) +
        (matchedCount > 0 ? t('tpv.status.matchedWithLibrary', { count: matchedCount }) : '') +
        (newPresets.length > 0 ? t('tpv.status.newPresets', { count: newPresets.length }) : ''));
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : t('tpv.status.novaStarImportFailed'));
    }
  }

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const source = reader.result;
      if (typeof source !== 'string') return;
      const image = new Image();
      image.onload = () => {
        logoRef.current = image;
        setLogoSource(source);
        setLogoName(file.name);
      };
      image.src = source;
    };
    reader.readAsDataURL(file);
  }

  function drawDataPathForExport(
    context: CanvasRenderingContext2D,
    screen: PlacedScreen,
    screenPreset: CabinetPreset
  ): void {
    if (!screen.processor) return;
    const cabinetWidth = screenPreset.resolutionX;
    const cabinetHeight = screenPreset.resolutionY;
    const unit = Math.min(cabinetWidth, cabinetHeight);

    screen.processor.ports.forEach((port, portIndex) => {
      const centers = port.assignedCabinets.map((key) => {
        const [col, row] = key.split('-').map(Number);
        return { x: (col + .5) * cabinetWidth, y: (row + .5) * cabinetHeight };
      });
      if (centers.length === 0) return;
      const color = `hsl(${portIndex * 83} 78% 38%)`;
      if (centers.length > 1) {
        context.save();
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        context.moveTo(centers[0].x, centers[0].y);
        centers.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.strokeStyle = 'rgba(255,255,255,.9)';
        context.lineWidth = Math.max(2, unit * .105);
        context.stroke();
        context.strokeStyle = color;
        context.lineWidth = Math.max(1, unit * .052);
        context.stroke();

        centers.slice(0, -1).forEach((point, index) => {
          const next = centers[index + 1];
          const x = (point.x + next.x) / 2;
          const y = (point.y + next.y) / 2;
          const angle = Math.atan2(next.y - point.y, next.x - point.x);
          const size = unit * .095;
          context.save();
          context.translate(x, y);
          context.rotate(angle);
          context.beginPath();
          context.moveTo(-size, -size * .72);
          context.lineTo(size, 0);
          context.lineTo(-size, size * .72);
          context.closePath();
          context.fillStyle = color;
          context.strokeStyle = 'rgba(255,255,255,.95)';
          context.lineWidth = Math.max(1, unit * .018);
          context.fill();
          context.stroke();
          context.restore();
        });
        context.restore();
      }

      const drawEndpoint = (point: { x: number; y: number }, fill: string): void => {
        context.beginPath();
        context.arc(point.x, point.y, unit * .14, 0, Math.PI * 2);
        context.fillStyle = '#fff';
        context.fill();
        context.beginPath();
        context.arc(point.x, point.y, unit * .095, 0, Math.PI * 2);
        context.fillStyle = fill;
        context.fill();
      };
      drawEndpoint(centers[0], '#16a34a');
      drawEndpoint(centers[centers.length - 1], '#dc2626');
    });
  }

  function dataUrlToBytes(dataUrl: string): Uint8Array {
    const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Не удалось загрузить маску экрана'));
      image.src = src;
    });
  }

  function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Не удалось закодировать PNG: изображение слишком большое'));
          return;
        }
        void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)));
      }, 'image/png');
    });
  }

  // Composites several placed screens into one PNG, positioned and rotated the
  // same way they sit on the canvas (screen.x/y/width/height are already in
  // resolution-proportional workspace units — see WORKSPACE_PX_PER_PIXEL), scaled
  // up so the highest-density screen in the set renders at its native resolution.
  async function buildCombinedMaskCanvas(screens: PlacedScreen[]): Promise<HTMLCanvasElement | null> {
    if (screens.length < 2) return null;
    const images = await Promise.all(screens.map((screen) => loadImageElement(screen.imageSource)));
    const minX = Math.min(...screens.map((screen) => screen.x));
    const minY = Math.min(...screens.map((screen) => screen.y));
    const maxX = Math.max(...screens.map((screen) => screen.x + screen.width));
    const maxY = Math.max(...screens.map((screen) => screen.y + screen.height));

    let outputScale = 0;
    screens.forEach((screen, index) => {
      const unrotatedWidth = screen.rotation === 90 || screen.rotation === 270 ? screen.height : screen.width;
      const density = images[index].naturalWidth / unrotatedWidth;
      if (Number.isFinite(density) && density > outputScale) outputScale = density;
    });
    if (!Number.isFinite(outputScale) || outputScale <= 0) outputScale = 1;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((maxX - minX) * outputScale));
    canvas.height = Math.max(1, Math.round((maxY - minY) * outputScale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;

    screens.forEach((screen, index) => {
      const unrotatedWidth = screen.rotation === 90 || screen.rotation === 270 ? screen.height : screen.width;
      const unrotatedHeight = screen.rotation === 90 || screen.rotation === 270 ? screen.width : screen.height;
      const drawWidth = unrotatedWidth * outputScale;
      const drawHeight = unrotatedHeight * outputScale;
      ctx.save();
      ctx.translate((screen.x + screen.width / 2 - minX) * outputScale, (screen.y + screen.height / 2 - minY) * outputScale);
      ctx.rotate((screen.rotation * Math.PI) / 180);
      ctx.drawImage(images[index], -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      ctx.restore();
    });
    return canvas;
  }

  // Combined mask (only when there's more than one screen) plus one mask per
  // screen individually — used by both the PNG export button and the PDF export.
  async function buildScreenMaskFiles(screens: PlacedScreen[]): Promise<{ name: string; bytes: Uint8Array }[]> {
    const withMasks = screens.filter((screen) => screen.imageSource?.startsWith('data:image/png;base64,'));
    const files: { name: string; bytes: Uint8Array }[] = [];
    if (withMasks.length > 1) {
      const combined = await buildCombinedMaskCanvas(withMasks);
      if (combined) {
        files.push({
          name: `${safeExportName(t('tpv.combinedMaskName'))}-${combined.width}x${combined.height}.png`,
          bytes: await canvasToPngBytes(combined)
        });
      }
    }
    withMasks.forEach((screen) => {
      files.push({ name: `${safeExportName(screen.name)}-mask.png`, bytes: dataUrlToBytes(screen.imageSource) });
    });
    return files;
  }

  async function exportMask(includeDataPath = false): Promise<void> {
    if (!includeDataPath && selectedScreenIds.length > 1) {
      const selected = placedScreens.filter((screen) => selectedScreenIds.includes(screen.id));
      setImportStatus(`Подготовка PNG для ${selected.length} экранов…`);
      try {
        const files = await buildScreenMaskFiles(selected);
        if (files.length === 0) {
          setImportStatus('У выбранных экранов нет готовых масок для экспорта');
          return;
        }
        const dir = await window.imageFiles.saveMany(files);
        setImportStatus(dir ? `Экспортировано файлов: ${files.length} в ${dir}` : 'Экспорт отменён');
      } catch (error) {
        setImportStatus(error instanceof Error ? error.message : 'Не удалось экспортировать PNG');
      }
      return;
    }

    setImportStatus(`Подготовка PNG ${widthPx} × ${heightPx}…`);
    window.setTimeout(() => {
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = widthPx;
      maskCanvas.height = heightPx;
      const maskContext = maskCanvas.getContext('2d');
      if (!maskContext) {
        setImportStatus('Не удалось создать canvas для экспорта');
        return;
      }

      drawScreen(maskContext, false);
      if (includeDataPath && selectedDataScreen) {
        const screenPreset = presets.find((item) => item.id === selectedDataScreen.screenConfig.presetId) ?? preset;
        drawDataPathForExport(maskContext, selectedDataScreen, screenPreset);
      }

      maskCanvas.toBlob((blob) => {
        if (!blob) {
          setImportStatus('Не удалось закодировать PNG: изображение слишком большое');
          return;
        }
        const defaultName = `${safeExportName(selectedDataScreen?.name ?? screenLabel)}-${widthPx}x${heightPx}${includeDataPath ? '-signal-path' : '-mask'}.png`;
        void blob.arrayBuffer()
          .then((buffer) => window.imageFiles.savePng(new Uint8Array(buffer), defaultName))
          .then((filePath) => setImportStatus(filePath ? `Экспортировано: ${filePath}` : 'Экспорт отменён'))
          .catch((error) => setImportStatus(error instanceof Error ? error.message : 'Не удалось экспортировать PNG'));
      }, 'image/png');
    }, 0);
  }

  function safeExportName(value: string): string {
    return value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').slice(0, 80) || 'screen';
  }

  function exportScreens(): ExportScreen[] {
    return placedScreens.filter((screen) => selectedScreenIds.length === 0 || selectedScreenIds.includes(screen.id)).flatMap((screen) => {
      const screenPreset = presets.find((item) => item.id === screen.screenConfig.presetId);
      return screenPreset ? [{
        id: screen.id,
        name: screen.name,
        preset: screenPreset,
        imageSource: screen.imageSource,
        cols: screen.screenConfig.cols,
        rows: screen.screenConfig.rows,
        emptyCabinetKeys: [...screen.screenConfig.emptyCabinetKeys],
        x: screen.x,
        y: screen.y,
        width: screen.width,
        height: screen.height,
        rotation: screen.rotation,
        processor: cloneProcessor(screen.processor),
        powerPlan: clonePowerPlan(screen.powerPlan)
      }] : [];
    });
  }


  async function exportProjectPdf(): Promise<void> {
    if (placedScreens.length === 0) {
      setImportStatus('Добавьте хотя бы один экран для экспорта');
      return;
    }
    setImportStatus('Подготовка PDF-отчёта и масок PNG…');
    try {
      const selectedPlaced = placedScreens.filter((screen) =>
        selectedScreenIds.length === 0 || selectedScreenIds.includes(screen.id));
      const masks = await buildScreenMaskFiles(selectedPlaced);
      const filePath = await window.exportFiles.savePdf(
        buildReportHtml(projectName, exportScreens(), lang),
        `${safeExportName(projectName)}-report.pdf`,
        safeExportName(projectName),
        masks
      );
      setImportStatus(filePath
        ? `PDF экспортирован: ${filePath}${masks.length ? ` (+ ${masks.length} PNG рядом с ним)` : ''}`
        : 'Экспорт отменён');
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : 'Не удалось экспортировать PDF');
    }
  }

  const selectedDataScreen = placedScreens.find((screen) => screen.id === selectedPlacedScreenId);
  const selectedDataPreset = selectedDataScreen
    ? presets.find((item) => item.id === selectedDataScreen.screenConfig.presetId) ?? presets[0]
    : null;
  const autoRoutingOrder = useMemo(() => selectedDataScreen
    ? generateCabinetOrder(
        selectedDataScreen.screenConfig,
        autoRoutingPattern,
        autoRoutingCorner,
        autoRoutingReverse
      )
    : [], [
      selectedDataScreen?.screenConfig.cols,
      selectedDataScreen?.screenConfig.rows,
      selectedDataScreen?.screenConfig.emptyCabinetKeys,
      autoRoutingPattern,
      autoRoutingCorner,
      autoRoutingReverse
    ]);
  const autoPreviewProcessor = useMemo(() => {
    if (!selectedDataScreen || !selectedDataPreset) return null;
    const source = selectedDataScreen.processor ?? createNovaStarProcessor();
    return source ? routeProcessor(
      source,
      autoRoutingOrder,
      selectedDataPreset.resolutionX * selectedDataPreset.resolutionY
    ) : null;
  }, [selectedDataScreen?.processor, selectedDataPreset, autoRoutingOrder, newControllerModel, newControllerSendingCards]);
  const autoPowerSource = selectedDataScreen?.powerPlan ?? {
    voltage: 230,
    circuitBreakerAmps: 16,
    safetyMarginPercent: 20,
    powerFactor: .95,
    phases: 3 as const,
    circuits: []
  };
  const autoUsablePowerW = usablePowerPerPortW(
    autoPowerSource.voltage, autoPowerSource.circuitBreakerAmps, autoPowerSource.safetyMarginPercent, autoPowerSource.powerFactor
  );
  const autoPowerAutoCapacity = selectedDataPreset
    ? Math.max(1, Math.floor(autoUsablePowerW / Math.max(.001, selectedDataPreset.maxPowerW)))
    : null;
  const autoPreviewPowerPlan = useMemo(() => selectedDataPreset
    ? generatePowerPlan({
        voltage: autoPowerSource.voltage,
        circuitBreakerAmps: autoPowerSource.circuitBreakerAmps,
        safetyMarginPercent: autoPowerSource.safetyMarginPercent,
        powerFactor: autoPowerSource.powerFactor,
        phases: autoPowerSource.phases
      }, autoRoutingOrder, selectedDataPreset.maxPowerW, autoPowerCabinetLimit ?? undefined, (n) => t('pp.circuitName', { n }))
    : null, [
      selectedDataPreset,
      autoRoutingOrder,
      autoPowerSource.voltage,
      autoPowerSource.circuitBreakerAmps,
      autoPowerSource.safetyMarginPercent,
      autoPowerSource.powerFactor,
      autoPowerSource.phases,
      autoPowerCabinetLimit
    ]);
  const autoPowerOverloadedCircuits = selectedDataPreset
    ? autoPreviewPowerPlan?.circuits.filter((circuit) => circuit.assignedCabinets.length * selectedDataPreset.maxPowerW > autoUsablePowerW).length ?? 0
    : 0;

  function applyAutoRouting(scope: 'data' | 'power' | 'all'): void {
    if (!selectedDataScreen || !selectedDataPreset) return;
    const routedProcessor = autoPreviewProcessor;
    const routedPowerPlan = autoPreviewPowerPlan;
    rememberState();
    setPlacedScreens((current) => current.map((screen) => screen.id === selectedDataScreen.id
      ? {
          ...screen,
          processor: scope !== 'power' && routedProcessor ? cloneProcessor(routedProcessor) : screen.processor,
          powerPlan: scope !== 'data' && routedPowerPlan ? clonePowerPlan(routedPowerPlan) : screen.powerPlan
        }
      : screen));
    if (scope !== 'power') setActiveDataPortId(routedProcessor?.ports[0]?.portId ?? null);
    if (scope !== 'data') setActivePowerCircuitId(routedPowerPlan?.circuits[0]?.id ?? null);
    setShowAutoRoutingPreview(false);
    setImportStatus(`Автосхема применена: ${autoRoutingOrder.length} кабинетов`);
  }

  return (
    <section className={`pattern-workspace is-${workspaceMode}${importStatus ? ' has-import-status' : ''}`}>
      <div className="workspace-title">
        <div>
          <h1>{workspaceMode === 'wiring' ? 'Расключение' : 'Пиксельная маска'}</h1>
          <span>{widthPx} × {heightPx} px · {(widthMm / 1000).toFixed(2)} × {(heightMm / 1000).toFixed(2)} м</span>
        </div>
        <div className="zoom-controls" aria-label="Масштаб холста" data-history-revision={historyRevision}>
          <label className="import-srcx-button">
            Импорт .srcx/.scr
            <input type="file" accept=".srcx,.scr" onChange={handleNovaStarImport} />
          </label>
          <button
            type="button"
            onClick={() => setWorkspaceZoom((current) => clampZoom(current - ZOOM_STEP))}
          >
            −
          </button>
          <span>{Math.round(workspaceZoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setWorkspaceZoom((current) => clampZoom(current + ZOOM_STEP))}
          >
            +
          </button>
          <button type="button" onClick={() => setWorkspaceZoom(1)}>
            100%
          </button>
          <button type="button" onClick={() => fitScreensInWorkspace()}>
            Вписать
          </button>
          <span className="toolbar-divider" />
          <button type="button" disabled={historyRef.current.past.length === 0} onClick={() => restoreHistory('undo')} title="Отменить (Ctrl+Z)">↶</button>
          <button type="button" disabled={historyRef.current.future.length === 0} onClick={() => restoreHistory('redo')} title="Повторить (Ctrl+Y)">↷</button>
          <span className="toolbar-divider" />
          <button type="button" disabled={selectedScreenIds.length === 0} onClick={rotateSelected} title="Повернуть на 90°">↻ 90°</button>
          <span className="toolbar-divider" />
          <button type="button" onClick={() => void exportMask(false)} title="Экспортировать маску выбранного экрана (или нескольких) в PNG">
            {selectedScreenIds.length > 1 ? `PNG масок (${selectedScreenIds.length})` : 'PNG маска'}
          </button>
          <button type="button" disabled={!selectedDataScreen?.processor} onClick={() => void exportMask(true)} title="Экспортировать маску с сигнальным путём в PNG">
            PNG с путями
          </button>
          <button type="button" disabled={placedScreens.length === 0} onClick={() => void exportProjectPdf()} title="Экспортировать PDF-отчёт по проекту">
            Экспорт PDF
          </button>
        </div>
      </div>

      {importStatus && <div className="import-status" role="status">{importStatus}</div>}

      <div className="pattern-layout">
        <aside className="pattern-controls">
          <fieldset className="pixel-mask-control">
            <legend>Подпись экрана</legend>
            <label>
              Название:{' '}
              <input value={screenLabel} onChange={(e) => {
                const name = e.target.value;
                setScreenLabel(name);
                if (selectedPlacedScreenId) {
                  setPlacedScreens((current) => current.map((screen) => screen.id === selectedPlacedScreenId
                    ? { ...screen, name, visualSettings: { ...screen.visualSettings, screenLabel: name } }
                    : screen));
                }
              }} />
            </label>
            <br />
            <label>
              Базовый размер подписи:{' '}
              <input type="number" min={12} value={labelFontSize} onChange={(e) => setLabelFontSize(Number(e.target.value))} />
            </label>
            <p className="field-hint">Размер зависит от площади экрана. Сейчас: {effectiveLabelFontSize} px.</p>
            <br />
            <label>
              Цвет надписей:{' '}
              <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {TEXT_COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Выбрать цвет ${color}`}
                  title={color}
                  onClick={() => setTextColor(color)}
                  style={{
                    width: 24,
                    height: 24,
                    padding: 0,
                    cursor: 'pointer',
                    background: color,
                    border: textColor === color ? '3px solid #2563eb' : '1px solid #777',
                    borderRadius: 4
                  }}
                />
              ))}
            </div>
            <div className="switch-list" style={{ marginTop: 8 }}>
              <label><span>Показать разрешение</span><button type="button" className={showResolution ? 'is-on' : ''} onClick={() => setShowResolution(!showResolution)}>{showResolution ? 'On' : 'Off'}</button></label>
            </div>
            {showResolution && (
              <>
                <br />
                <label>
                  Цвет разрешения:{' '}
                  <input
                    type="color"
                    value={resolutionTextColor}
                    onChange={(e) => setResolutionTextColor(e.target.value)}
                  />
                </label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {TEXT_COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Выбрать цвет разрешения ${color}`}
                      title={color}
                      onClick={() => setResolutionTextColor(color)}
                      style={{
                        width: 24,
                        height: 24,
                        padding: 0,
                        cursor: 'pointer',
                        background: color,
                        border: resolutionTextColor === color ? '3px solid #2563eb' : '1px solid #777',
                        borderRadius: 4
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </fieldset>

          <div className="projection-logo-control pixel-mask-control">
            <label className="projection-logo-button">
              {logoSource ? 'Заменить логотип' : 'Загрузить логотип'}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoChange} />
            </label>
            {logoSource && <button type="button" title={logoName} onClick={() => { logoRef.current = null; setLogoSource(null); setLogoName(''); }}>Удалить</button>}
            <span>{logoName || 'PNG, JPG, WebP или SVG'}</span>
          </div>
          <fieldset className="pixel-mask-control projection-logo-settings">
            <legend>Настройки логотипа</legend>
            {!logoSource && <p className="field-hint">Загрузите логотип выше, чтобы применить эти настройки.</p>}
            <label>Позиция
              <select value={logoPosition} onChange={(e) => setLogoPosition(e.target.value as OverlayPosition)}>
                {Object.entries(overlayPositionLabels(t)).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>Ширина, %<input type="number" min={1} max={100} value={logoScalePercent} onChange={(e) => setLogoScalePercent(Number(e.target.value))} /></label>
            <label>Непрозрачность, %
              <input
                type="number"
                min={0}
                max={100}
                value={logoOpacityPercent}
                onChange={(e) => setLogoOpacityPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
              />
            </label>
          </fieldset>

          <p className="field-hint pixel-mask-control">
            Выберите экран на холсте, чтобы параметры в левой панели применялись к нему.
            Новый экран создаётся с базовой раскладкой 6 × 4 кабинета.
          </p>
          <button
            type="button"
            className={`edit-screen-button pixel-mask-control${isEditingScreen ? ' is-active' : ''}`}
            onClick={() => setIsEditingScreen((current) => !current)}
          >
            {isEditingScreen ? 'Завершить редактирование' : 'Редактировать экран'}
          </button>
          {isEditingScreen && (
            <p className="field-hint pixel-mask-control">
              Правый клик по кабинету выбранного экрана удаляет его; повторный правый клик возвращает кабинет.
            </p>
          )}
          <p className="field-hint pixel-mask-control">
            Выбранный паттерн сохраняется в установленных кабинетах; пустые ячейки
            прозрачные. Размер файла: {widthPx} × {heightPx} px.
          </p>

          <fieldset className="pixel-mask-control">
            <legend>Паттерн</legend>
            <p className="field-hint">
              Шахматка строится по кабинетам: одна клетка равна одному кабинету.
            </p>
            <label className="pattern-preset-select">
              Цветовая схема
              <select
                value={String(CHECKERBOARD_COLOR_PRESETS.findIndex((preset) => (
                  'palette' in preset
                    ? config.palette?.join(',') === preset.palette.join(',')
                    : !config.palette && config.colorA.toLowerCase() === preset.colorA && config.colorB.toLowerCase() === preset.colorB
                )))}
                onChange={(event) => {
                  const preset = CHECKERBOARD_COLOR_PRESETS[Number(event.target.value)];
                  if (!preset) return;
                  setConfig({ ...config, colorA: preset.colorA, colorB: preset.colorB, palette: 'palette' in preset ? [...preset.palette] : undefined });
                }}
              >
                <option value="-1">Пользовательские цвета</option>
                {CHECKERBOARD_COLOR_PRESETS.map((preset, index) => <option key={preset.id} value={index}>{t(preset.nameKey)}</option>)}
              </select>
            </label>
            <div className="pattern-preset-preview" aria-label="Превью схемы">
              {(config.palette?.length ? config.palette : [config.colorA, config.colorB]).map((color, index) => <i key={`${color}-${index}`} style={{ background: color }} />)}
            </div>

            <label>
              Цвет A:{' '}
              <input
                type="color"
                value={config.colorA}
                onChange={(e) => setConfig({ ...config, colorA: e.target.value, palette: undefined })}
              />
            </label>
            <br />

            <label>
              Цвет B:{' '}
              <input
                type="color"
                value={config.colorB}
                onChange={(e) => setConfig({ ...config, colorB: e.target.value, palette: undefined })}
              />
            </label>
          </fieldset>

          <fieldset className="pixel-mask-control">
            <legend>Наложение</legend>
            <div className="switch-list">
              <label><span>Показать границы кабинетов</span><button type="button" className={showCabinetGrid ? 'is-on' : ''} onClick={() => setShowCabinetGrid(!showCabinetGrid)}>{showCabinetGrid ? 'On' : 'Off'}</button></label>
              <label><span>Нумерация кабинетов</span><button type="button" className={showCabinetNumbers ? 'is-on' : ''} onClick={() => setShowCabinetNumbers(!showCabinetNumbers)}>{showCabinetNumbers ? 'On' : 'Off'}</button></label>
              <label><span>Тестовая сетка</span><button type="button" className={showTestGrid ? 'is-on' : ''} onClick={() => setShowTestGrid(!showTestGrid)}>{showTestGrid ? 'On' : 'Off'}</button></label>
            </div>
          </fieldset>

          <fieldset className="auto-routing-panel wiring-control">
            <legend>Автоматическая схема</legend>
            {!selectedDataScreen ? (
              <p className="field-hint">Выберите экран для построения схемы.</p>
            ) : (
              <>
                <div className="auto-routing-settings">
                  <label>Схема
                    <select value={autoRoutingPattern} onChange={(event) => setAutoRoutingPattern(event.target.value as RoutingPattern)}>
                      <option value="snake-rows">Змейка по строкам</option>
                      <option value="snake-columns">Змейка по колонкам</option>
                      <option value="rows">По строкам</option>
                      <option value="columns">По колонкам</option>
                      <option value="center">От центра</option>
                    </select>
                  </label>
                  <label>Начальная точка
                    <select value={autoRoutingCorner} onChange={(event) => setAutoRoutingCorner(event.target.value as StartCorner)}>
                      <option value="top-left">Сверху слева</option>
                      <option value="top-right">Сверху справа</option>
                      <option value="bottom-left">Снизу слева</option>
                      <option value="bottom-right">Снизу справа</option>
                    </select>
                  </label>
                  <label>Кабинетов в линию (Power)
                    <input
                      type="number"
                      min={1}
                      placeholder={autoPowerAutoCapacity !== null ? `Авто (${autoPowerAutoCapacity})` : 'Авто'}
                      value={autoPowerCabinetLimit ?? ''}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setAutoPowerCabinetLimit(raw.trim() === '' ? null : Math.max(1, Math.round(Number(raw))));
                      }}
                    />
                  </label>
                </div>
                <div className="switch-list">
                  <label><span>Обратное направление</span><button type="button" className={autoRoutingReverse ? 'is-on' : ''} onClick={() => setAutoRoutingReverse(!autoRoutingReverse)}>{autoRoutingReverse ? 'On' : 'Off'}</button></label>
                </div>
                {!selectedDataScreen.processor && (
                  <>
                    <label>Контроллер
                      <select value={newControllerModel} onChange={(event) => setNewControllerModel(event.target.value)}>
                        {NOVASTAR_CONTROLLERS.map((controller) => <option key={controller.model} value={controller.model}>{controller.model}</option>)}
                      </select>
                    </label>
                    {(() => {
                      const template = NOVASTAR_CONTROLLERS.find((controller) => controller.model === newControllerModel);
                      return template?.maxSendingCards ? (
                        <label>Sending-карт установлено
                          <select value={newControllerSendingCards} onChange={(event) => setNewControllerSendingCards(Number(event.target.value))}>
                            {Array.from({ length: template.maxSendingCards }, (_, index) => index + 1).map((count) => (
                              <option key={count} value={count}>{count} × {template.ports} портов = {count * template.ports}</option>
                            ))}
                          </select>
                        </label>
                      ) : null;
                    })()}
                  </>
                )}
                <div className="auto-routing-summary">
                  <span>Кабинетов: <b>{autoRoutingOrder.length}</b></span>
                  <span>Data-портов: <b>{autoPreviewProcessor?.ports.filter((port) => port.assignedCabinets.length > 0).length ?? 0}</b></span>
                  <span className={autoPowerOverloadedCircuits > 0 ? 'is-overloaded' : undefined}>
                    Силовых цепей: <b>{autoPreviewPowerPlan?.circuits.length ?? 0}</b>
                    {autoPowerOverloadedCircuits > 0 && <> · перегружено: <b>{autoPowerOverloadedCircuits}</b></>}
                  </span>
                </div>
                <button type="button" onClick={() => setShowAutoRoutingPreview((current) => !current)}>
                  {showAutoRoutingPreview ? 'Скрыть предпросмотр' : 'Предварительный просмотр'}
                </button>
                {showAutoRoutingPreview && (
                  <div className="auto-routing-preview">
                    <div className="path-planning-tabs auto-preview-mode-tabs" role="tablist" aria-label="Что показывает превью">
                      <button type="button" role="tab" aria-selected={autoPreviewMode === 'data'} className={autoPreviewMode === 'data' ? 'is-active' : ''} onClick={() => setAutoPreviewMode('data')}>Data-порты</button>
                      <button type="button" role="tab" aria-selected={autoPreviewMode === 'power'} className={autoPreviewMode === 'power' ? 'is-active' : ''} onClick={() => setAutoPreviewMode('power')}>Силовые цепи</button>
                    </div>
                    <div className="auto-routing-grid" style={{ gridTemplateColumns: `repeat(${selectedDataScreen.screenConfig.cols}, 1fr)` }}>
                      {Array.from({ length: selectedDataScreen.screenConfig.rows }, (_, row) =>
                        Array.from({ length: selectedDataScreen.screenConfig.cols }, (_, col) => {
                          const key = `${col}-${row}`;
                          if (selectedDataScreen.screenConfig.emptyCabinetKeys.includes(key)) return <span key={key} className="is-empty" />;
                          const orderIndex = autoRoutingOrder.indexOf(key);
                          const groupIndex = autoPreviewMode === 'data'
                            ? autoPreviewProcessor?.ports.findIndex((port) => port.assignedCabinets.includes(key)) ?? -1
                            : autoPreviewPowerPlan?.circuits.findIndex((circuit) => circuit.assignedCabinets.includes(key)) ?? -1;
                          return <span key={key} style={groupIndex >= 0 ? { background: `hsl(${groupIndex * 83} 62% 38%)` } : undefined}>{orderIndex + 1}</span>;
                        })
                      )}
                    </div>
                    {autoPreviewMode === 'data' && (autoPreviewProcessor?.ports.reduce((sum, port) => sum + port.assignedCabinets.length, 0) ?? 0) < autoRoutingOrder.length && (
                      <p className="data-path-summary is-warning">Портов контроллера недостаточно: часть кабинетов не будет назначена.</p>
                    )}
                    {autoPreviewMode === 'power' && autoPowerOverloadedCircuits > 0 && (
                      <p className="data-path-summary is-warning">
                        Перегружено силовых линий: {autoPowerOverloadedCircuits} — превышен лимит {(autoUsablePowerW / 1000).toFixed(2)} кВт на линию.
                        {autoPowerAutoCapacity !== null && ` Безопасно: до ${autoPowerAutoCapacity} каб./линию.`}
                      </p>
                    )}
                    <div className="auto-routing-actions">
                      <button type="button" onClick={() => applyAutoRouting('data')}>Применить Data</button>
                      <button type="button" onClick={() => applyAutoRouting('power')}>Применить Power</button>
                      <button type="button" onClick={() => applyAutoRouting('all')}>Применить всё</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </fieldset>

          <div className="path-planning-tabs wiring-control" role="tablist" aria-label="Тип инженерной схемы">
            <button type="button" role="tab" aria-selected={pathPanelMode === 'data'} className={pathPanelMode === 'data' ? 'is-active' : ''} onClick={() => { setPathPanelMode('data'); setIsEditingPowerPath(false); }}>Сигнал</button>
            <button type="button" role="tab" aria-selected={pathPanelMode === 'power'} className={pathPanelMode === 'power' ? 'is-active' : ''} onClick={() => { setPathPanelMode('power'); setIsEditingDataPath(false); }}>Питание</button>
          </div>

          {pathPanelMode === 'data' && <fieldset className="data-path-panel wiring-control">
            <legend>Data path mapping</legend>
            {!selectedDataScreen ? (
              <p className="field-hint">Выберите экран на рабочей области.</p>
            ) : !selectedDataScreen.processor ? (
              <div className="data-controller-create">
                <p className="field-hint">Выберите контроллер для ручного построения Data Path.</p>
                <label>
                  Контроллер
                  <select value={newControllerModel} onChange={(event) => setNewControllerModel(event.target.value)}>
                    {NOVASTAR_CONTROLLERS.map((controller) => (
                      <option key={controller.model} value={controller.model}>
                        {controller.model} · {controller.ports} портов{controller.maxSendingCards ? '/карта' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {(() => {
                  const template = NOVASTAR_CONTROLLERS.find((controller) => controller.model === newControllerModel);
                  return template?.maxSendingCards ? (
                    <label>Sending-карт установлено
                      <select value={newControllerSendingCards} onChange={(event) => setNewControllerSendingCards(Number(event.target.value))}>
                        {Array.from({ length: template.maxSendingCards }, (_, index) => index + 1).map((count) => (
                          <option key={count} value={count}>{count} × {template.ports} портов = {count * template.ports}</option>
                        ))}
                      </select>
                    </label>
                  ) : null;
                })()}
                <button type="button" onClick={addNovaStarController}>Добавить и редактировать пути</button>
              </div>
            ) : (
              <>
                <strong>{selectedDataScreen.processor.brand} · {controllerSummaryLabel(selectedDataScreen.processor)}</strong>
                <div className="data-path-actions">
                  <button type="button" className={isEditingDataPath ? 'is-active' : ''} onClick={toggleDataPathEditor}>
                    {isEditingDataPath ? 'Завершить редактирование трасс' : 'Редактировать трассы'}
                  </button>
                  <button
                    type="button"
                    className={controllerFormMode === 'change' ? 'is-active' : ''}
                    onClick={() => (controllerFormMode === 'change' ? setControllerFormMode(null) : startChangingController(selectedDataScreen.processor!))}
                  >
                    Сменить контроллер
                  </button>
                  <button
                    type="button"
                    className={controllerFormMode === 'add' ? 'is-active' : ''}
                    onClick={() => (controllerFormMode === 'add' ? setControllerFormMode(null) : startAddingController())}
                    title="Добавить ещё один контроллер к этому экрану, когда портов текущего не хватает"
                  >
                    Добавить контроллер
                  </button>
                </div>
                {controllerFormMode && (
                  <div className="data-controller-create">
                    <p className="field-hint is-warning">
                      {controllerFormMode === 'change'
                        ? 'Смена контроллера пересоздаёт все порты — уже назначенные трассы на этом экране будут сброшены.'
                        : 'Новые порты добавятся к уже существующим — ранее назначенные трассы не изменятся.'}
                    </p>
                    <label>
                      Контроллер
                      <select value={newControllerModel} onChange={(event) => setNewControllerModel(event.target.value)}>
                        {NOVASTAR_CONTROLLERS.map((controller) => (
                          <option key={controller.model} value={controller.model}>
                            {controller.model} · {controller.ports} портов{controller.maxSendingCards ? '/карта' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(() => {
                      const template = NOVASTAR_CONTROLLERS.find((controller) => controller.model === newControllerModel);
                      return template?.maxSendingCards ? (
                        <label>Sending-карт установлено
                          <select value={newControllerSendingCards} onChange={(event) => setNewControllerSendingCards(Number(event.target.value))}>
                            {Array.from({ length: template.maxSendingCards }, (_, index) => index + 1).map((count) => (
                              <option key={count} value={count}>{count} × {template.ports} портов = {count * template.ports}</option>
                            ))}
                          </select>
                        </label>
                      ) : null;
                    })()}
                    <div className="data-path-actions">
                      <button type="button" onClick={controllerFormMode === 'change' ? addNovaStarController : addAdditionalController}>Применить</button>
                      <button type="button" onClick={() => setControllerFormMode(null)}>Отмена</button>
                    </div>
                  </div>
                )}
                {isEditingDataPath && (
                  <>
                    <p className="field-hint">Выберите порт, затем нажимайте кабинеты в порядке прохождения сигнала. Повторный клик удаляет кабинет из цепочки.</p>
                    <div className="data-path-actions">
                      <button type="button" disabled={!activeDataPortId} onClick={() => clearDataPath(true)}>Очистить порт</button>
                      <button type="button" onClick={() => clearDataPath(false)}>Очистить все пути</button>
                    </div>
                  </>
                )}
                <div className="data-port-list">
                  {dataPortsBySendingCard(selectedDataScreen.processor.ports).map((group) => (
                    <section className="sending-card-group" key={group.key}>
                      <h4>{group.title}</h4>
                      {group.ports.map((port) => {
                    const portIndex = selectedDataScreen.processor!.ports.indexOf(port);
                    const pixels = port.assignedCabinets.length * (selectedDataPreset?.resolutionX ?? 0) * (selectedDataPreset?.resolutionY ?? 0);
                    const pixelLoad = port.maxPixels > 0 ? pixels / port.maxPixels : 0;
                    const cabinetLoad = port.maxCabinets ? port.assignedCabinets.length / port.maxCabinets : 0;
                    const loadPercent = Math.round(Math.max(pixelLoad, cabinetLoad) * 100);
                    const invalid = loadPercent > 100;
                    return (
                      <button
                        type="button"
                        key={port.portId}
                        className={`${activeDataPortId === port.portId ? 'is-active' : ''}${invalid ? ' is-invalid' : ''}`}
                        onClick={() => setActiveDataPortId(port.portId)}
                        style={{ '--port-color': `hsl(${portIndex * 83} 85% 60%)` } as React.CSSProperties}
                      >
                        <span className="data-port-heading">
                          <b>Port {port.sourcePortName ?? port.portId}</b>
                          <em className={invalid ? 'is-overloaded' : ''}>{invalid ? `Перегрузка ${loadPercent}%` : `${loadPercent}%`}</em>
                        </span>
                        <span className="data-port-stats">{port.assignedCabinets.length} каб. · {pixels.toLocaleString()} / {port.maxPixels.toLocaleString()} px</span>
                        <span className="data-port-meter" aria-label={`Загрузка ${loadPercent}%`}>
                          <i className={invalid ? 'is-overloaded' : ''} style={{ width: `${Math.min(loadPercent, 100)}%` }} />
                        </span>
                      </button>
                    );
                      })}
                    </section>
                  ))}
                </div>
                {(() => {
                  const installed = selectedDataScreen.screenConfig.cols * selectedDataScreen.screenConfig.rows - selectedDataScreen.screenConfig.emptyCabinetKeys.length;
                  const assigned = new Set(selectedDataScreen.processor?.ports.flatMap((port) => port.assignedCabinets) ?? []).size;
                  const pixelsPerCabinet = (selectedDataPreset?.resolutionX ?? 0) * (selectedDataPreset?.resolutionY ?? 0);
                  const overloaded = selectedDataScreen.processor?.ports.filter((port) =>
                    port.assignedCabinets.length * pixelsPerCabinet > port.maxPixels ||
                    (port.maxCabinets !== undefined && port.assignedCabinets.length > port.maxCabinets)
                  ).length ?? 0;
                  return <p className={`data-path-summary${assigned < installed || overloaded > 0 ? ' is-warning' : ''}`}>Назначено {assigned} из {installed} кабинетов{overloaded > 0 ? ` · перегружено портов: ${overloaded}` : ''}</p>;
                })()}
              </>
            )}
          </fieldset>}

          {pathPanelMode === 'power' && selectedDataScreen && selectedDataPreset && (
            <div className="wiring-control">
              <PowerPathPlanner
                plan={selectedDataScreen.powerPlan}
                screenConfig={selectedDataScreen.screenConfig}
                preset={selectedDataPreset}
                presets={presets}
                onPresetChange={updateSelectedPowerPreset}
                onChange={updatePowerPlan}
                activeCircuitId={activePowerCircuitId}
                isEditing={isEditingPowerPath}
                onActiveCircuitChange={setActivePowerCircuitId}
                onEditingChange={(editing) => {
                  setIsEditingPowerPath(editing);
                  if (editing) setIsEditingDataPath(false);
                }}
              />
            </div>
          )}

          <div className="screen-details">
            <div><b>Разрешение:</b> {widthPx} × {heightPx} px</div>
            <div><b>Физический размер:</b> {(widthMm / 1000).toFixed(2)} × {(heightMm / 1000).toFixed(2)} м</div>
            <div><b>Шаг пикселя:</b> {preset.pixelPitchMm} мм</div>
            <div><b>Раскладка:</b> {cols} × {rows} кабинетов</div>
          </div>

        </aside>

        <div
          ref={canvasPaneRef}
          className={`canvas-pane${isPanningWorkspace ? ' is-panning' : ''}`}
          onPointerDownCapture={(event) => {
            if (event.button === 1 || (event.button === 0 && event.altKey)) startWorkspacePan(event);
          }}
          onPointerDown={(event) => {
            if (event.button === 0 && !event.altKey) startWorkspacePan(event);
          }}
          onPointerMove={moveWorkspace}
          onPointerUp={stopWorkspacePan}
          onPointerCancel={stopWorkspacePan}
          onWheel={zoomWorkspaceAtPointer}
        >
          <div
            className="canvas-stage-viewport"
            style={{
              width: stageSize.width * workspaceZoom,
              height: stageSize.height * workspaceZoom
            }}
          >
            <div
              ref={canvasStageRef}
              className="canvas-stage"
              style={{
                width: stageSize.width,
                height: stageSize.height,
                transform: `translate(${workspaceOffset.x}px, ${workspaceOffset.y}px) scale(${workspaceZoom})`
              }}
            >
              {placedScreens.map((screen) => (
                <div
                  key={screen.id}
                  className={`placed-screen-frame${selectedScreenIds.includes(screen.id) ? ' is-selected' : ''}${selectedPlacedScreenId === screen.id ? ' is-active-screen' : ''}${isEditingScreen ? ' is-editing' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Выбрать ${screen.name}`}
                  aria-pressed={selectedScreenIds.includes(screen.id)}
                  onContextMenu={(event) => {
                    if (workspaceMode === 'wiring' && (isEditingDataPath || isEditingPowerPath)) {
                      event.preventDefault();
                      return;
                    }
                    toggleCabinetInScreen(event, screen);
                  }}
                  onPointerDown={(event) => startPlacedScreenDrag(event, screen)}
                  onPointerMove={movePlacedScreen}
                  onPointerUp={stopPlacedScreenDrag}
                  onPointerCancel={stopPlacedScreenDrag}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      selectPlacedScreen(screen);
                    }
                  }}
                  style={{
                    width: screen.width,
                    height: screen.height,
                    transform: `translate3d(${screen.x}px, ${screen.y}px, 0)`
                  }}
                >
                  <img
                    src={screen.imageSource}
                    alt={screen.name}
                    className="placed-screen-image"
                    draggable={false}
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      width: screen.rotation === 90 || screen.rotation === 270 ? screen.height : screen.width,
                      height: screen.rotation === 90 || screen.rotation === 270 ? screen.width : screen.height,
                      transform: `translate(-50%, -50%) rotate(${screen.rotation}deg)`,
                      ...(workspaceZoom < 0.12 ? { filter: `blur(${0.45 / workspaceZoom}px)` } : {})
                    }}
                  />
                  {workspaceMode === 'wiring' && pathPanelMode === 'data' && screen.processor && selectedPlacedScreenId === screen.id && (() => {
                    const cols = screen.screenConfig.cols;
                    const rows = screen.screenConfig.rows;
                    const overlayWidth = screen.rotation === 90 || screen.rotation === 270 ? screen.height : screen.width;
                    const overlayHeight = screen.rotation === 90 || screen.rotation === 270 ? screen.width : screen.height;
                    const screenPreset = presets.find((item) => item.id === screen.screenConfig.presetId) ?? presets[0];
                    // viewBox в нативных пикселях кабинета (а не в "кабинетных" единицах 1×1) —
                    // иначе у прямоугольных (не квадратных) кабинетов svg растягивается по
                    // большей оси и оверлей пути съезжает относительно реального изображения.
                    const cellW = screenPreset.resolutionX;
                    const cellH = screenPreset.resolutionY;
                    const unit = Math.min(cellW, cellH);
                    return (
                      <svg
                        className={`data-path-overlay${isEditingDataPath && selectedPlacedScreenId === screen.id ? ' is-editing' : ''}`}
                        onPointerUp={finishPathPointerDraw}
                        onPointerCancel={finishPathPointerDraw}
                        viewBox={`0 0 ${cols * cellW} ${rows * cellH}`}
                        style={{
                          left: '50%',
                          top: '50%',
                          width: overlayWidth,
                          height: overlayHeight,
                          transform: `translate(-50%, -50%) rotate(${screen.rotation}deg)`,
                          '--cell-unit': unit
                        } as React.CSSProperties}
                      >
                        {isEditingDataPath && screen.processor.ports.flatMap((port, portIndex) => port.assignedCabinets.map((key) => {
                          const [col, row] = key.split('-').map(Number);
                          return <rect key={`${port.portId}-${key}`} x={col * cellW} y={row * cellH} width={cellW} height={cellH} fill={`hsl(${portIndex * 83} 75% 55% / .24)`} />;
                        }))}
                        {screen.processor.ports.map((port, portIndex) => {
                          const centers = port.assignedCabinets.map((key) => {
                            const [col, row] = key.split('-').map(Number);
                            return { x: (col + .5) * cellW, y: (row + .5) * cellH };
                          });
                          const points = centers.map((point) => `${point.x},${point.y}`).join(' ');
                          const first = port.assignedCabinets[0]?.split('-').map(Number);
                          const last = port.assignedCabinets.at(-1)?.split('-').map(Number);
                          const portPixels = port.assignedCabinets.length * screenPreset.resolutionX * screenPreset.resolutionY;
                          const overloaded = portPixels > port.maxPixels || (port.maxCabinets !== undefined && port.assignedCabinets.length > port.maxCabinets);
                          const color = overloaded ? '#dc2626' : `hsl(${portIndex * 83} 78% 38%)`;
                          return (
                            <g key={port.portId} className={selectedPlacedScreenId === screen.id && activeDataPortId && activeDataPortId !== port.portId ? 'is-dimmed' : ''}>
                              {port.assignedCabinets.length > 1 && (
                                <>
                                  <polyline points={points} fill="none" stroke="rgba(255,255,255,.82)" strokeWidth={unit * .105} strokeLinecap="round" strokeLinejoin="round" />
                                  <polyline points={points} fill="none" stroke={color} strokeWidth={unit * .052} strokeLinecap="round" strokeLinejoin="round" />
                                  {centers.slice(0, -1).map((point, index) => {
                                    const next = centers[index + 1];
                                    const x = (point.x + next.x) / 2;
                                    const y = (point.y + next.y) / 2;
                                    const angle = Math.atan2(next.y - point.y, next.x - point.x) * 180 / Math.PI;
                                    const size = unit * .095;
                                    return <path key={`${port.portId}-arrow-${index}`} d={`M${-size * .9},${-size * .72} L${size * .95},0 L${-size * .9},${size * .72} Z`} transform={`translate(${x} ${y}) rotate(${angle})`} fill={color} stroke="rgba(255,255,255,.92)" strokeWidth={unit * .018} strokeLinejoin="round" />;
                                  })}
                                </>
                              )}
                              {first && <><circle cx={(first[0] + .5) * cellW} cy={(first[1] + .5) * cellH} r={unit * .14} fill="#fff" opacity=".92" /><circle cx={(first[0] + .5) * cellW} cy={(first[1] + .5) * cellH} r={unit * .095} fill="#16a34a" /></>}
                              {last && <><circle cx={(last[0] + .5) * cellW} cy={(last[1] + .5) * cellH} r={unit * .14} fill="#fff" opacity=".92" /><circle cx={(last[0] + .5) * cellW} cy={(last[1] + .5) * cellH} r={unit * .095} fill="#dc2626" /></>}
                            </g>
                          );
                        })}
                        {isEditingDataPath && selectedPlacedScreenId === screen.id && Array.from({ length: rows }, (_, row) =>
                          Array.from({ length: cols }, (_, col) => {
                            const key = `${col}-${row}`;
                            if (screen.screenConfig.emptyCabinetKeys.includes(key)) return null;
                            return <rect key={`hit-${key}`} className="data-path-hit" x={col * cellW} y={row * cellH} width={cellW} height={cellH} onPointerDown={(event) => drawPathPointerDown(event, screen.id, key)} onPointerEnter={(event) => drawPathPointerEnter(event, screen.id, key)} />;
                          })
                        )}
                      </svg>
                    );
                  })()}
                  {workspaceMode === 'wiring' && pathPanelMode === 'power' && screen.powerPlan && selectedPlacedScreenId === screen.id && (() => {
                    const cols = screen.screenConfig.cols;
                    const rows = screen.screenConfig.rows;
                    const overlayWidth = screen.rotation === 90 || screen.rotation === 270 ? screen.height : screen.width;
                    const overlayHeight = screen.rotation === 90 || screen.rotation === 270 ? screen.width : screen.height;
                    const screenPreset = presets.find((item) => item.id === screen.screenConfig.presetId) ?? presets[0];
                    // См. комментарий в data-path overlay выше — viewBox в нативных px кабинета.
                    const cellW = screenPreset.resolutionX;
                    const cellH = screenPreset.resolutionY;
                    const unit = Math.min(cellW, cellH);
                    const usablePowerW = usablePowerPerPortW(
                      screen.powerPlan.voltage,
                      screen.powerPlan.circuitBreakerAmps,
                      screen.powerPlan.safetyMarginPercent,
                      screen.powerPlan.powerFactor
                    );
                    return (
                      <svg
                        className={`data-path-overlay power-path-overlay${isEditingPowerPath ? ' is-editing' : ''}`}
                        onPointerUp={finishPathPointerDraw}
                        onPointerCancel={finishPathPointerDraw}
                        viewBox={`0 0 ${cols * cellW} ${rows * cellH}`}
                        style={{ left: '50%', top: '50%', width: overlayWidth, height: overlayHeight, transform: `translate(-50%, -50%) rotate(${screen.rotation}deg)`, '--cell-unit': unit } as React.CSSProperties}
                      >
                        {isEditingPowerPath && screen.powerPlan.circuits.flatMap((circuit) => circuit.assignedCabinets.map((key) => {
                          const [col, row] = key.split('-').map(Number);
                          return <rect key={`${circuit.id}-${key}`} x={col * cellW} y={row * cellH} width={cellW} height={cellH} fill="rgb(220 38 38 / .22)" />;
                        }))}
                        {screen.powerPlan.circuits.map((circuit) => {
                          const centers = circuit.assignedCabinets.map((key) => {
                            const [col, row] = key.split('-').map(Number);
                            return { x: (col + .5) * cellW, y: (row + .5) * cellH };
                          });
                          const points = centers.map((point) => `${point.x},${point.y}`).join(' ');
                          const overloaded = circuit.assignedCabinets.length * screenPreset.maxPowerW > usablePowerW;
                          const color = overloaded ? '#ef4444' : '#dc2626';
                          const first = circuit.assignedCabinets[0]?.split('-').map(Number);
                          const last = circuit.assignedCabinets.at(-1)?.split('-').map(Number);
                          return (
                            <g key={circuit.id} className={`${activePowerCircuitId && activePowerCircuitId !== circuit.id ? 'is-dimmed ' : ''}${overloaded ? 'is-overloaded' : ''}`}>
                              <title>{circuit.name}: {overloaded ? 'превышение лимита силовой нагрузки на порт' : 'силовой путь в пределах лимита'}</title>
                              {centers.length > 1 && <>
                                <polyline points={points} fill="none" stroke="rgba(255,255,255,.82)" strokeWidth={unit * .105} strokeLinecap="round" strokeLinejoin="round" />
                                <polyline points={points} fill="none" stroke={color} strokeWidth={unit * .052} strokeLinecap="round" strokeLinejoin="round" />
                                {centers.slice(0, -1).map((point, index) => {
                                  const next = centers[index + 1];
                                  const x = (point.x + next.x) / 2;
                                  const y = (point.y + next.y) / 2;
                                  const angle = Math.atan2(next.y - point.y, next.x - point.x) * 180 / Math.PI;
                                  const size = unit * .095;
                                  return <path key={`${circuit.id}-arrow-${index}`} d={`M${-size * .9},${-size * .72} L${size * .95},0 L${-size * .9},${size * .72} Z`} transform={`translate(${x} ${y}) rotate(${angle})`} fill={color} stroke="rgba(255,255,255,.92)" strokeWidth={unit * .018} strokeLinejoin="round" />;
                                })}
                              </>}
                              {first && <><circle cx={(first[0] + .5) * cellW} cy={(first[1] + .5) * cellH} r={unit * .14} fill="#fff" opacity=".92" /><circle cx={(first[0] + .5) * cellW} cy={(first[1] + .5) * cellH} r={unit * .095} fill="#16a34a" /></>}
                              {last && <><circle cx={(last[0] + .5) * cellW} cy={(last[1] + .5) * cellH} r={unit * .14} fill="#fff" opacity=".92" /><circle cx={(last[0] + .5) * cellW} cy={(last[1] + .5) * cellH} r={unit * .095} fill={color} /></>}
                              {overloaded && last && <g className="power-overload-marker" transform={`translate(${(last[0] + .82) * cellW} ${(last[1] + .18) * cellH})`}><circle r={unit * .16} fill="#facc15" stroke="#7f1d1d" strokeWidth={unit * .035} /><text y={unit * .075} textAnchor="middle">!</text></g>}
                            </g>
                          );
                        })}
                        {isEditingPowerPath && Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => {
                          const key = `${col}-${row}`;
                          if (screen.screenConfig.emptyCabinetKeys.includes(key)) return null;
                          return <rect key={`power-hit-${key}`} className="data-path-hit" x={col * cellW} y={row * cellH} width={cellW} height={cellH} onPointerDown={(event) => drawPathPointerDown(event, screen.id, key)} onPointerEnter={(event) => drawPathPointerEnter(event, screen.id, key)} />;
                        }))}
                      </svg>
                    );
                  })()}
                  <span className="screen-name-badge">{screen.name}</span>
                </div>
              ))}
              {snapGuides.x !== undefined && <div className="snap-guide is-vertical" style={{ left: snapGuides.x }} />}
              {snapGuides.y !== undefined && <div className="snap-guide is-horizontal" style={{ top: snapGuides.y }} />}
              {selectionRect && (
                <div
                  className="selection-marquee"
                  style={{
                    left: selectionRect.x,
                    top: selectionRect.y,
                    width: selectionRect.width,
                    height: selectionRect.height
                  }}
                />
              )}
              {nearestMeasurement && (
                <div className="distance-measurement" style={{ left: nearestMeasurement.x, top: nearestMeasurement.y }}>
                  {nearestMeasurement.pixels.toFixed(0)} px
                </div>
              )}
              <canvas ref={canvasRef} className="screen-render-buffer" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
