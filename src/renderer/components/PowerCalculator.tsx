import React, { useMemo } from 'react';
import { calculateScreenPower } from '@shared/calculations';
import type { CabinetInstance, CabinetPreset, Screen, PowerGridConfig } from '@shared/types';
import { useT } from '../i18n/context';

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
  const t = useT();
  const { cols, rows, presetId } = screenConfig;

  const preset = presets.find((item) => item.id === presetId) ?? presets[0];

  const screen: Screen = useMemo(() => {
    const cabinets: CabinetInstance[] = [];
    const name = t('pc.testScreenName');
    if (!preset) return { id: 'screen-1', name, cabinets, cols, rows };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!screenConfig.emptyCabinetKeys.includes(`${c}-${r}`)) {
          cabinets.push({ presetId: preset.id, col: c, row: r });
        }
      }
    }
    return { id: 'screen-1', name, cabinets, cols, rows };
  }, [cols, rows, preset?.id, screenConfig.emptyCabinetKeys, t]);

  if (!preset) {
    return (
      <section className="power-calculator">
        <h2>{t('pc.title')}</h2>
        <fieldset>
          <legend>{t('pc.cabinetModel')}</legend>
          <p className="field-hint">{t('pc.noCabinets')}</p>
        </fieldset>
      </section>
    );
  }

  const result = calculateScreenPower(screen, preset, gridConfig);

  return (
    <section className="power-calculator">
      <h2>{t('pc.title')}</h2>
      <fieldset>
        <legend>{t('pc.cabinetModel')}</legend>
        <select
          value={presetId}
          onChange={(e) => onScreenConfigChange((current) => ({ ...current, presetId: e.target.value }))}
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {t('pc.optionLabel', { brand: p.brand, model: p.model, pitch: p.pixelPitchMm })}
            </option>
          ))}
        </select>
        <p className="field-hint">
          {t('pc.presetSummary', { width: preset.widthMm, height: preset.heightMm, weight: preset.weightKg, maxPower: preset.maxPowerW, avgPower: preset.avgPowerW })}
        </p>
      </fieldset>

      <fieldset>
        <legend>{t('pc.layout')}</legend>
        <label>
          {t('pc.colsLabel')}{' '}
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
          {t('pc.rowsLabel')}{' '}
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

      <h3>{t('pc.calculation')}</h3>
      <table className="result-table">
        <tbody>
          <Row label={t('pc.totalCabinets')} value={result.totalCabinets} />
          <Row label={t('pc.resolutionPx')} value={`${cols * preset.resolutionX} × ${rows * preset.resolutionY}`} />
          <Row label={t('pc.dimensionsMm')} value={`${result.totalWidthMm} × ${result.totalHeightMm}`} />
          <Row label={t('pc.totalWeightKg')} value={result.totalWeightKg.toFixed(1)} />
          <Row label={t('pc.peakPowerW')} value={result.totalMaxPowerW} />
          <Row label={t('pc.peakPowerKw')} value={(result.totalMaxPowerW / 1000).toFixed(2)} />
          <Row label={t('pc.avgPowerW')} value={result.totalAvgPowerW} />
          <Row
            label={t('pc.circuitsNeeded')}
            value={`${result.recommendedCircuits.circuitsNeeded} × ${result.recommendedCircuits.ampsPerCircuit}A (${
              result.recommendedCircuits.phase === 'three' ? t('pc.phaseThree') : t('pc.phaseSingle')
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
