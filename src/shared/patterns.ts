/** Шахматный тестовый паттерн для LED-экрана. */

export type PatternType = 'checkerboard';

export interface PatternConfig {
  type: PatternType;
  cellSizePx: number;
  colorA: string;
  colorB: string;
  palette?: string[];
}

export interface PatternDrawOptions {
  checkerCellWidthPx?: number;
  checkerCellHeightPx?: number;
}

export const DEFAULT_PATTERN_CONFIG: PatternConfig = {
  type: 'checkerboard',
  cellSizePx: 32,
  colorA: '#ffffff',
  colorB: '#30343b'
};

/**
 * Рисует паттерн на переданном 2D-контексте канваса, заполняя область
 * widthPx × heightPx (реальное пиксельное разрешение экрана).
 */
export function drawPattern(
  ctx: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  config: PatternConfig,
  options: PatternDrawOptions = {}
): void {
  const cellWidth = Math.max(1, options.checkerCellWidthPx ?? config.cellSizePx);
  const cellHeight = Math.max(1, options.checkerCellHeightPx ?? config.cellSizePx);
  for (let y = 0; y < heightPx; y += cellHeight) {
    for (let x = 0; x < widthPx; x += cellWidth) {
      const palette = config.palette && config.palette.length > 1
        ? config.palette
        : [config.colorA, config.colorB];
      const colorIndex = (Math.floor(x / cellWidth) + Math.floor(y / cellHeight)) % palette.length;
      ctx.fillStyle = palette[colorIndex];
      ctx.fillRect(x, y, cellWidth, cellHeight);
    }
  }
}

/**
 * Рисует поверх паттерна границы физических кабинетов — полезно, чтобы
 * увидеть, где будут швы между модулями, независимо от паттерна теста.
 */
export function drawCabinetGrid(
  ctx: CanvasRenderingContext2D,
  cabinetWidthPx: number,
  cabinetHeightPx: number,
  cols: number,
  rows: number,
  strokeColor = '#ffffff'
): void {
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  for (let c = 0; c <= cols; c++) {
    const x = c * cabinetWidthPx;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, rows * cabinetHeightPx);
    ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    const y = r * cabinetHeightPx;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cols * cabinetWidthPx, y);
    ctx.stroke();
  }
}
