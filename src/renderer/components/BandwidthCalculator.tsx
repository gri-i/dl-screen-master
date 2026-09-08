import React, { useEffect, useMemo, useState } from 'react';
import {
  calculateVideoBandwidth,
  VIDEO_INTERFACE_MODES,
  type ChromaFormat,
  type VideoBandwidthInput
} from '@shared/videoBandwidth';

const RESOLUTION_PRESETS = [
  ['Full HD', 1920, 1080],
  ['QHD', 2560, 1440],
  ['4K UHD', 3840, 2160],
  ['DCI 4K', 4096, 2160],
  ['5K', 5120, 2880],
  ['8K UHD', 7680, 4320],
  ['16K', 15360, 8640]
] as const;

interface BandwidthCalculatorProps {
  linkedWidth: number;
  linkedHeight: number;
  linkedLabel: string;
}

export function BandwidthCalculator({ linkedWidth, linkedHeight, linkedLabel }: BandwidthCalculatorProps): JSX.Element {
  const [sourceMode, setSourceMode] = useState<'screen' | 'manual'>('screen');
  const [input, setInput] = useState<VideoBandwidthInput>({
    width: linkedWidth,
    height: linkedHeight,
    refreshRate: 60,
    bitsPerComponent: 10,
    chroma: 'rgb-444',
    blankingPercent: 3,
    dscRatio: 1
  });
  useEffect(() => {
    if (sourceMode !== 'screen') return;
    setInput((current) => ({ ...current, width: linkedWidth, height: linkedHeight }));
  }, [linkedWidth, linkedHeight, sourceMode]);
  const result = useMemo(() => calculateVideoBandwidth(input), [input]);
  const update = <K extends keyof VideoBandwidthInput>(key: K, value: VideoBandwidthInput[K]): void =>
    setInput((current) => ({ ...current, [key]: value }));
  const minimumHdmi = VIDEO_INTERFACE_MODES.find((mode) => mode.family === 'HDMI' && mode.payloadGbps >= result.requiredGbps);
  const minimumDp = VIDEO_INTERFACE_MODES.find((mode) => mode.family === 'DisplayPort' && mode.payloadGbps >= result.requiredGbps);

  return (
    <section className="bandwidth-calculator">
      <header>
        <div>
          <h2>Bandwidth Calculator</h2>
          <p>Оценка полосы видеосигнала для HDMI и DisplayPort.</p>
        </div>
        <strong>{result.requiredGbps.toFixed(2)} Гбит/с</strong>
      </header>
      <div className="bandwidth-inputs">
        <fieldset>
          <legend>Формат сигнала</legend>
          <div className="bandwidth-source-mode" role="group" aria-label="Источник разрешения">
            <button type="button" className={sourceMode === 'screen' ? 'is-active' : ''} onClick={() => setSourceMode('screen')}>Из параметров экрана</button>
            <button type="button" className={sourceMode === 'manual' ? 'is-active' : ''} onClick={() => setSourceMode('manual')}>Ручной ввод</button>
          </div>
          {sourceMode === 'screen' && (
            <p className="bandwidth-linked-screen">
              <span>{linkedLabel}</span>
              <strong>{linkedWidth} × {linkedHeight} px</strong>
            </p>
          )}
          <label>Готовое разрешение
            <select disabled={sourceMode === 'screen'} value={`${input.width}x${input.height}`} onChange={(event) => {
              const preset = RESOLUTION_PRESETS.find((item) => `${item[1]}x${item[2]}` === event.target.value);
              if (preset) setInput((current) => ({ ...current, width: preset[1], height: preset[2] }));
            }}>
              {RESOLUTION_PRESETS.map(([name, width, height]) => <option key={name} value={`${width}x${height}`}>{name} · {width} × {height}</option>)}
              {!RESOLUTION_PRESETS.some((item) => item[1] === input.width && item[2] === input.height) && <option value={`${input.width}x${input.height}`}>Пользовательское</option>}
            </select>
          </label>
          <div className="bandwidth-grid">
            <label>Ширина, px<input disabled={sourceMode === 'screen'} type="number" min={1} value={input.width} onChange={(event) => update('width', Math.max(1, Number(event.target.value)))} /></label>
            <label>Высота, px<input disabled={sourceMode === 'screen'} type="number" min={1} value={input.height} onChange={(event) => update('height', Math.max(1, Number(event.target.value)))} /></label>
            <label>Частота, Гц<input type="number" min={1} step={1} value={input.refreshRate} onChange={(event) => update('refreshRate', Math.max(1, Number(event.target.value)))} /></label>
            <label>Глубина цвета
              <select value={input.bitsPerComponent} onChange={(event) => update('bitsPerComponent', Number(event.target.value) as 8 | 10 | 12)}>
                <option value={8}>8 бит</option><option value={10}>10 бит</option><option value={12}>12 бит</option>
              </select>
            </label>
            <label>Цветовой формат
              <select value={input.chroma} onChange={(event) => update('chroma', event.target.value as ChromaFormat)}>
                <option value="rgb-444">RGB 4:4:4</option><option value="ycbcr-444">YCbCr 4:4:4</option>
                <option value="ycbcr-422">YCbCr 4:2:2</option><option value="ycbcr-420">YCbCr 4:2:0</option>
              </select>
            </label>
            <label>DSC
              <select value={input.dscRatio} onChange={(event) => update('dscRatio', Number(event.target.value) as 1 | 2 | 2.5 | 3)}>
                <option value={1}>Без DSC</option><option value={2}>2:1</option><option value={2.5}>2.5:1</option><option value={3}>3:1</option>
              </select>
            </label>
            <label>Blanking, %<input type="number" min={0} max={30} step={0.5} value={input.blankingPercent} onChange={(event) => update('blankingPercent', Math.min(30, Math.max(0, Number(event.target.value))))} /></label>
          </div>
        </fieldset>
        <div className="bandwidth-summary">
          <div><span>Бит на пиксель</span><b>{result.bitsPerPixel}</b></div>
          <div><span>Без сжатия</span><b>{result.uncompressedGbps.toFixed(2)} Гбит/с</b></div>
          <div><span>После DSC</span><b>{result.requiredGbps.toFixed(2)} Гбит/с</b></div>
          <div><span>Минимальный HDMI</span><b>{minimumHdmi?.label ?? 'Недостаточно полосы'}</b></div>
          <div><span>Минимальный DP</span><b>{minimumDp?.label ?? 'Недостаточно полосы'}</b></div>
        </div>
      </div>
      <div className="interface-results">
        {(['HDMI', 'DisplayPort'] as const).map((family) => (
          <div key={family}>
            <h3>{family}</h3>
            {VIDEO_INTERFACE_MODES.filter((mode) => mode.family === family).map((mode) => {
              const fits = mode.payloadGbps >= result.requiredGbps;
              const usage = result.requiredGbps / mode.payloadGbps * 100;
              return (
                <article key={mode.id} className={fits ? 'is-compatible' : 'is-overloaded'} title={mode.note}>
                  <div><strong>{mode.label}</strong><span>{mode.payloadGbps.toFixed(2)} полезных / {mode.rawGbps} физических Гбит/с</span></div>
                  <b>{fits ? `Подходит · ${usage.toFixed(0)}%` : `Не подходит · ${usage.toFixed(0)}%`}</b>
                  <i><span style={{ width: `${Math.min(100, usage)}%` }} /></i>
                </article>
              );
            })}
          </div>
        ))}
      </div>
      <p className="field-hint">Расчёт является инженерной оценкой. Фактическая поддержка зависит от GPU, дисплея, кабеля, таймингов, числа линий и реализованных производителем режимов FRL/UHBR/DSC.</p>
    </section>
  );
}
