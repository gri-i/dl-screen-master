import type {
  Screen,
  CabinetPreset,
  PowerCalculationResult,
  PowerGridConfig,
  PowerPhase,
  PowerPlan
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

// ── Нагрузки по фазам после расключения силовых путей (17.11.2026) ──────────
// Источник — план питания экрана (PowerPathPlanner): цепи с фазой и списком
// кабинетов. Питание кабинета — preset.maxPowerW (пик), ток фазы считается по
// фазному напряжению плана, как в планировщике (`cabinetAmps`), чтобы цифры в
// правом сайдбаре и в планировщике совпадали.

export interface PhaseLoad {
  phase: PowerPhase;
  cabinets: number;
  maxPowerW: number;
  avgPowerW: number;
  amps: number;
}

export interface PowerPlanLoads {
  phases: 1 | 3;
  /** L1…L3 (для однофазного плана — только L1) */
  loads: PhaseLoad[];
  /** сколько кабинетов разведено по цепям (уникальных) */
  assignedCabinets: number;
  maxPowerW: number;
  avgPowerW: number;
  /** перекос фаз в % (для 3ф): (max − min) / среднее; 0 — если нагрузок нет */
  imbalancePercent: number;
}

const POWER_PHASES: PowerPhase[] = ['L1', 'L2', 'L3'];

/**
 * Нагрузки по фазам из плана питания. null — расключения нет (нет цепей или
 * ни один кабинет не назначен), тогда в сайдбаре показывать нечего.
 */
export function powerPlanLoads(plan: PowerPlan | undefined, preset: CabinetPreset): PowerPlanLoads | null {
  if (!plan || !Array.isArray(plan.circuits) || plan.circuits.length === 0) return null;
  const maxPowerW = Math.max(0, preset.maxPowerW || 0);
  const avgPowerW = Math.max(0, preset.avgPowerW || 0);
  const seen = new Set<string>();
  const perPhase = new Map<PowerPhase, Set<string>>();
  for (const circuit of plan.circuits) {
    const phase: PowerPhase = circuit.phase === 'L2' || circuit.phase === 'L3' ? circuit.phase : 'L1';
    const bucket = perPhase.get(phase) ?? new Set<string>();
    for (const key of circuit.assignedCabinets || []) {
      bucket.add(key);
      seen.add(key);
    }
    perPhase.set(phase, bucket);
  }
  if (seen.size === 0) return null;

  const volt = Math.max(1, plan.voltage || 230);
  const factor = plan.powerFactor > 0 ? plan.powerFactor : 1;
  const used = plan.phases === 3 ? POWER_PHASES : (['L1'] as PowerPhase[]);
  const loads: PhaseLoad[] = used.map((phase) => {
    // однофазный план: фаза одна, поэтому все разведённые кабинеты считаем на L1
    // (в цепях могла остаться метка L2/L3 от трёхфазной раскладки)
    const cabinets = plan.phases === 3 ? (perPhase.get(phase)?.size ?? 0) : seen.size;
    const phaseMax = cabinets * maxPowerW;
    return {
      phase,
      cabinets,
      maxPowerW: phaseMax,
      avgPowerW: cabinets * avgPowerW,
      amps: phaseMax / (volt * factor)
    };
  });

  const totalMax = loads.reduce((sum, load) => sum + load.maxPowerW, 0);
  let imbalancePercent = 0;
  if (plan.phases === 3 && loads.length === 3) {
    const hi = Math.max(...loads.map((load) => load.amps));
    const lo = Math.min(...loads.map((load) => load.amps));
    const mean = loads.reduce((sum, load) => sum + load.amps, 0) / 3;
    imbalancePercent = mean > 0 ? Math.round(((hi - lo) / mean) * 1000) / 10 : 0;
  }

  return {
    phases: plan.phases === 3 ? 3 : 1,
    loads,
    assignedCabinets: seen.size,
    maxPowerW: totalMax,
    avgPowerW: seen.size * avgPowerW,
    imbalancePercent
  };
}

/**
 * Сводка по экрану для внешних потребителей (дизайн у LED-стены): полное
 * потребление экрана + фактические нагрузки по фазам из плана питания.
 * Пока дизайн не знает расключения — он берёт готовые числа отсюда.
 */
export function screenPowerSummary(
  plan: PowerPlan | undefined,
  preset: CabinetPreset,
  cabinets: number
): {
  phases: 1 | 3;
  voltage: number;
  breakerAmps: number;
  safetyMarginPercent: number;
  powerFactor: number;
  cabinets: number;
  assigned: number;
  maxPowerW: number;
  avgPowerW: number;
  loads: PhaseLoad[];
  imbalancePercent: number;
} {
  const total = Math.max(0, Math.round(cabinets));
  const loads = powerPlanLoads(plan, preset);
  return {
    phases: plan?.phases === 1 ? 1 : 3,
    voltage: plan?.voltage ?? 230,
    breakerAmps: plan?.circuitBreakerAmps ?? 16,
    safetyMarginPercent: plan?.safetyMarginPercent ?? 20,
    powerFactor: plan?.powerFactor ?? 0.95,
    cabinets: total,
    assigned: loads?.assignedCabinets ?? 0,
    maxPowerW: total * Math.max(0, preset.maxPowerW || 0),
    avgPowerW: total * Math.max(0, preset.avgPowerW || 0),
    loads: loads?.loads ?? [],
    imbalancePercent: loads?.imbalancePercent ?? 0
  };
}
