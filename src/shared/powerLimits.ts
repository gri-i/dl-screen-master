/** Максимальная суммарная мощность LED-кабинетов на один силовой порт. */
export const POWER_PORT_MAX_W = 3_000;

/**
 * Возвращает мощность, которую можно подключить к одному порту.
 * Лимит автомата остаётся в силе, но порт никогда не превышает 3 кВт.
 */
export function usablePowerPerPortW(
  voltage: number,
  circuitBreakerAmps: number,
  safetyMarginPercent: number,
  powerFactor: number
): number {
  const breakerLimitW = voltage * circuitBreakerAmps * (1 - safetyMarginPercent / 100) * powerFactor;
  return Math.max(0, Math.min(POWER_PORT_MAX_W, breakerLimitW));
}

export type CircuitLoadStatus = 'ok' | 'tight' | 'over';

/** Загрузка силовой цепи: >100% — перегрузка, >90% — на пределе. */
export function circuitLoad(cabinetCount: number, cabinetMaxPowerW: number, usableW: number): {
  watts: number; ratio: number; percent: number; status: CircuitLoadStatus;
} {
  const watts = cabinetCount * cabinetMaxPowerW;
  const ratio = watts / Math.max(.1, usableW);
  return { watts, ratio, percent: Math.round(ratio * 100), status: ratio > 1 ? 'over' : ratio > 0.9 ? 'tight' : 'ok' };
}

/** Цвет маршрута (порт/цепь) по индексу — одна палитра на холсте, в панели и в экспорте. */
/** Золотое-угловое смещение по кругу; старт с синего (200°), чтобы первый маршрут не был красным — красный занят под «перегрузку». */
export const routeHue = (index: number): number => (index * 83 + 200) % 360;
export const routeColor = (index: number): string => `hsl(${routeHue(index)} 78% 55%)`;
