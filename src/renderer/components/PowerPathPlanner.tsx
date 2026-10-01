import React, { useMemo } from 'react';
import type { CabinetPreset, PowerCircuit, PowerPhase, PowerPlan } from '@shared/types';
import type { ScreenConfig } from './PowerCalculator';
import { POWER_PORT_MAX_W, usablePowerPerPortW } from '@shared/powerLimits';
import { generateCabinetOrder } from '@shared/autoRouting';

interface PowerPathPlannerProps {
  plan?: PowerPlan;
  screenConfig: ScreenConfig;
  preset: CabinetPreset;
  presets: CabinetPreset[];
  onPresetChange: (presetId: string) => void;
  onChange: (plan: PowerPlan) => void;
  activeCircuitId: string | null;
  isEditing: boolean;
  onActiveCircuitChange: (id: string | null) => void;
  onEditingChange: (editing: boolean) => void;
}

const PHASES: PowerPhase[] = ['L1', 'L2', 'L3'];

function defaultPlan(): PowerPlan {
  return {
    voltage: 230,
    circuitBreakerAmps: 16,
    safetyMarginPercent: 20,
    powerFactor: .95,
    phases: 3,
    circuits: []
  };
}

function cabinetKeys(config: ScreenConfig): string[] {
  // "Змейкой" (чётные строки слева направо, нечётные — справа налево), а не
  // простым растром — иначе переход на следующую строку всегда идёт через
  // весь экран (из правого конца строки в левый), вместо шага к соседнему
  // кабинету снизу, и расходует лишний кабель.
  return generateCabinetOrder(config, 'snake-rows', 'top-left');
}

export function PowerPathPlanner({
  plan,
  screenConfig,
  preset,
  presets,
  onPresetChange,
  onChange,
  activeCircuitId,
  isEditing,
  onActiveCircuitChange,
  onEditingChange
}: PowerPathPlannerProps): JSX.Element {
  const value = plan ?? defaultPlan();
  const keys = useMemo(() => cabinetKeys(screenConfig), [screenConfig]);
  const usableAmps = value.circuitBreakerAmps * (1 - value.safetyMarginPercent / 100);
  const cabinetAmps = preset.maxPowerW / Math.max(1, value.voltage * value.powerFactor);
  const usablePowerW = usablePowerPerPortW(value.voltage, value.circuitBreakerAmps, value.safetyMarginPercent, value.powerFactor);
  const maxCabinetsPerCircuit = preset.maxPowerW > 0 ? Math.floor(usablePowerW / preset.maxPowerW) : null;

  function updateSettings(patch: Partial<PowerPlan>): void {
    onChange({ ...value, ...patch });
  }

  function addCircuit(): void {
    const index = value.circuits.length;
    const circuit: PowerCircuit = {
      id: crypto.randomUUID(),
      name: `Цепь ${index + 1}`,
      phase: value.phases === 3 ? PHASES[index % 3] : 'L1',
      assignedCabinets: []
    };
    onChange({ ...value, circuits: [...value.circuits, circuit] });
    onActiveCircuitChange(circuit.id);
    onEditingChange(true);
  }

  // Типовая силовая коробка: вход 3ф 32А (CEE), выход — 6 розеток 1ф 16А,
  // по 2 на каждую фазу — так распределительные коробки такого типа устроены
  // физически. "Автомат" в этом плане — это номинал ОТХОДЯЩЕЙ линии (а не
  // вводного автомата коробки), поэтому при добавлении коробки задаём 16А и
  // 3 фазы на весь план: это соответствует маркировке выходных розеток и
  // уже существующим цепям, которые тоже защищены отходящими автоматами.
  function addPowerDistroBox(): void {
    const startIndex = value.circuits.length;
    const circuits: PowerCircuit[] = Array.from({ length: 6 }, (_, index) => ({
      id: crypto.randomUUID(),
      name: `Цепь ${startIndex + index + 1}`,
      phase: PHASES[index % 3],
      assignedCabinets: []
    }));
    onChange({ ...value, phases: 3, circuitBreakerAmps: 16, circuits: [...value.circuits, ...circuits] });
    onActiveCircuitChange(circuits[0].id);
    onEditingChange(true);
  }

  function clearCircuits(): void {
    onChange({ ...value, circuits: value.circuits.map((circuit) => ({ ...circuit, assignedCabinets: [] })) });
  }

  const assigned = new Set(value.circuits.flatMap((circuit) => circuit.assignedCabinets)).size;
  const phaseAmps = PHASES.map((phase) => value.circuits
    .filter((circuit) => circuit.phase === phase)
    .reduce((sum, circuit) => sum + circuit.assignedCabinets.length * cabinetAmps, 0));

  return (
    <fieldset className="power-path-panel">
      <legend>Power path planning</legend>
      <label>Кабинет для расчёта питания
        <select value={preset.id} onChange={(event) => onPresetChange(event.target.value)}>
          {presets.map((item) => <option key={item.id} value={item.id}>{item.brand} {item.model} · {item.maxPowerW} Вт/каб.</option>)}
        </select>
      </label>
      <div className="power-settings-grid">
        <label>Напряжение, В<input type="number" min={1} value={value.voltage} onChange={(event) => updateSettings({ voltage: Number(event.target.value) })} /></label>
        <label>Автомат, А<input type="number" min={1} value={value.circuitBreakerAmps} onChange={(event) => updateSettings({ circuitBreakerAmps: Number(event.target.value) })} /></label>
        <label>Запас, %<input type="number" min={0} max={90} value={value.safetyMarginPercent} onChange={(event) => updateSettings({ safetyMarginPercent: Number(event.target.value) })} /></label>
        <label>Сеть<select value={value.phases} onChange={(event) => updateSettings({ phases: Number(event.target.value) as 1 | 3 })}><option value={1}>1 фаза</option><option value={3}>3 фазы</option></select></label>
      </div>
      <p className="field-hint">Для автоматического построения силовых цепей — с превью и выбором лимита кабинетов на линию — используйте «Автоматическая схема» выше. Здесь можно только донастроить цепи вручную.</p>
      <div className="power-path-actions">
        <button type="button" onClick={addCircuit}>+ Цепь</button>
        <button type="button" onClick={addPowerDistroBox} title="Добавить 6 цепей по 16А (2 на фазу) — типовая коробка с вводом 3ф 32А">+ Коробка 32А/3ф (6×16А)</button>
        <button type="button" onClick={clearCircuits}>Очистить</button>
      </div>
      {value.circuits.length > 0 && (
        <button type="button" className={isEditing ? 'is-active' : ''} onClick={() => onEditingChange(!isEditing)}>
          {isEditing ? 'Завершить рисование силовых путей' : 'Рисовать силовые пути'}
        </button>
      )}
      {isEditing && <p className="field-hint">Выберите цепь, затем нажимайте кабинеты на экране в порядке прохождения питания. Повторный клик удаляет кабинет.</p>}
      {value.phases === 3 && <div className="phase-loads">{PHASES.map((phase, index) => <span key={phase}>{phase}: {phaseAmps[index].toFixed(1)} А</span>)}</div>}
      <div className="power-circuit-list">
        {value.circuits.map((circuit, index) => {
          const watts = circuit.assignedCabinets.length * preset.maxPowerW;
          const amps = circuit.assignedCabinets.length * cabinetAmps;
          const load = Math.round(watts / Math.max(.1, usablePowerW) * 100);
          const overloaded = load > 100;
          const remainingCabinets = maxCabinetsPerCircuit === null ? null : Math.max(0, maxCabinetsPerCircuit - circuit.assignedCabinets.length);
          return (
            <button key={circuit.id} type="button" className={`${activeCircuitId === circuit.id ? 'is-active' : ''}${overloaded ? ' is-overloaded' : ''}`} onClick={() => onActiveCircuitChange(circuit.id)} style={{ '--circuit-color': `hsl(${index * 71} 75% 48%)` } as React.CSSProperties}>
              <b>{circuit.name} · {circuit.phase}</b>
              {remainingCabinets === null ? (
                <span>Нет мощности кабинета — лимит не рассчитан</span>
              ) : (
                <span className="circuit-capacity">
                  <em className={overloaded ? 'is-overloaded' : ''}>{overloaded ? `Перегрузка ${load}%` : `Загрузка ${load}%`}</em><br />
                  {circuit.assignedCabinets.length} из {maxCabinetsPerCircuit} каб. · ещё {remainingCabinets}<br />
                  {(watts / 1000).toFixed(2)} из {(usablePowerW / 1000).toFixed(2)} кВт<br />
                  {amps.toFixed(2)} А · лимит порта {POWER_PORT_MAX_W / 1000} кВт
                  <i className="power-circuit-meter" aria-label={`Загрузка ${load}%`}><span className={overloaded ? 'is-overloaded' : ''} style={{ width: `${Math.min(load, 100)}%` }} /></i>
                </span>
              )}
            </button>
          );
        })}
      </div>
      {(() => {
        const overloaded = value.circuits.filter((circuit) => circuit.assignedCabinets.length * preset.maxPowerW > usablePowerW).length;
        return <p className={`data-path-summary${assigned < keys.length || overloaded > 0 ? ' is-warning' : ''}`}>Назначено {assigned} из {keys.length} кабинетов{overloaded > 0 ? ` · перегружено портов: ${overloaded}` : ''} · допустимо {(usablePowerW / 1000).toFixed(2)} кВт на порт (не более 3 кВт){maxCabinetsPerCircuit !== null ? ` · до ${maxCabinetsPerCircuit} кабинетов на порт` : ''}</p>;
      })()}
    </fieldset>
  );
}
