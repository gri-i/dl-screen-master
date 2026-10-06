import React, { useMemo } from 'react';
import type { CabinetPreset, PowerCircuit, PowerPhase, PowerPlan } from '@shared/types';
import type { ScreenConfig } from './PowerCalculator';
import { POWER_PORT_MAX_W, usablePowerPerPortW } from '@shared/powerLimits';
import { generateCabinetOrder } from '@shared/autoRouting';
import { useT } from '../i18n/context';

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
  const t = useT();
  const value = plan ?? defaultPlan();
  const keys = useMemo(() => cabinetKeys(screenConfig), [screenConfig]);
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
      name: t('pp.circuitName', { n: index + 1 }),
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
      name: t('pp.circuitName', { n: startIndex + index + 1 }),
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
      <legend>{t('pp.title')}</legend>
      <label>{t('pp.cabinetForPower')}
        <select value={preset.id} onChange={(event) => onPresetChange(event.target.value)}>
          {presets.map((item) => <option key={item.id} value={item.id}>{t('pp.cabinetOption', { brand: item.brand, model: item.model, power: item.maxPowerW })}</option>)}
        </select>
      </label>
      <div className="power-settings-grid">
        <label>{t('pp.voltage')}<input type="number" min={1} value={value.voltage} onChange={(event) => updateSettings({ voltage: Number(event.target.value) })} /></label>
        <label>{t('pp.breaker')}<input type="number" min={1} value={value.circuitBreakerAmps} onChange={(event) => updateSettings({ circuitBreakerAmps: Number(event.target.value) })} /></label>
        <label>{t('pp.margin')}<input type="number" min={0} max={90} value={value.safetyMarginPercent} onChange={(event) => updateSettings({ safetyMarginPercent: Number(event.target.value) })} /></label>
        <label>{t('pp.grid')}<select value={value.phases} onChange={(event) => updateSettings({ phases: Number(event.target.value) as 1 | 3 })}><option value={1}>{t('pp.phase1')}</option><option value={3}>{t('pp.phase3')}</option></select></label>
      </div>
      <p className="field-hint">{t('pp.autoHint')}</p>
      <div className="power-path-actions">
        <button type="button" onClick={addCircuit}>{t('pp.addCircuit')}</button>
        <button type="button" onClick={addPowerDistroBox} title={t('pp.addDistroBoxTitle')}>{t('pp.addDistroBox')}</button>
        <button type="button" onClick={clearCircuits}>{t('pp.clear')}</button>
      </div>
      {value.circuits.length > 0 && (
        <button type="button" className={isEditing ? 'is-active' : ''} onClick={() => onEditingChange(!isEditing)}>
          {isEditing ? t('pp.finishDrawing') : t('pp.startDrawing')}
        </button>
      )}
      {isEditing && <p className="field-hint">{t('pp.editingHint')}</p>}
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
                <span>{t('pp.noCabinetPower')}</span>
              ) : (
                <span className="circuit-capacity">
                  <em className={overloaded ? 'is-overloaded' : ''}>{t(overloaded ? 'pp.overloadPercent' : 'pp.loadPercent', { load })}</em><br />
                  {t('pp.circuitStats', { count: circuit.assignedCabinets.length, max: maxCabinetsPerCircuit ?? 0, remaining: remainingCabinets })}<br />
                  {t('pp.circuitKw', { used: (watts / 1000).toFixed(2), total: (usablePowerW / 1000).toFixed(2) })}<br />
                  {t('pp.circuitAmps', { amps: amps.toFixed(2), limit: POWER_PORT_MAX_W / 1000 })}
                  <i className="power-circuit-meter" aria-label={t('pp.loadPercent', { load })}><span className={overloaded ? 'is-overloaded' : ''} style={{ width: `${Math.min(load, 100)}%` }} /></i>
                </span>
              )}
            </button>
          );
        })}
      </div>
      {(() => {
        const overloaded = value.circuits.filter((circuit) => circuit.assignedCabinets.length * preset.maxPowerW > usablePowerW).length;
        return <p className={`data-path-summary${assigned < keys.length || overloaded > 0 ? ' is-warning' : ''}`}>
          {t('pp.summary', {
            assigned, total: keys.length,
            overloadPart: overloaded > 0 ? t('pp.summaryOverloadPart', { count: overloaded }) : '',
            usableKw: (usablePowerW / 1000).toFixed(2),
            cabinetLimitPart: maxCabinetsPerCircuit !== null ? t('pp.summaryCabinetLimitPart', { count: maxCabinetsPerCircuit }) : ''
          })}
        </p>;
      })()}
    </fieldset>
  );
}
