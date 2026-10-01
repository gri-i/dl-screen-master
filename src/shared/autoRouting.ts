import type { PowerCircuit, PowerPhase, PowerPlan, Processor } from './types';
import { usablePowerPerPortW } from './powerLimits';

export type RoutingPattern = 'snake-rows' | 'snake-columns' | 'rows' | 'columns' | 'center';
export type StartCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface RoutingGrid {
  cols: number;
  rows: number;
  emptyCabinetKeys: string[];
}

function orientedCoordinates(grid: RoutingGrid, start: StartCorner): Array<{ col: number; row: number }> {
  const rows = Array.from({ length: grid.rows }, (_, index) =>
    start.startsWith('bottom') ? grid.rows - 1 - index : index
  );
  const cols = Array.from({ length: grid.cols }, (_, index) =>
    start.endsWith('right') ? grid.cols - 1 - index : index
  );
  return rows.flatMap((row) => cols.map((col) => ({ col, row })));
}

export function generateCabinetOrder(
  grid: RoutingGrid,
  pattern: RoutingPattern,
  start: StartCorner,
  reverse = false
): string[] {
  const empty = new Set(grid.emptyCabinetKeys);
  const rowForward = start.endsWith('right') ? -1 : 1;
  const colForward = start.startsWith('bottom') ? -1 : 1;
  let coordinates: Array<{ col: number; row: number }>;

  if (pattern === 'center') {
    const centerX = (grid.cols - 1) / 2;
    const centerY = (grid.rows - 1) / 2;
    coordinates = orientedCoordinates(grid, start).sort((a, b) => {
      const ringA = Math.max(Math.abs(a.col - centerX), Math.abs(a.row - centerY));
      const ringB = Math.max(Math.abs(b.col - centerX), Math.abs(b.row - centerY));
      if (ringA !== ringB) return ringA - ringB;
      const angleA = Math.atan2((a.row - centerY) * colForward, (a.col - centerX) * rowForward);
      const angleB = Math.atan2((b.row - centerY) * colForward, (b.col - centerX) * rowForward);
      return angleA - angleB;
    });
  } else if (pattern === 'columns' || pattern === 'snake-columns') {
    const base = orientedCoordinates(grid, start);
    const columnOrder = Array.from(new Set(base.map((item) => item.col)));
    const rowOrder = Array.from(new Set(base.map((item) => item.row)));
    coordinates = columnOrder.flatMap((col, columnIndex) => {
      const rows = pattern === 'snake-columns' && columnIndex % 2 === 1 ? [...rowOrder].reverse() : rowOrder;
      return rows.map((row) => ({ col, row }));
    });
  } else {
    const base = orientedCoordinates(grid, start);
    const rowOrder = Array.from(new Set(base.map((item) => item.row)));
    const columnOrder = Array.from(new Set(base.map((item) => item.col)));
    coordinates = rowOrder.flatMap((row, rowIndex) => {
      const cols = pattern === 'snake-rows' && rowIndex % 2 === 1 ? [...columnOrder].reverse() : columnOrder;
      return cols.map((col) => ({ col, row }));
    });
  }

  const keys = coordinates.map(({ col, row }) => `${col}-${row}`).filter((key) => !empty.has(key));
  return reverse ? keys.reverse() : keys;
}

export function routeProcessor(processor: Processor, order: string[], pixelsPerCabinet: number): Processor {
  let cursor = 0;
  return {
    ...processor,
    ports: processor.ports.map((port) => {
      const capacity = Math.max(0, Math.min(
        port.maxCabinets ?? Number.POSITIVE_INFINITY,
        Math.floor(port.maxPixels / Math.max(1, pixelsPerCabinet))
      ));
      const assignedCabinets = order.slice(cursor, cursor + capacity);
      cursor += assignedCabinets.length;
      return { ...port, assignedCabinets };
    })
  };
}

/**
 * @param maxCabinetsPerCircuit Ручной лимит кабинетов на линию (напр. из-за
 * длины кабеля/разъёмов), а не из расчёта мощности. Когда задан, ИМЕЕТ
 * ПРИОРИТЕТ над автоматическим лимитом по мощности — так что получившаяся
 * цепь может оказаться электрически перегружена; это сознательно не
 * ограничивается здесь, чтобы вызывающий код мог предупредить об этом
 * пользователя (см. per-circuit overload-проверку в UI).
 */
export function generatePowerPlan(
  source: Omit<PowerPlan, 'circuits'>,
  order: string[],
  cabinetMaxPowerW: number,
  maxCabinetsPerCircuit?: number
): PowerPlan {
  const usablePowerW = usablePowerPerPortW(source.voltage, source.circuitBreakerAmps, source.safetyMarginPercent, source.powerFactor);
  const autoCapacity = Math.max(1, Math.floor(usablePowerW / Math.max(.001, cabinetMaxPowerW)));
  const capacity = maxCabinetsPerCircuit && maxCabinetsPerCircuit > 0 ? Math.floor(maxCabinetsPerCircuit) : autoCapacity;
  const circuitCount = Math.max(1, Math.ceil(order.length / capacity));
  const phases: PowerPhase[] = source.phases === 3 ? ['L1', 'L2', 'L3'] : ['L1'];
  const circuits: PowerCircuit[] = Array.from({ length: circuitCount }, (_, index) => ({
    id: crypto.randomUUID(),
    name: `Цепь ${index + 1}`,
    phase: phases[index % phases.length],
    assignedCabinets: order.slice(index * capacity, (index + 1) * capacity)
  }));
  return { ...source, circuits };
}
