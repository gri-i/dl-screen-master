import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CabinetPreset,
  OverlayPosition,
  ScreenInstance,
  ScreenVisualSettings,
  Processor,
  PowerPlan
} from '@shared/types';
import {
  DEFAULT_PATTERN_CONFIG,
  drawPattern,
  drawCabinetGrid,
  type PatternConfig
} from '@shared/patterns';
import type { ScreenConfig } from './PowerCalculator';
import { importNovaStarSrcx } from '../novastarImport';
import { PowerPathPlanner } from './PowerPathPlanner';
import { strToU8, zipSync } from 'fflate';
import { buildCsvFiles, buildReportHtml, buildScreenSvg, type ExportScreen } from '../projectExport';

const OVERLAY_POSITION_LABELS: Record<OverlayPosition, string> = {
  'top-left': 'Сверху слева',
  'top-center': 'Сверху по центру',
  'top-right': 'Сверху справа',
  'bottom-left': 'Снизу слева',
  'bottom-center': 'Снизу по центру',
  'bottom-right': 'Снизу справа'
};

const CHECKERBOARD_COLOR_PRESETS = [
  {
    name: 'Многоцветный 25%',
    colorA: '#400000',
    colorB: '#004000',
    palette: ['#400000', '#004000', '#000040', '#004040', '#400040', '#404000']
  },
  { name: 'Зелёная схема', colorA: '#25b43a', colorB: '#454545' },
  { name: 'Красная схема', colorA: '#ef3340', colorB: '#454545' },
  { name: 'Синяя схема', colorA: '#0752ce', colorB: '#454545' },
  { name: 'Жёлтая схема', colorA: '#ffda19', colorB: '#454545' },
  { name: 'Оранжевая схема', colorA: '#ff4b26', colorB: '#454545' },
  { name: 'Бирюзовая схема', colorA: '#16a9ba', colorB: '#454545' },
  { name: 'Фиолетовая схема', colorA: '#9a6bd1', colorB: '#454545' }
] as const;

function fullBrightnessColor(color: string): string {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return color;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16));
  const peak = Math.max(...channels);
  if (peak === 0 || peak === 255) return color;
  return `#${channels.map((channel) => Math.round(channel * 255 / peak).toString(16).padStart(2, '0')).join('')}`;
}

const TEXT_COLOR_PALETTE = [
  '#ffffff', '#000000', '#ef4444', '#f59e0b', '#facc15',
  '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'
];

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
const WORKSPACE_PX_PER_MM = 0.24;

const NOVASTAR_CONTROLLERS = [
  { model: 'MX40 Pro', ports: 20, maxPixelsPerPort: 659722 },
  { model: 'MCTRL4K', ports: 16, maxPixelsPerPort: 650000 },
  { model: 'VX1000', ports: 10, maxPixelsPerPort: 650000 },
  { model: 'VX600', ports: 6, maxPixelsPerPort: 650000 },
  { model: 'VX400', ports: 4, maxPixelsPerPort: 650000 },
  { model: 'MCTRL660', ports: 4, maxPixelsPerPort: 650000 }
] as const;

function screenDisplaySize(
  preset: CabinetPreset,
  cols: number,
  rows: number,
  rotation: 0 | 90 | 180 | 270
): { width: number; height: number } {
  const width = preset.widthMm * cols * WORKSPACE_PX_PER_MM;
  const height = preset.heightMm * rows * WORKSPACE_PX_PER_MM;
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
  const [isPanningWorkspace, setIsPanningWorkspace] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [activeDataPortId, setActiveDataPortId] = useState<string | null>(null);
  const [isEditingDataPath, setIsEditingDataPath] = useState(false);
  const [activePowerCircuitId, setActivePowerCircuitId] = useState<string | null>(null);
  const [isEditingPowerPath, setIsEditingPowerPath] = useState(false);
  const [newControllerModel, setNewControllerModel] = useState<string>(NOVASTAR_CONTROLLERS[0].model);
  const [pathPanelMode, setPathPanelMode] = useState<'data' | 'power'>('data');
  const [snapGuides, setSnapGuides] = useState<{ x?: number; y?: number }>({});
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number; additive: boolean } | null>(null);
  const placedDragRef = useRef<{
    id: string; x: number; y: number; origins: Record<string, { x: number; y: number }>;
  } | null>(null);
  const workspacePanRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const historyRef = useRef<{ past: PlacedScreen[][]; future: PlacedScreen[][] }>({ past: [], future: [] });
  const [historyRevision, setHistoryRevision] = useState(0);
  const lastHandledAddScreenSignal = useRef(addScreenSignal);
  const lastHandledClearScreensSignal = useRef(clearScreensSignal);
  const nextScreenNumber = useRef(1);

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
  const displayWidthPx = widthMm * WORKSPACE_PX_PER_MM;
  const displayHeightPx = heightMm * WORKSPACE_PX_PER_MM;
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
    return nearest ? { ...nearest, millimeters: nearest.distance / WORKSPACE_PX_PER_MM } : null;
  }, [placedScreens, selectedPlacedScreenId]);

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
    nextScreenNumber.current = loaded.length + 1;
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
    ctx.shadowBlur = Math.max(3, fontSize * 0.1);
    ctx.shadowOffsetX = Math.max(1, fontSize * 0.035);
    ctx.shadowOffsetY = Math.max(1, fontSize * 0.045);

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (screenConfig.emptyCabinetKeys.includes(`${col}-${row}`)) continue;
        const sample = ctx.getImageData(
          Math.min(widthPx - 1, Math.floor((col + 0.5) * preset.resolutionX)),
          Math.min(heightPx - 1, Math.floor((row + 0.5) * preset.resolutionY)),
          1,
          1
        ).data;
        const luminance = sample[0] * 0.299 + sample[1] * 0.587 + sample[2] * 0.114;
        const isLight = luminance > 150;
        ctx.fillStyle = isLight ? '#000000' : '#ffffff';
        ctx.shadowColor = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.95)';
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

    const lineWidth = Math.max(1, Math.min(widthPx, heightPx) / 900);

    ctx.save();
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = '#00ffff';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(widthPx, heightPx);
    ctx.moveTo(0, heightPx);
    ctx.lineTo(widthPx, 0);
    ctx.stroke();

    const sideRadius = Math.min(preset.resolutionX, preset.resolutionY) * 0.98;
    const sideXLeft = preset.resolutionX;
    const sideXRight = widthPx - preset.resolutionX;
    const topY = preset.resolutionY;
    const bottomY = heightPx - preset.resolutionY;
    const circles = [
      [sideXLeft, topY, '#ff0000'],
      [sideXLeft, bottomY, '#0000ff'],
      [sideXRight, topY, '#00ff00'],
      [sideXRight, bottomY, '#ffff00'],
      [widthPx / 2, heightPx / 2, '#ffffff']
    ] as const;
    for (const [x, y, color] of circles) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, x === widthPx / 2 ? heightPx * 0.49 : sideRadius, 0, Math.PI * 2);
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
    const name = `Screen_${nextScreenNumber.current}`;
    const selectedScreen = placedScreens.find((screen) => screen.id === selectedPlacedScreenId);
    const label = !screenLabel.trim() || screenLabel === selectedScreen?.name ? name : screenLabel;
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
    nextScreenNumber.current += 1;
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
    nextScreenNumber.current = 1;
    resetVisualSettings();
  }, [clearScreensSignal]);

  useEffect(() => {
    function handleEditorShortcut(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      const isEditingText = target?.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
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
  }, [selectedScreenIds, placedScreens]);

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
    const template = NOVASTAR_CONTROLLERS.find((controller) => controller.model === newControllerModel);
    if (!template) return;
    rememberState();
    const processor: Processor = {
      id: crypto.randomUUID(),
      brand: 'NovaStar',
      model: template.model,
      ports: Array.from({ length: template.ports }, (_, index) => ({
        portId: `Port ${index + 1}`,
        controllerId: '1',
        controllerName: template.model,
        sourcePortName: String(index + 1),
        maxPixels: template.maxPixelsPerPort,
        assignedCabinets: []
      }))
    };
    setPlacedScreens((current) => current.map((screen) => screen.id === selectedPlacedScreenId
      ? { ...screen, processor }
      : screen));
    setActiveDataPortId(processor.ports[0]?.portId ?? null);
    setIsEditingDataPath(true);
  }

  function editDataPathCabinet(screenId: string, cabinetKey: string): void {
    if (!isEditingDataPath || !activeDataPortId) return;
    rememberState();
    setPlacedScreens((current) => current.map((screen) => {
      if (screen.id !== screenId || !screen.processor) return screen;
      const isOnActivePort = screen.processor.ports.find((port) => port.portId === activeDataPortId)?.assignedCabinets.includes(cabinetKey);
      return {
        ...screen,
        processor: {
          ...screen.processor,
          ports: screen.processor.ports.map((port) => ({
            ...port,
            assignedCabinets: port.assignedCabinets.filter((key) => key !== cabinetKey).concat(
              port.portId === activeDataPortId && !isOnActivePort ? [cabinetKey] : []
            )
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

  function editPowerPathCabinet(screenId: string, cabinetKey: string): void {
    if (!isEditingPowerPath || !activePowerCircuitId) return;
    const screen = placedScreens.find((item) => item.id === screenId);
    const plan = screen?.powerPlan;
    if (!plan) return;
    rememberState();
    setPlacedScreens((current) => current.map((item) => {
      if (item.id !== screenId || !item.powerPlan) return item;
      const isOnActiveCircuit = item.powerPlan.circuits
        .find((circuit) => circuit.id === activePowerCircuitId)?.assignedCabinets.includes(cabinetKey);
      return {
        ...item,
        powerPlan: {
          ...item.powerPlan,
          circuits: item.powerPlan.circuits.map((circuit) => ({
            ...circuit,
            assignedCabinets: circuit.assignedCabinets.filter((key) => key !== cabinetKey).concat(
              circuit.id === activePowerCircuitId && !isOnActiveCircuit ? [cabinetKey] : []
            )
          }))
        }
      };
    }));
  }

  function startWorkspacePan(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as HTMLElement;
    if (target.closest('.placed-screen-frame')) return;

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
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop
    };
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
    event.currentTarget.scrollLeft = panStart.scrollLeft - (event.clientX - panStart.x);
    event.currentTarget.scrollTop = panStart.scrollTop - (event.clientY - panStart.y);
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

    const bounds = pane.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    const contentX = (pane.scrollLeft + pointerX) / workspaceZoom;
    const contentY = (pane.scrollTop + pointerY) / workspaceZoom;
    const nextZoom = clampZoom(workspaceZoom * Math.exp(-event.deltaY * 0.0015));
    if (nextZoom === workspaceZoom) return;

    setWorkspaceZoom(nextZoom);
    window.requestAnimationFrame(() => {
      pane.scrollLeft = contentX * nextZoom - pointerX;
      pane.scrollTop = contentY * nextZoom - pointerY;
    });
  }

  function fitScreensInWorkspace(screens = placedScreens): void {
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
    const nativeWidth = importedPreset.resolutionX * importedConfig.cols;
    const nativeHeight = importedPreset.resolutionY * importedConfig.rows;
    const scale = Math.min(1, 2048 / nativeWidth, 2048 / nativeHeight);
    const preview = document.createElement('canvas');
    preview.width = Math.max(1, Math.round(nativeWidth * scale));
    preview.height = Math.max(1, Math.round(nativeHeight * scale));
    const context = preview.getContext('2d');
    if (!context) return '';

    drawPattern(context, preview.width, preview.height, config, {
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

  async function handleNovaStarImport(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImportStatus('Чтение NovaStar…');
    try {
      const imported = await importNovaStarSrcx(file);
      onPresetsImport(imported.presets);
      const baseY = placedScreens.reduce((bottom, screen) => Math.max(bottom, screen.y + screen.height), 0) + 80;
      let nextY = baseY;
      const screens = imported.screens.map((screen) => {
        const width = screen.config.cols * screen.preset.widthMm * WORKSPACE_PX_PER_MM;
        const height = screen.config.rows * screen.preset.heightMm * WORKSPACE_PX_PER_MM;
        const placed: PlacedScreen = {
          id: crypto.randomUUID(),
          name: screen.name,
          imageSource: renderImportedPreview(screen.config, screen.preset, screen.name),
          screenConfig: screen.config,
          visualSettings: { ...currentVisualSettings(), screenLabel: screen.name },
          width,
          height,
          x: 32,
          y: nextY,
          rotation: 0,
          processor: cloneProcessor(screen.processor)
        };
        nextY += height + 80;
        return placed;
      });
      const allScreens = [...placedScreens, ...screens];
      setPlacedScreens(allScreens);
      setSelectedPlacedScreenId(null);
      setSelectedScreenIds([]);
      window.requestAnimationFrame(() => fitScreensInWorkspace(allScreens));
      nextScreenNumber.current += screens.length;
      setImportStatus(`Импортировано экранов: ${screens.length}`);
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : 'Не удалось импортировать файл NovaStar');
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

  function exportMask(includeDataPath = false): void {
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
        const defaultName = `led-mask-${widthPx}x${heightPx}${includeDataPath ? '-data-path' : ''}.png`;
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
    return placedScreens.flatMap((screen) => {
      const screenPreset = presets.find((item) => item.id === screen.screenConfig.presetId);
      return screenPreset ? [{
        id: screen.id,
        name: screen.name,
        preset: screenPreset,
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

  function loadExportImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Не удалось прочитать изображение экрана'));
      image.src = source;
    });
  }

  function canvasPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Не удалось создать PNG'));
        return;
      }
      void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, 'image/png'));
  }

  async function buildScreenExportCanvas(screen: PlacedScreen, includeDataPath: boolean): Promise<HTMLCanvasElement> {
    const image = await loadExportImage(screen.imageSource);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось создать PNG экрана');
    context.drawImage(image, 0, 0);
    if (includeDataPath) {
      const screenPreset = presets.find((item) => item.id === screen.screenConfig.presetId);
      if (screenPreset) drawDataPathForExport(context, screen, screenPreset);
    }
    return canvas;
  }

  async function buildCombinedMapPng(includeDataPath = false): Promise<Uint8Array> {
    const minX = Math.min(...placedScreens.map((screen) => screen.x));
    const minY = Math.min(...placedScreens.map((screen) => screen.y));
    const maxX = Math.max(...placedScreens.map((screen) => screen.x + screen.width));
    const maxY = Math.max(...placedScreens.map((screen) => screen.y + screen.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(maxX - minX));
    canvas.height = Math.max(1, Math.ceil(maxY - minY));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось создать объединённую карту');
    for (const screen of placedScreens) {
      const image = await buildScreenExportCanvas(screen, includeDataPath);
      const centerX = screen.x - minX + screen.width / 2;
      const centerY = screen.y - minY + screen.height / 2;
      const rotated = screen.rotation === 90 || screen.rotation === 270;
      context.save();
      context.translate(centerX, centerY);
      context.rotate(screen.rotation * Math.PI / 180);
      context.drawImage(
        image,
        -(rotated ? screen.height : screen.width) / 2,
        -(rotated ? screen.width : screen.height) / 2,
        rotated ? screen.height : screen.width,
        rotated ? screen.width : screen.height
      );
      context.restore();
    }
    return canvasPngBytes(canvas);
  }

  async function exportProjectPackage(): Promise<void> {
    if (placedScreens.length === 0) {
      setImportStatus('Добавьте хотя бы один экран для экспорта');
      return;
    }
    setImportStatus('Подготовка пакета проекта…');
    try {
      const files: Record<string, Uint8Array> = {};
      const data = exportScreens();
      Object.entries(buildCsvFiles(data)).forEach(([name, content]) => {
        files[`tables/${name}`] = strToU8(content);
      });
      data.forEach((screen, index) => {
        files[`layouts/${String(index + 1).padStart(2, '0')}-${safeExportName(screen.name)}.svg`] =
          strToU8(buildScreenSvg(screen));
      });
      for (let index = 0; index < placedScreens.length; index += 1) {
        const screen = placedScreens[index];
        const canvas = await buildScreenExportCanvas(screen, false);
        files[`png/${String(index + 1).padStart(2, '0')}-${safeExportName(screen.name)}.png`] =
          await canvasPngBytes(canvas);
        if (screen.processor) {
          const pathCanvas = await buildScreenExportCanvas(screen, true);
          files[`png/data-path/${String(index + 1).padStart(2, '0')}-${safeExportName(screen.name)}-data-path.png`] =
            await canvasPngBytes(pathCanvas);
        }
      }
      files['png/combined-mask-map.png'] = await buildCombinedMapPng(false);
      if (placedScreens.some((screen) => screen.processor)) {
        files['png/data-path/combined-data-path-map.png'] = await buildCombinedMapPng(true);
      }
      files['report.html'] = strToU8(buildReportHtml(projectName, data));
      const archive = zipSync(files, { level: 6 });
      const filePath = await window.exportFiles.save(
        archive,
        `${safeExportName(projectName)}-export.zip`,
        'zip'
      );
      setImportStatus(filePath ? `Пакет экспортирован: ${filePath}` : 'Экспорт отменён');
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : 'Не удалось экспортировать проект');
    }
  }

  async function exportProjectPdf(): Promise<void> {
    if (placedScreens.length === 0) {
      setImportStatus('Добавьте хотя бы один экран для экспорта');
      return;
    }
    setImportStatus('Подготовка PDF-отчёта…');
    try {
      const filePath = await window.exportFiles.savePdf(
        buildReportHtml(projectName, exportScreens()),
        `${safeExportName(projectName)}-report.pdf`
      );
      setImportStatus(filePath ? `PDF экспортирован: ${filePath}` : 'Экспорт отменён');
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : 'Не удалось экспортировать PDF');
    }
  }

  const selectedDataScreen = placedScreens.find((screen) => screen.id === selectedPlacedScreenId);
  const selectedDataPreset = selectedDataScreen
    ? presets.find((item) => item.id === selectedDataScreen.screenConfig.presetId) ?? presets[0]
    : null;

  return (
    <section className={`pattern-workspace is-${workspaceMode}${importStatus ? ' has-import-status' : ''}`}>
      <div className="workspace-title">
        <div>
          <h1>{workspaceMode === 'wiring' ? 'Расключение' : 'Пиксельная маска'}</h1>
          <span>{widthPx} × {heightPx} px · {(widthMm / 1000).toFixed(2)} × {(heightMm / 1000).toFixed(2)} м</span>
        </div>
        <div className="zoom-controls" aria-label="Масштаб холста" data-history-revision={historyRevision}>
          <label className="import-srcx-button">
            Импорт .srcx
            <input type="file" accept=".srcx" onChange={handleNovaStarImport} />
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
        </div>
      </div>

      {importStatus && <div className="import-status" role="status">{importStatus}</div>}

      <div className="pattern-layout">
        <aside className="pattern-controls">
          <fieldset className="pixel-mask-control">
            <legend>Подписи и логотип</legend>
            <label>
              Подпись экрана:{' '}
              <input value={screenLabel} onChange={(e) => setScreenLabel(e.target.value)} />
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
            <br />
            <label>
              <input type="checkbox" checked={showResolution} onChange={(e) => setShowResolution(e.target.checked)} />{' '}
              Показать разрешение
            </label>
            <br />
            {showResolution && (
              <>
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
                <br />
              </>
            )}
            <label>
              Логотип:{' '}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoChange} />
            </label>
            {logoSource && (
              <>
                <br />
                <button type="button" onClick={() => { logoRef.current = null; setLogoSource(null); }}>
                  Удалить логотип
                </button>
                <br />
                <label>
                  Позиция логотипа:{' '}
                  <select value={logoPosition} onChange={(e) => setLogoPosition(e.target.value as OverlayPosition)}>
                    {Object.entries(OVERLAY_POSITION_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <br />
                <label>
                  Ширина логотипа (% экрана):{' '}
                  <input type="number" min={1} max={100} value={logoScalePercent} onChange={(e) => setLogoScalePercent(Number(e.target.value))} />
                </label>
                <br />
                <label>
                  Непрозрачность логотипа (%):{' '}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={logoOpacityPercent}
                    onChange={(e) => setLogoOpacityPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                  />
                </label>
              </>
            )}
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
          <button type="button" className="pixel-mask-control" onClick={() => exportMask(false)}>
            Экспортировать маску PNG
          </button>
          <button type="button" className="wiring-control" disabled={!selectedDataScreen?.processor} onClick={() => exportMask(true)}>
            Экспортировать PNG с путями
          </button>
          <fieldset className="project-export-panel">
            <legend>Экспорт проекта</legend>
            <button type="button" disabled={placedScreens.length === 0} onClick={() => void exportProjectPackage()}>
              ZIP: CSV + PNG + SVG
            </button>
            <button type="button" disabled={placedScreens.length === 0} onClick={() => void exportProjectPdf()}>
              PDF-отчёт
            </button>
            <p className="field-hint">
              CSV совместимы с Excel и Google Sheets. ZIP содержит pick-лист,
              питание, data-path, PNG каждого экрана и объединённые карты
              масок и расключения.
            </p>
          </fieldset>
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
                {CHECKERBOARD_COLOR_PRESETS.map((preset, index) => <option key={preset.name} value={index}>{preset.name}</option>)}
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
            <label>
              <input
                type="checkbox"
                checked={showCabinetGrid}
                onChange={(e) => setShowCabinetGrid(e.target.checked)}
              />{' '}
              Показать границы кабинетов
            </label>
            <br />
            <label>
              <input
                type="checkbox"
                checked={showCabinetNumbers}
                onChange={(e) => setShowCabinetNumbers(e.target.checked)}
              />{' '}
              Нумерация кабинетов
            </label>
            <br />
            <label>
              <input
                type="checkbox"
                checked={showTestGrid}
                onChange={(e) => setShowTestGrid(e.target.checked)}
              />{' '}
              Тестовая сетка
            </label>
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
                        {controller.model} · {controller.ports} портов
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={addNovaStarController}>Добавить и редактировать пути</button>
              </div>
            ) : (
              <>
                <strong>{selectedDataScreen.processor.brand} {selectedDataScreen.processor.model}</strong>
                <button type="button" className={isEditingDataPath ? 'is-active' : ''} onClick={toggleDataPathEditor}>
                  {isEditingDataPath ? 'Завершить редактирование трасс' : 'Редактировать трассы'}
                </button>
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
                  {selectedDataScreen.processor.ports.map((port, portIndex) => {
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
                          <b>{port.portId}</b>
                          <em className={invalid ? 'is-overloaded' : ''}>{invalid ? `Перегрузка ${loadPercent}%` : `${loadPercent}%`}</em>
                        </span>
                        <span className="data-port-stats">{port.assignedCabinets.length} каб. · {pixels.toLocaleString()} / {port.maxPixels.toLocaleString()} px</span>
                        <span className="data-port-meter" aria-label={`Загрузка ${loadPercent}%`}>
                          <i className={invalid ? 'is-overloaded' : ''} style={{ width: `${Math.min(loadPercent, 100)}%` }} />
                        </span>
                      </button>
                    );
                  })}
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
                <div className="data-cabinet-grid" style={{ gridTemplateColumns: `repeat(${selectedDataScreen.screenConfig.cols}, 1fr)` }}>
                  {Array.from({ length: selectedDataScreen.screenConfig.rows }, (_, row) =>
                    Array.from({ length: selectedDataScreen.screenConfig.cols }, (_, col) => {
                      const key = `${col}-${row}`;
                      if (selectedDataScreen.screenConfig.emptyCabinetKeys.includes(key)) return <span key={key} className="is-empty" />;
                      const portIndex = selectedDataScreen.processor?.ports.findIndex((port) => port.assignedCabinets.includes(key)) ?? -1;
                      const port = portIndex >= 0 ? selectedDataScreen.processor?.ports[portIndex] : undefined;
                      const order = port?.assignedCabinets.indexOf(key) ?? -1;
                      return <span key={key} className={activeDataPortId && port?.portId !== activeDataPortId ? 'is-dimmed' : ''} title={port ? `${port.portId}, кабинет ${order + 1}` : 'Не назначен'} style={portIndex >= 0 ? { background: `hsl(${portIndex * 83} 70% 38%)` } : undefined}>{order >= 0 ? order + 1 : '—'}</span>;
                    })
                  )}
                </div>
              </>
            )}
          </fieldset>}

          {pathPanelMode === 'power' && selectedDataScreen && selectedDataPreset && (
            <div className="wiring-control">
              <PowerPathPlanner
                plan={selectedDataScreen.powerPlan}
                screenConfig={selectedDataScreen.screenConfig}
                preset={selectedDataPreset}
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
          onPointerDown={startWorkspacePan}
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
                transform: `scale(${workspaceZoom})`
              }}
            >
              {placedScreens.map((screen) => (
                <div
                  key={screen.id}
                  className={`placed-screen-frame${selectedScreenIds.includes(screen.id) ? ' is-selected' : ''}${isEditingScreen ? ' is-editing' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Выбрать ${screen.name}`}
                  aria-pressed={selectedScreenIds.includes(screen.id)}
                  onContextMenu={(event) => toggleCabinetInScreen(event, screen)}
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
                  {pathPanelMode === 'data' && screen.processor && selectedPlacedScreenId === screen.id && (() => {
                    const cols = screen.screenConfig.cols;
                    const rows = screen.screenConfig.rows;
                    const overlayWidth = screen.rotation === 90 || screen.rotation === 270 ? screen.height : screen.width;
                    const overlayHeight = screen.rotation === 90 || screen.rotation === 270 ? screen.width : screen.height;
                    return (
                      <svg
                        className={`data-path-overlay${isEditingDataPath && selectedPlacedScreenId === screen.id ? ' is-editing' : ''}`}
                        viewBox={`0 0 ${cols} ${rows}`}
                        style={{
                          left: '50%',
                          top: '50%',
                          width: overlayWidth,
                          height: overlayHeight,
                          transform: `translate(-50%, -50%) rotate(${screen.rotation}deg)`
                        }}
                      >
                        {isEditingDataPath && screen.processor.ports.flatMap((port, portIndex) => port.assignedCabinets.map((key) => {
                          const [col, row] = key.split('-').map(Number);
                          return <rect key={`${port.portId}-${key}`} x={col} y={row} width="1" height="1" fill={`hsl(${portIndex * 83} 75% 55% / .24)`} />;
                        }))}
                        {screen.processor.ports.map((port, portIndex) => {
                          const centers = port.assignedCabinets.map((key) => {
                            const [col, row] = key.split('-').map(Number);
                            return { x: col + .5, y: row + .5 };
                          });
                          const points = centers.map((point) => `${point.x},${point.y}`).join(' ');
                          const first = port.assignedCabinets[0]?.split('-').map(Number);
                          const last = port.assignedCabinets.at(-1)?.split('-').map(Number);
                          const screenPreset = presets.find((item) => item.id === screen.screenConfig.presetId) ?? presets[0];
                          const portPixels = port.assignedCabinets.length * screenPreset.resolutionX * screenPreset.resolutionY;
                          const overloaded = portPixels > port.maxPixels || (port.maxCabinets !== undefined && port.assignedCabinets.length > port.maxCabinets);
                          const color = overloaded ? '#dc2626' : `hsl(${portIndex * 83} 78% 38%)`;
                          return (
                            <g key={port.portId} className={selectedPlacedScreenId === screen.id && activeDataPortId && activeDataPortId !== port.portId ? 'is-dimmed' : ''}>
                              {port.assignedCabinets.length > 1 && (
                                <>
                                  <polyline points={points} fill="none" stroke="rgba(255,255,255,.82)" strokeWidth=".105" strokeLinecap="round" strokeLinejoin="round" />
                                  <polyline points={points} fill="none" stroke={color} strokeWidth=".052" strokeLinecap="round" strokeLinejoin="round" />
                                  {centers.slice(0, -1).map((point, index) => {
                                    const next = centers[index + 1];
                                    const x = (point.x + next.x) / 2;
                                    const y = (point.y + next.y) / 2;
                                    const angle = Math.atan2(next.y - point.y, next.x - point.x) * 180 / Math.PI;
                                    return <path key={`${port.portId}-arrow-${index}`} d="M-.085,-.065 L.09,0 L-.085,.065 Z" transform={`translate(${x} ${y}) rotate(${angle})`} fill={color} stroke="rgba(255,255,255,.92)" strokeWidth=".018" strokeLinejoin="round" />;
                                  })}
                                </>
                              )}
                              {first && <><circle cx={first[0] + .5} cy={first[1] + .5} r=".14" fill="#fff" opacity=".92" /><circle cx={first[0] + .5} cy={first[1] + .5} r=".095" fill="#16a34a" /></>}
                              {last && <><circle cx={last[0] + .5} cy={last[1] + .5} r=".14" fill="#fff" opacity=".92" /><circle cx={last[0] + .5} cy={last[1] + .5} r=".095" fill="#dc2626" /></>}
                            </g>
                          );
                        })}
                        {isEditingDataPath && selectedPlacedScreenId === screen.id && Array.from({ length: rows }, (_, row) =>
                          Array.from({ length: cols }, (_, col) => {
                            const key = `${col}-${row}`;
                            if (screen.screenConfig.emptyCabinetKeys.includes(key)) return null;
                            return <rect key={`hit-${key}`} className="data-path-hit" x={col} y={row} width="1" height="1" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); editDataPathCabinet(screen.id, key); }} />;
                          })
                        )}
                      </svg>
                    );
                  })()}
                  {pathPanelMode === 'power' && screen.powerPlan && selectedPlacedScreenId === screen.id && (() => {
                    const cols = screen.screenConfig.cols;
                    const rows = screen.screenConfig.rows;
                    const overlayWidth = screen.rotation === 90 || screen.rotation === 270 ? screen.height : screen.width;
                    const overlayHeight = screen.rotation === 90 || screen.rotation === 270 ? screen.width : screen.height;
                    const screenPreset = presets.find((item) => item.id === screen.screenConfig.presetId) ?? presets[0];
                    const cabinetAmps = screenPreset.maxPowerW / Math.max(1, screen.powerPlan.voltage * screen.powerPlan.powerFactor);
                    const usableAmps = screen.powerPlan.circuitBreakerAmps * (1 - screen.powerPlan.safetyMarginPercent / 100);
                    return (
                      <svg
                        className={`data-path-overlay power-path-overlay${isEditingPowerPath ? ' is-editing' : ''}`}
                        viewBox={`0 0 ${cols} ${rows}`}
                        style={{ left: '50%', top: '50%', width: overlayWidth, height: overlayHeight, transform: `translate(-50%, -50%) rotate(${screen.rotation}deg)` }}
                      >
                        {isEditingPowerPath && screen.powerPlan.circuits.flatMap((circuit, circuitIndex) => circuit.assignedCabinets.map((key) => {
                          const [col, row] = key.split('-').map(Number);
                          return <rect key={`${circuit.id}-${key}`} x={col} y={row} width="1" height="1" fill={`hsl(${circuitIndex * 71} 75% 55% / .22)`} />;
                        }))}
                        {screen.powerPlan.circuits.map((circuit, circuitIndex) => {
                          const centers = circuit.assignedCabinets.map((key) => {
                            const [col, row] = key.split('-').map(Number);
                            return { x: col + .5, y: row + .5 };
                          });
                          const points = centers.map((point) => `${point.x},${point.y}`).join(' ');
                          const overloaded = circuit.assignedCabinets.length * cabinetAmps > usableAmps;
                          const color = overloaded ? '#ef4444' : `hsl(${circuitIndex * 71} 85% 58%)`;
                          return (
                            <g key={circuit.id} className={activePowerCircuitId && activePowerCircuitId !== circuit.id ? 'is-dimmed' : ''}>
                              {centers.length > 1 && <polyline points={points} fill="none" stroke={color} strokeWidth=".07" strokeDasharray=".18 .12" strokeLinecap="round" strokeLinejoin="round" />}
                              {centers.map((point, index) => (
                                <g key={`${circuit.id}-${index}`}>
                                  <circle cx={point.x} cy={point.y} r=".15" fill="#101820" stroke={color} strokeWidth=".045" />
                                  <text x={point.x} y={point.y + .045} textAnchor="middle" fill="#fff" fontSize=".16" fontWeight="800">{index + 1}</text>
                                </g>
                              ))}
                            </g>
                          );
                        })}
                        {isEditingPowerPath && Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => {
                          const key = `${col}-${row}`;
                          if (screen.screenConfig.emptyCabinetKeys.includes(key)) return null;
                          return <rect key={`power-hit-${key}`} className="data-path-hit" x={col} y={row} width="1" height="1" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); editPowerPathCabinet(screen.id, key); }} />;
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
                  {nearestMeasurement.millimeters.toFixed(0)} мм
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
