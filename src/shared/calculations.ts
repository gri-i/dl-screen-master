import type {
  Screen,
  CabinetPreset,
  PowerCalculationResult,
  PowerGridConfig
} from './types';
import { usablePowerPerPortW } from './powerLimits';

/**
 * Считает итоговые габариты, вес и потребление экрана,
 * а также рекомендует число цепей/автоматов под заданную электросеть.
 *
 * Пока предполагается, что все кабинеты в экране используют
 * один и тот же preset. Поддержку смешанных раскладок (разные
 * модели в одном экране) можно добавить, расширив CabinetInstance.
 */
export function calculateScreenPower(
  screen: Screen,
  preset: CabinetPreset,
  gridConfig: PowerGridConfig
): PowerCalculationResult {
  const totalCabinets = screen.cabinets.length;

  const totalWeightKg = totalCabinets * preset.weightKg;
  const totalWidthMm = screen.cols * preset.widthMm;
  const totalHeightMm = screen.rows * preset.heightMm;
  const totalMaxPowerW = totalCabinets * preset.maxPowerW;
  const totalAvgPowerW = totalCabinets * preset.avgPowerW;

  const recommendedCircuits = calculateCircuits(totalMaxPowerW, gridConfig);

  return {
    totalCabinets,
    totalWeightKg,
    totalWidthMm,
    totalHeightMm,
    totalMaxPowerW,
    totalAvgPowerW,
    recommendedCircuits
  };
}

/**
 * Рассчитывает необходимое число цепей (автоматов) под заданную
 * пиковую мощность, с учётом запаса безопасности.
 *
 * Используем pиковую (max) мощность, а не среднюю — это стандартная
 * практика при планировании электрики, чтобы не словить срабатывание
 * автомата на пиках яркости/контента.
 */
function calculateCircuits(
  totalMaxPowerW: number,
  config: PowerGridConfig
): PowerCalculationResult['recommendedCircuits'] {
  const { voltage, phase, circuitBreakerAmps, safetyMarginPercent, powerFactor } = config;
  // Для трёхфазного ввода считаем каждую силовую цепь/порт отдельно — 230 В фаза.
  const portVoltage = phase === 'three' ? voltage / Math.sqrt(3) : voltage;
  const wattsPerCircuit = usablePowerPerPortW(portVoltage, circuitBreakerAmps, safetyMarginPercent, powerFactor);

  const circuitsNeeded = wattsPerCircuit > 0 ? Math.ceil(totalMaxPowerW / wattsPerCircuit) : 0;

  return {
    phase,
    circuitsNeeded,
    ampsPerCircuit: circuitBreakerAmps
  };
}
