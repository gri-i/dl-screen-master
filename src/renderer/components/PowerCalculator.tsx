import React, { useMemo } from 'react';
import { calculateScreenPower } from '@shared/calculations';
import type { CabinetInstance, CabinetPreset, Screen, PowerGridConfig } from '@shared/types';

export interface ScreenConfig {
  presetId: string;
  cols: number;
  rows: number;
  /** Ключи пустых ячеек формата "col-row". */
  emptyCabinetKeys: string[];
}

interface PowerCalculatorProps {
  screenConfig: ScreenConfig;
  onScreenConfigChange: React.Dispatch<React.SetStateAction<ScreenConfig>>;
  presets: CabinetPreset[];
  gridConfig: PowerGridConfig;
}

/**
 * Первая рабочая фича приложения: ввод размера экрана (кабинетов по X/Y) →
 * вывод веса, габаритов, потребления и числа нужных цепей питания.
 * Без canvas — просто форма. Это то, что уже можно использовать на складе.
 */
export function PowerCalculator({
  screenConfig,
  onScreenConfigChange,
  presets,
  gridConfig
}: PowerCalculatorProps): JSX.Element {
  const { cols, rows, presetId } = screenConfig;

  const preset = presets.find((item) => item.id === presetId) ?? presets[0];

  const screen: Screen = useMemo(() => {
    const cabinets: CabinetInstance[] = [];
    if (!preset) return { id: 'screen-1', name: 'Тестовый экран', cabinets, cols, rows };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!screenConfig.emptyCabinetKeys.includes(`${c}-${r}`)) {
          cabinets.push({ presetId: preset.id, col: c, row: r });
        }
      }
    }
    return { id: 'screen-1', name: 'Тестовый экран', cabinets, cols, rows };
  }, [cols, rows, preset?.id, screenConfig.emptyCabinetKeys]);

  if (!preset) {
    return (
      <section className="power-calculator">
        <h2>Параметры экрана</h2>
        <fieldset>
          <legend>Модель кабинета</legend>
          <p className="field-hint">В базе нет кабинетов. Добавьте или импортируйте кабинет в настройках.</p>
        </fieldset>
      </section>
    );
  }

  const result = calculateScreenPower(screen, preset, gridConfig);

  return (
    <section className="power-calculator">
      <h2>Параметры экрана</h2>
      <fieldset>
        <legend>Модель кабинета</legend>
        <select
          value={presetId}
          onChange={(e) => onScreenConfigChange((current) => ({ ...current, presetId: e.target.value }))}
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.brand} {p.model} (pitch {p.pixelPitchMm} мм)
            </option>
          ))}
        </select>
        <p className="field-hint">
          {preset.widthMm}×{preset.heightMm} мм, {preset.weightKg} кг,
          макс. {preset.maxPowerW} Вт / сред. {preset.avgPowerW} Вт на кабинет
        </p>
      </fieldset>

      <fieldset>
        <legend>Раскладка экрана</legend>
        <label>
          Кабинетов по горизонтали:{' '}
          <input
            type="number"
            value={cols}
            min={1}
            onChange={(e) =>
              onScreenConfigChange((current) => ({
                ...current,
                cols: Number(e.target.value),
                emptyCabinetKeys: []
              }))
            }
          />
        </label>
        <br />
        <label>
          Кабинетов по вертикали:{' '}
          <input
            type="number"
            value={rows}
            min={1}
            onChange={(e) =>
              onScreenConfigChange((current) => ({
                ...current,
                rows: Number(e.target.value),
                emptyCabinetKeys: []
              }))
            }
          />
        </label>
      </fieldset>

      <h3>Расчёт</h3>
      <table className="result-table">
        <tbody>
          <Row label="Всего кабинетов" value={result.totalCabinets} />
          <Row label="Разрешение (px)" value={`${cols * preset.resolutionX} × ${rows * preset.resolutionY}`} />
          <Row label="Габариты (мм)" value={`${result.totalWidthMm} × ${result.totalHeightMm}`} />
          <Row label="Общий вес (кг)" value={result.totalWeightKg.toFixed(1)} />
          <Row label="Пиковое потребление (Вт)" value={result.totalMaxPowerW} />
          <Row label="Среднее потребление (Вт)" value={result.totalAvgPowerW} />
          <Row
            label="Нужно цепей питания"
            value={`${result.recommendedCircuits.circuitsNeeded} × ${result.recommendedCircuits.ampsPerCircuit}А (${
              result.recommendedCircuits.phase === 'three' ? '3ф' : '1ф'
            })`}
          />
        </tbody>
      </table>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <tr>
      <td>{label}</td>
      <td>{value}</td>
    </tr>
  );
}
