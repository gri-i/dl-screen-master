import type {
  Screen,
  CabinetPreset,
  PowerCalculationResult,
  PowerGridConfig
} from './types';

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

  // Доступная мощность на одну цепь с учётом запаса
  const usableAmps = circuitBreakerAmps * (1 - safetyMarginPercent / 100);

  const wattsPerCircuit =
    phase === 'three'
      ? voltage * usableAmps * Math.sqrt(3) * powerFactor
      : voltage * usableAmps * powerFactor;

  const circuitsNeeded = Math.ceil(totalMaxPowerW / wattsPerCircuit);

  return {
    phase,
    circuitsNeeded,
    ampsPerCircuit: circuitBreakerAmps
  };
}
