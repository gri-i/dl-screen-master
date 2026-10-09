import type { Processor } from './types';
import type { RoutingGrid } from './autoRouting';

/**
 * Проверка разводки сигнала по раскладке (адаптировано из pixel-peeker,
 * validateWiring). Чистая функция: возвращает структурированные проблемы,
 * тексты строит UI через i18n.
 */
export type WiringIssue =
  | { kind: 'unassigned'; count: number; first: string }
  | { kind: 'duplicate'; key: string; ports: string[] }
  | { kind: 'missing'; key: string; port: string }
  | { kind: 'jump'; port: string; from: string; to: string };

const parseKey = (key: string): [number, number] => {
  const [col, row] = key.split('-').map(Number);
  return [col, row];
};

export function validateWiring(grid: RoutingGrid, processor: Processor | undefined): WiringIssue[] {
  if (!processor) return [];
  const empty = new Set(grid.emptyCabinetKeys);
  const exists = (key: string): boolean => {
    const [col, row] = parseKey(key);
    return Number.isInteger(col) && Number.isInteger(row) &&
      col >= 0 && col < grid.cols && row >= 0 && row < grid.rows && !empty.has(key);
  };
  const issues: WiringIssue[] = [];
  const owners = new Map<string, string[]>();

  for (const port of processor.ports) {
    const label = port.sourcePortName ? `${port.controllerName ?? ''} ${port.sourcePortName}`.trim() : port.portId;
    port.assignedCabinets.forEach((key, index) => {
      owners.set(key, [...(owners.get(key) ?? []), label]);
      if (!exists(key)) {
        issues.push({ kind: 'missing', key, port: label });
        return;
      }
      const previous = port.assignedCabinets[index - 1];
      if (previous === undefined || !exists(previous)) return;
      const [pc, pr] = parseKey(previous);
      const [cc, cr] = parseKey(key);
      if (Math.max(Math.abs(pc - cc), Math.abs(pr - cr)) > 1) {
        issues.push({ kind: 'jump', port: label, from: previous, to: key });
      }
    });
  }

  for (const [key, ports] of owners) {
    if (ports.length > 1) issues.push({ kind: 'duplicate', key, ports });
  }

  let unassigned = 0;
  let first = '';
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const key = `${col}-${row}`;
      if (empty.has(key) || owners.has(key)) continue;
      if (!unassigned) first = key;
      unassigned++;
    }
  }
  if (unassigned) issues.unshift({ kind: 'unassigned', count: unassigned, first });
  return issues;
}
