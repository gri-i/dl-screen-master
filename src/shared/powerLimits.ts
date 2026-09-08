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
