import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { OverlayPosition } from '@shared/types';

type PixelPatternSettings = {
  name: string;
  columns: number;
  rows: number;
  displayWidth: number;
  displayHeight: number;
  overlapX: number;
  overlapY: number;
  gridDensity: 'wide' | 'medium' | 'fine';
  lineWidth: number;
  background: string;
  gridColor: string;
  accentColor: string;
  textColor: string;
  showCircles: boolean;
  showLabels: boolean;
  showBorder: boolean;
  logoPosition: OverlayPosition;
  logoScalePercent: number;
  logoOpacityPercent: number;
};

const DEFAULT_SETTINGS: PixelPatternSettings = {
  name: 'Pixel Pattern',
  columns: 2,
  rows: 1,
  displayWidth: 1920,
  displayHeight: 1080,
  overlapX: 160,
  overlapY: 0,
  gridDensity: 'wide',
  lineWidth: 2,
  background: '#101318',
  gridColor: '#596773',
  accentColor: '#28c6e6',
  textColor: '#ffffff',
  showCircles: true,
  showLabels: true,
  showBorder: true,
  logoPosition: 'bottom-left',
  logoScalePercent: 20,
  logoOpacityPercent: 100
};

const LOGO_POSITION_LABELS: Record<OverlayPosition, string> = {
  'top-left': 'Сверху слева',
  'top-center': 'Сверху по центру',
  'top-right': 'Сверху справа',
  'bottom-left': 'Снизу слева',
  'bottom-center': 'Снизу по центру',
  'bottom-right': 'Снизу справа'
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function alphabeticIndex(value: number): string {
  let current = Math.max(1, Math.floor(value));
  let result = '';
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + current % 26) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

function computePatternSize(settings: PixelPatternSettings): { patternWidth: number; patternHeight: number } {
  const rawWidth = settings.columns * settings.displayWidth - (settings.columns - 1) * settings.overlapX;
  const rawHeight = settings.rows * settings.displayHeight - (settings.rows - 1) * settings.overlapY;
  return { patternWidth: Math.max(1, rawWidth), patternHeight: Math.max(1, rawHeight) };
}

function drawPixelPattern(
  canvas: HTMLCanvasElement,
  settings: PixelPatternSettings,
  renderWidth: number,
  renderHeight: number,
  logo: HTMLImageElement | null = null
): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const { patternWidth, patternHeight } = computePatternSize(settings);
  const gridRows = settings.gridDensity === 'wide' ? 8 : settings.gridDensity === 'medium' ? 12 : 16;
  const gridSize = patternHeight / gridRows;
  const scaleX = renderWidth / patternWidth;
  const scaleY = renderHeight / patternHeight;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (renderWidth - patternWidth * scale) / 2;
  const offsetY = (renderHeight - patternHeight * scale) / 2;
  const x = (value: number): number => offsetX + value * scale;
  const y = (value: number): number => offsetY + value * scale;

  canvas.width = renderWidth;
  canvas.height = renderHeight;
  context.fillStyle = '#070a0d';
  context.fillRect(0, 0, renderWidth, renderHeight);
  context.fillStyle = settings.background;
  context.fillRect(offsetX, offsetY, patternWidth * scale, patternHeight * scale);

  context.strokeStyle = settings.gridColor;
  context.lineWidth = Math.max(1, settings.lineWidth * scale);
  context.globalAlpha = .72;
  const gridOriginX = patternWidth / 2;
  const gridOriginY = patternHeight / 2;
  const firstGridColumn = Math.floor(-gridOriginX / gridSize);
  const lastGridColumn = Math.ceil((patternWidth - gridOriginX) / gridSize);
  const firstGridRow = Math.floor(-gridOriginY / gridSize);
  const lastGridRow = Math.ceil((patternHeight - gridOriginY) / gridSize);
  for (let index = firstGridColumn; index <= lastGridColumn; index += 1) {
    const gx = gridOriginX + index * gridSize;
    context.beginPath();
    context.lineWidth = Math.max(1, settings.lineWidth * scale);
    context.moveTo(x(gx), y(0));
    context.lineTo(x(gx), y(patternHeight));
    context.stroke();
  }
  for (let index = firstGridRow; index <= lastGridRow; index += 1) {
    const gy = gridOriginY + index * gridSize;
    context.beginPath();
    context.lineWidth = Math.max(1, settings.lineWidth * scale);
    context.moveTo(x(0), y(gy));
    context.lineTo(x(patternWidth), y(gy));
    context.stroke();
  }
  context.globalAlpha = 1;

  const circleRadius = patternHeight / 2;
  const firstMajorColumn = Math.floor(-gridOriginX / circleRadius);
  const lastMajorColumn = Math.ceil((patternWidth - gridOriginX) / circleRadius);
  const firstMajorRow = Math.floor(-gridOriginY / circleRadius);
  const lastMajorRow = Math.ceil((patternHeight - gridOriginY) / circleRadius);
  context.strokeStyle = settings.gridColor;
  context.lineWidth = Math.max(2, settings.lineWidth * 2.2 * scale);
  context.globalAlpha = 1;
  for (let index = firstMajorColumn; index <= lastMajorColumn; index += 1) {
    const gx = gridOriginX + index * circleRadius;
    context.beginPath();
    context.moveTo(x(gx), y(0));
    context.lineTo(x(gx), y(patternHeight));
    context.stroke();
  }
  for (let index = firstMajorRow; index <= lastMajorRow; index += 1) {
    const gy = gridOriginY + index * circleRadius;
    context.beginPath();
    context.moveTo(x(0), y(gy));
    context.lineTo(x(patternWidth), y(gy));
    context.stroke();
  }

  context.fillStyle = settings.accentColor;
  context.globalAlpha = .13;
  for (let column = 1; column < settings.columns; column += 1) {
    const overlapStart = column * (settings.displayWidth - settings.overlapX);
    context.fillRect(x(overlapStart), y(0), settings.overlapX * scale, patternHeight * scale);
  }
  for (let row = 1; row < settings.rows; row += 1) {
    const overlapStart = row * (settings.displayHeight - settings.overlapY);
    context.fillRect(x(0), y(overlapStart), patternWidth * scale, settings.overlapY * scale);
  }
  context.globalAlpha = 1;

  for (let row = 0; row < settings.rows; row += 1) {
    for (let column = 0; column < settings.columns; column += 1) {
      const displayX = column * (settings.displayWidth - settings.overlapX);
      const displayY = row * (settings.displayHeight - settings.overlapY);
      const displayW = settings.displayWidth;
      const displayH = settings.displayHeight;

      context.strokeStyle = settings.accentColor;
      context.lineWidth = Math.max(1.5, 3 * scale);
      context.globalAlpha = .42;
      context.strokeRect(x(displayX), y(displayY), displayW * scale, displayH * scale);
      context.globalAlpha = 1;

    }
  }

  if (settings.showCircles) {
    const radius = circleRadius;
    const diameter = radius * 2;
    const originX = patternWidth / 2;
    const originY = patternHeight / 2;
    const minColumn = Math.floor((-radius - originX) / diameter);
    const maxColumn = Math.ceil((patternWidth + radius - originX) / diameter);
    const minRow = Math.floor((-radius - originY) / diameter);
    const maxRow = Math.ceil((patternHeight + radius - originY) / diameter);
    context.strokeStyle = settings.accentColor;
    context.lineWidth = Math.max(1.5, settings.lineWidth * 1.6 * scale);
    context.globalAlpha = .72;
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const centerX = originX + column * diameter;
        const centerY = originY + row * diameter;
        context.beginPath();
        context.arc(x(centerX), y(centerY), radius * scale, 0, Math.PI * 2);
        context.stroke();
      }
    }
    context.globalAlpha = 1;
  }

  if (settings.showLabels) {
    const coordinateFontSize = clamp(Math.round(gridSize * scale * .216), 8, 22);
    const edgeInset = Math.max(5, coordinateFontSize * .55);
    context.font = `600 ${coordinateFontSize}px Inter, sans-serif`;
    context.fillStyle = settings.textColor;
    context.globalAlpha = .52;
    context.shadowBlur = 0;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    for (let index = firstGridColumn; index < lastGridColumn; index += 1) {
      const cellCenterX = gridOriginX + (index + .5) * gridSize;
      if (cellCenterX < 0 || cellCenterX > patternWidth) continue;
      const label = index >= 0 ? String(index + 1) : String(index);
      context.fillText(label, x(cellCenterX), y(0) + edgeInset);
      context.fillText(label, x(cellCenterX), y(patternHeight) - edgeInset);
    }

    context.textAlign = 'left';
    for (let index = firstGridRow; index < lastGridRow; index += 1) {
      const cellCenterY = gridOriginY + (index + .5) * gridSize;
      if (cellCenterY < 0 || cellCenterY > patternHeight) continue;
      const distanceFromCenter = index >= 0 ? index + 1 : Math.abs(index);
      const label = index >= 0
        ? alphabeticIndex(distanceFromCenter).toLowerCase()
        : alphabeticIndex(distanceFromCenter);
      context.fillText(label, x(0) + edgeInset, y(cellCenterY));
      context.textAlign = 'right';
      context.fillText(label, x(patternWidth) - edgeInset, y(cellCenterY));
      context.textAlign = 'left';
    }
    context.globalAlpha = 1;
  }

  if (settings.showBorder) {
    context.strokeStyle = settings.textColor;
    context.lineWidth = Math.max(1, 3 * scale);
    context.strokeRect(offsetX, offsetY, patternWidth * scale, patternHeight * scale);
  }

  if (settings.showLabels) {
    const titleSize = clamp(Math.round(50 * scale), 16, 50);
    const infoSize = clamp(Math.round(29 * scale), 11, 29);
    const squaresX = Math.max(1, Math.floor(patternWidth / gridSize));
    const squaresY = gridRows;
    const centerX = x(patternWidth / 2);
    const centerY = y(patternHeight / 2);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = 'rgba(0,0,0,.9)';
    context.shadowBlur = Math.max(2, 7 * scale);
    context.fillStyle = settings.textColor;
    context.font = `700 ${titleSize}px Inter, sans-serif`;
    context.fillText(settings.name, centerX, centerY - infoSize * 2.1);
    context.font = `500 ${infoSize}px Inter, sans-serif`;
    context.globalAlpha = .82;
    context.fillText(`${patternWidth} × ${patternHeight} px`, centerX, centerY - infoSize * .45);
    context.fillText(`${squaresX} × ${squaresY} = ${squaresX * squaresY} squares`, centerX, centerY + infoSize * .9);
    context.fillText(`Ratio: ${(patternWidth / patternHeight).toFixed(2)} : 1`, centerX, centerY + infoSize * 2.25);
    context.globalAlpha = 1;
    context.shadowBlur = 0;
  }

  if (logo) {
    const logoWidth = patternWidth * (settings.logoScalePercent / 100) * scale;
    const logoHeight = logoWidth * (logo.naturalHeight / logo.naturalWidth);
    const padding = Math.max(8, 24 * scale);
    const logoX = settings.logoPosition.endsWith('left')
      ? x(0) + padding
      : settings.logoPosition.endsWith('right')
        ? x(patternWidth) - logoWidth - padding
        : x(patternWidth / 2) - logoWidth / 2;
    const logoY = settings.logoPosition.startsWith('top')
      ? y(0) + padding
      : y(patternHeight) - logoHeight - padding;
    context.save();
    context.globalAlpha = settings.logoOpacityPercent / 100;
    context.drawImage(logo, logoX, logoY, logoWidth, logoHeight);
    context.restore();
  }
}

export function ProjectionMaskSection(): JSX.Element {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [logoName, setLogoName] = useState('');
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const { patternWidth, patternHeight } = computePatternSize(settings);
  const gridRows = settings.gridDensity === 'wide' ? 8 : settings.gridDensity === 'medium' ? 12 : 16;
  const calculatedGridSize = patternHeight / gridRows;
  const aspectRatio = useMemo(() => `${patternWidth} / ${patternHeight}`, [patternWidth, patternHeight]);

  function update<K extends keyof PixelPatternSettings>(key: K, value: PixelPatternSettings[K]): void {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      if (key === 'displayWidth') {
        next.overlapX = clamp(next.overlapX, 0, Math.max(0, next.displayWidth - 1));
      }
      if (key === 'displayHeight') {
        next.overlapY = clamp(next.overlapY, 0, Math.max(0, next.displayHeight - 1));
      }
      return next;
    });
  }

  function numberFieldHandlers<K extends keyof PixelPatternSettings>(key: K, min: number, max: number) {
    return {
      onChange: (event: React.ChangeEvent<HTMLInputElement>): void => {
        const raw = event.target.value;
        if (raw.trim() === '') return;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return;
        update(key, Math.min(max, parsed) as PixelPatternSettings[K]);
      },
      onBlur: (event: React.FocusEvent<HTMLInputElement>): void => {
        const parsed = Number(event.target.value);
        update(key, clamp(Number.isFinite(parsed) ? parsed : min, min, max) as PixelPatternSettings[K]);
      }
    };
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const redraw = (): void => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      drawPixelPattern(canvas, settings, Math.max(320, Math.round(bounds.width * ratio)), Math.max(180, Math.round(bounds.height * ratio)), logo);
    };
    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [settings, logo]);

  function loadLogo(file: File | undefined): void {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const image = new Image();
      image.onload = () => {
        setLogo(image);
        setLogoName(file.name);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function handlePreviewWheel(event: React.WheelEvent<HTMLDivElement>): void {
    event.preventDefault();
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const previousZoom = zoom;
    const nextZoom = clamp(previousZoom * (event.deltaY < 0 ? 1.12 : .88), .25, 4);
    if (nextZoom === previousZoom) return;
    const bounds = wrap.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left + wrap.scrollLeft;
    const pointerY = event.clientY - bounds.top + wrap.scrollTop;
    const ratio = nextZoom / previousZoom;
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      wrap.scrollLeft = pointerX * ratio - (event.clientX - bounds.left);
      wrap.scrollTop = pointerY * ratio - (event.clientY - bounds.top);
    });
  }

  function startPanning(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: wrap.scrollLeft,
      scrollTop: wrap.scrollTop
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePanning(event: React.PointerEvent<HTMLDivElement>): void {
    if (!isPanning) return;
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    wrap.scrollLeft = panStartRef.current.scrollLeft - (event.clientX - panStartRef.current.x);
    wrap.scrollTop = panStartRef.current.scrollTop - (event.clientY - panStartRef.current.y);
  }

  function stopPanning(event: React.PointerEvent<HTMLDivElement>): void {
    if (!isPanning) return;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function exportPattern(): Promise<void> {
    const canvas = document.createElement('canvas');
    drawPixelPattern(canvas, settings, patternWidth, patternHeight, logo);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const safeName = settings.name.trim().replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '-') || 'pixel-pattern';
    await window.imageFiles.savePng(bytes, `${safeName}-${patternWidth}x${patternHeight}.png`);
  }

  async function exportPdf(): Promise<void> {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    setExportStatus('Подготовка PDF…');
    try {
      if (patternWidth <= 0 || patternHeight <= 0 || settings.overlapX >= settings.displayWidth || settings.overlapY >= settings.displayHeight) {
        throw new Error('Перекрытие должно быть меньше разрешения проектора.');
      }
      const escape = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 3200 / Math.max(patternWidth, patternHeight));
      drawPixelPattern(canvas, settings, Math.max(1, Math.round(patternWidth * scale)), Math.max(1, Math.round(patternHeight * scale)), logo);
      const mask = canvas.toDataURL('image/png');
      if (!mask.startsWith('data:image/png;base64,')) throw new Error('Не удалось создать маску для PDF.');
      const projectors = Array.from({ length: settings.rows }, (_, row) =>
        Array.from({ length: settings.columns }, (_, column) => `<tr><td>P${row * settings.columns + column + 1}</td><td>${row + 1}</td><td>${column + 1}</td><td>${settings.displayWidth} × ${settings.displayHeight}</td><td>${column * (settings.displayWidth - settings.overlapX)}</td><td>${row * (settings.displayHeight - settings.overlapY)}</td></tr>`).join('')
      ).join('');
      const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
        @page{size:A4 landscape;margin:14mm}body{font-family:Arial,sans-serif;color:#17212b}h1{font-size:22px;overflow-wrap:anywhere}h2{font-size:18px}
        .mask{width:100%;height:125mm;object-fit:contain}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #aab4bd;padding:6px;text-align:left}th{background:#e7f7fb}thead{display:table-header-group}tr{break-inside:avoid}.page{break-before:page}
        </style></head><body><h1>${escape(settings.name)} · Проекционная маска</h1><img class="mask" src="${mask}" alt="Проекционная маска"/>
        <table><tbody><tr><th>Общее разрешение с учётом перекрытий, px</th><td>${patternWidth} × ${patternHeight}</td></tr>
        <tr><th>Разрешение каждого проектора, px</th><td>${settings.displayWidth} × ${settings.displayHeight}</td></tr>
        <tr><th>Раскладка / количество проекторов</th><td>${settings.columns} × ${settings.rows} / ${settings.columns * settings.rows}</td></tr>
        <tr><th>Перекрытие соседних проекторов X / Y, px</th><td>${settings.columns > 1 ? settings.overlapX : 0} / ${settings.rows > 1 ? settings.overlapY : 0}</td></tr></tbody></table>
        <section class="page"><h2>Проекторы · ${escape(settings.name)}</h2><p>Нумерация слева направо, сверху вниз. X и Y — начало изображения проектора в общей маске, в пикселях от левого верхнего угла.</p>
        <table><thead><tr><th>Проектор</th><th>Ряд</th><th>Колонка</th><th>Разрешение, px</th><th>X, px</th><th>Y, px</th></tr></thead><tbody>${projectors}</tbody></table></section></body></html>`;
      const safeName = settings.name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/\s+/g, '-').slice(0, 100) || 'projection-pattern';
      const filePath = await window.exportFiles.savePdf(html, `${safeName}-${patternWidth}x${patternHeight}.pdf`);
      setExportStatus(filePath ? `PDF экспортирован: ${filePath}` : 'Экспорт отменён');
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : 'Не удалось экспортировать PDF');
    } finally {
      setIsExportingPdf(false);
    }
  }

  return (
    <section className="projection-section pixel-pattern-section">
      <header>
        <div>
          <h1>Проекционные паттерны</h1>
          <p>Pixel Pattern для юстировки многопроекторных инсталляций.</p>
        </div>
        <div className="projection-header-actions">
          <span>{patternWidth} × {patternHeight} px</span>
          <button type="button" onClick={() => setSettings(DEFAULT_SETTINGS)}>Сбросить</button>
          <button className="primary-button" type="button" onClick={() => void exportPattern()}>Скачать PNG</button>
          <button type="button" disabled={isExportingPdf} onClick={() => void exportPdf()}>Экспорт PDF</button>
        </div>
      </header>
      {exportStatus && <p role="status">{exportStatus}</p>}

      <div className="pixel-pattern-layout">
        <aside className="pixel-pattern-controls">
          <label className="wide-field">Название<input value={settings.name} onChange={(event) => update('name', event.target.value)} /></label>
          <div className="projection-logo-control">
            <label className="projection-logo-button">
              {logo ? 'Заменить логотип' : 'Загрузить логотип'}
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => loadLogo(event.target.files?.[0])} />
            </label>
            {logo && <button type="button" title={logoName} onClick={() => { setLogo(null); setLogoName(''); }}>Удалить</button>}
            <span>{logoName || 'PNG, JPG или WebP'}</span>
          </div>
          {logo && (
            <fieldset className="projection-logo-settings">
              <legend>Настройки логотипа</legend>
              <label>Позиция
                <select value={settings.logoPosition} onChange={(event) => update('logoPosition', event.target.value as OverlayPosition)}>
                  {Object.entries(LOGO_POSITION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Ширина, %<input type="number" min={1} max={100} value={settings.logoScalePercent} onChange={(event) => update('logoScalePercent', clamp(Number(event.target.value), 1, 100))} /></label>
              <label>Непрозрачность, %<input type="number" min={0} max={100} value={settings.logoOpacityPercent} onChange={(event) => update('logoOpacityPercent', clamp(Number(event.target.value), 0, 100))} /></label>
            </fieldset>
          )}

          <fieldset>
            <legend>Сетка дисплеев</legend>
            <div className="compact-field-grid">
              <label>По горизонтали<input type="number" min={1} max={12} value={settings.columns} {...numberFieldHandlers('columns', 1, 12)} /></label>
              <label>По вертикали<input type="number" min={1} max={12} value={settings.rows} {...numberFieldHandlers('rows', 1, 12)} /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Разрешение дисплея</legend>
            <div className="compact-field-grid">
              <label>Ширина, px<input type="number" min={64} max={8192} value={settings.displayWidth} {...numberFieldHandlers('displayWidth', 64, 8192)} /></label>
              <label>Высота, px<input type="number" min={64} max={8192} value={settings.displayHeight} {...numberFieldHandlers('displayHeight', 64, 8192)} /></label>
              <label>Overlap X<input type="number" min={0} max={settings.displayWidth - 1} value={settings.overlapX} {...numberFieldHandlers('overlapX', 0, settings.displayWidth - 1)} /></label>
              <label>Overlap Y<input type="number" min={0} max={settings.displayHeight - 1} value={settings.overlapY} {...numberFieldHandlers('overlapY', 0, settings.displayHeight - 1)} /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Настройки сетки</legend>
            <strong className="projection-control-title">Плотность сетки</strong>
            <div className="grid-density-options">
              {([
                ['Wide', 'wide'],
                ['Medium', 'medium'],
                ['Fine', 'fine']
              ] as const).map(([label, size]) => (
                <button
                  key={label}
                  type="button"
                  className={settings.gridDensity === size ? 'is-active' : ''}
                  onClick={() => update('gridDensity', size)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="projection-grid-metrics">
              Шаг: <b>{calculatedGridSize.toFixed(1)} px</b> · круг: <b>{patternHeight.toFixed(0)} px</b>
            </p>
            <label className="projection-range-control">
              <span>Толщина линий <b>{settings.lineWidth}px</b></span>
              <input type="range" min={1} max={10} step={1} value={settings.lineWidth} onChange={(event) => update('lineWidth', Number(event.target.value))} />
            </label>
            <div className="projection-grid-divider" />
            <strong className="projection-control-title">Цвета</strong>
            <div className="projection-color-list">
              <label><span>Фон</span><input type="color" value={settings.background} onChange={(event) => update('background', event.target.value)} /></label>
              <label><span>Сетка</span><input type="color" value={settings.gridColor} onChange={(event) => update('gridColor', event.target.value)} /></label>
              <label><span>Окружности</span><input type="color" value={settings.accentColor} onChange={(event) => update('accentColor', event.target.value)} /></label>
              <label><span>Текст</span><input type="color" value={settings.textColor} onChange={(event) => update('textColor', event.target.value)} /></label>
            </div>
            <div className="projection-grid-divider" />
            <div className="projection-switch-list">
              <label><span>Показывать окружности</span><button type="button" className={settings.showCircles ? 'is-on' : ''} onClick={() => update('showCircles', !settings.showCircles)}>{settings.showCircles ? 'On' : 'Off'}</button></label>
              <label><span>Информация</span><button type="button" className={settings.showLabels ? 'is-on' : ''} onClick={() => update('showLabels', !settings.showLabels)}>{settings.showLabels ? 'On' : 'Off'}</button></label>
              <label><span>Рамка</span><button type="button" className={settings.showBorder ? 'is-on' : ''} onClick={() => update('showBorder', !settings.showBorder)}>{settings.showBorder ? 'On' : 'Off'}</button></label>
            </div>
          </fieldset>
        </aside>

        <div className="pixel-pattern-workspace">
          <div className="pixel-pattern-toolbar">
            <div><strong>Итоговый паттерн</strong><span>{settings.columns}×{settings.rows} дисплеев · overlap {settings.overlapX}×{settings.overlapY} px</span></div>
            <div className="projection-zoom-controls">
              <button type="button" onClick={() => setZoom((value) => clamp(value / 1.2, .25, 4))}>−</button>
              <button type="button" onClick={() => setZoom((value) => clamp(value * 1.2, .25, 4))}>+</button>
              <span className="pattern-resolution-badge">{patternWidth} × {patternHeight}</span>
            </div>
          </div>
          <div
            ref={canvasWrapRef}
            className={`pixel-pattern-canvas-wrap${isPanning ? ' is-panning' : ''}`}
            onWheel={handlePreviewWheel}
            onPointerDown={startPanning}
            onPointerMove={movePanning}
            onPointerUp={stopPanning}
            onPointerCancel={stopPanning}
          >
            <canvas ref={canvasRef} className="pixel-pattern-canvas" style={{ aspectRatio, width: `${zoom * 100}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}
