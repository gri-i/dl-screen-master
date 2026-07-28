import React, { useMemo } from 'react';
import type { CabinetPreset, PowerCircuit, PowerPhase, PowerPlan } from '@shared/types';
import type { ScreenConfig } from './PowerCalculator';

interface PowerPathPlannerProps {
  plan?: PowerPlan;
  screenConfig: ScreenConfig;
  preset: CabinetPreset;
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
  const keys: string[] = [];
  for (let row = 0; row < config.rows; row += 1) {
    for (let col = 0; col < config.cols; col += 1) {
      const key = `${col}-${row}`;
      if (!config.emptyCabinetKeys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

export function PowerPathPlanner({
  plan,
  screenConfig,
  preset,
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

  function autoBalance(): void {
    const count = Math.max(1, Math.ceil(keys.length * cabinetAmps / Math.max(.1, usableAmps)));
    const circuits: PowerCircuit[] = Array.from({ length: count }, (_, index) => ({
      id: crypto.randomUUID(),
      name: `Цепь ${index + 1}`,
      phase: value.phases === 3 ? PHASES[index % 3] : 'L1',
      assignedCabinets: []
    }));
    keys.forEach((key, index) => circuits[index % circuits.length].assignedCabinets.push(key));
    onChange({ ...value, circuits });
    onActiveCircuitChange(circuits[0]?.id ?? null);
  }

  function toggleCabinet(key: string): void {
    if (!activeCircuitId) return;
    const alreadyActive = value.circuits.find((circuit) => circuit.id === activeCircuitId)?.assignedCabinets.includes(key);
    onChange({
      ...value,
      circuits: value.circuits.map((circuit) => ({
        ...circuit,
        assignedCabinets: circuit.assignedCabinets.filter((item) => item !== key).concat(
          circuit.id === activeCircuitId && !alreadyActive ? [key] : []
        )
      }))
    });
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
      <div className="power-settings-grid">
        <label>Напряжение, В<input type="number" min={1} value={value.voltage} onChange={(event) => updateSettings({ voltage: Number(event.target.value) })} /></label>
        <label>Автомат, А<input type="number" min={1} value={value.circuitBreakerAmps} onChange={(event) => updateSettings({ circuitBreakerAmps: Number(event.target.value) })} /></label>
        <label>Запас, %<input type="number" min={0} max={90} value={value.safetyMarginPercent} onChange={(event) => updateSettings({ safetyMarginPercent: Number(event.target.value) })} /></label>
        <label>Сеть<select value={value.phases} onChange={(event) => updateSettings({ phases: Number(event.target.value) as 1 | 3 })}><option value={1}>1 фаза</option><option value={3}>3 фазы</option></select></label>
      </div>
      <div className="power-path-actions">
        <button type="button" onClick={autoBalance}>Автобаланс</button>
        <button type="button" onClick={addCircuit}>+ Цепь</button>
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
          const amps = circuit.assignedCabinets.length * cabinetAmps;
          const load = Math.round(amps / Math.max(.1, usableAmps) * 100);
          return (
            <button key={circuit.id} type="button" className={`${activeCircuitId === circuit.id ? 'is-active' : ''}${load > 100 ? ' is-overloaded' : ''}`} onClick={() => onActiveCircuitChange(circuit.id)} style={{ '--circuit-color': `hsl(${index * 71} 75% 48%)` } as React.CSSProperties}>
              <b>{circuit.name} · {circuit.phase}</b><span>{circuit.assignedCabinets.length} каб. · {amps.toFixed(1)} А · {load}%</span>
            </button>
          );
        })}
      </div>
      {value.circuits.length > 0 && (
        <div className="power-cabinet-grid" style={{ gridTemplateColumns: `repeat(${screenConfig.cols}, 1fr)` }}>
          {Array.from({ length: screenConfig.rows }, (_, row) => Array.from({ length: screenConfig.cols }, (_, col) => {
            const key = `${col}-${row}`;
            if (screenConfig.emptyCabinetKeys.includes(key)) return <span key={key} className="is-empty" />;
            const circuitIndex = value.circuits.findIndex((circuit) => circuit.assignedCabinets.includes(key));
            const order = circuitIndex >= 0 ? value.circuits[circuitIndex].assignedCabinets.indexOf(key) : -1;
            return <button key={key} type="button" title={circuitIndex >= 0 ? `${value.circuits[circuitIndex].name}, кабинет ${order + 1}` : 'Не назначен'} onClick={() => toggleCabinet(key)} style={circuitIndex >= 0 ? { background: `hsl(${circuitIndex * 71} 65% 38%)` } : undefined}>{order >= 0 ? order + 1 : '—'}</button>;
          }))}
        </div>
      )}
      <p className={`data-path-summary${assigned < keys.length ? ' is-warning' : ''}`}>Назначено {assigned} из {keys.length} кабинетов · допустимо {usableAmps.toFixed(1)} А на цепь</p>
    </fieldset>
  );
}
