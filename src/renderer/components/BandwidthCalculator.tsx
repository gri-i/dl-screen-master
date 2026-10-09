import React, { useEffect, useMemo, useState } from 'react';
import {
  calculateVideoBandwidth,
  VIDEO_INTERFACE_MODES,
  type ChromaFormat,
  type VideoBandwidthInput
} from '@shared/videoBandwidth';
import { useT } from '../i18n/context';

const RESOLUTION_PRESETS = [
  ['Full HD', 1920, 1080],
  ['QHD', 2560, 1440],
  ['4K UHD', 3840, 2160],
  ['DCI 4K', 4096, 2160],
  ['5K', 5120, 2880],
  ['8K UHD', 7680, 4320],
  ['16K', 15360, 8640]
] as const;

// Заметка показывается во всплывающей подсказке только у тех режимов, для
// которых она реально задана в словаре — это не произвольный маппинг id,
// а единственный на сегодня кейс (HDMI 2.2 / FRL 16-18), поэтому отдельная
// проверка "есть ли перевод" не нужна: t() просто не находит лишние ключи.
const NOTE_KEY_BY_MODE_ID: Record<string, string> = { 'hdmi-2.2': 'bw.note.hdmi-2.2' };

export interface BandwidthCalculatorProps {
  linkedWidth: number;
  linkedHeight: number;
  linkedLabel: string;
}

export function BandwidthCalculator({ linkedWidth, linkedHeight, linkedLabel }: BandwidthCalculatorProps): JSX.Element {
  const t = useT();
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
          <p>{t('bw.subtitle')}</p>
        </div>
        <strong>{t('bw.requiredGbps', { value: result.requiredGbps.toFixed(2) })}</strong>
      </header>
      <div className="bandwidth-inputs">
        <fieldset>
          <legend>{t('bw.signalFormat')}</legend>
          <div className="bandwidth-source-mode" role="group" aria-label={t('bw.resolutionSourceAriaLabel')}>
            <button type="button" className={sourceMode === 'screen' ? 'is-active' : ''} onClick={() => setSourceMode('screen')}>{t('bw.fromScreen')}</button>
            <button type="button" className={sourceMode === 'manual' ? 'is-active' : ''} onClick={() => setSourceMode('manual')}>{t('bw.manualInput')}</button>
          </div>
          {sourceMode === 'screen' && (
            <p className="bandwidth-linked-screen">
              <span>{linkedLabel}</span>
              <strong>{linkedWidth} × {linkedHeight} px</strong>
            </p>
          )}
          <label>{t('bw.readyResolution')}
            <select disabled={sourceMode === 'screen'} value={`${input.width}x${input.height}`} onChange={(event) => {
              const preset = RESOLUTION_PRESETS.find((item) => `${item[1]}x${item[2]}` === event.target.value);
              if (preset) setInput((current) => ({ ...current, width: preset[1], height: preset[2] }));
            }}>
              {RESOLUTION_PRESETS.map(([name, width, height]) => <option key={name} value={`${width}x${height}`}>{name} · {width} × {height}</option>)}
              {!RESOLUTION_PRESETS.some((item) => item[1] === input.width && item[2] === input.height) && <option value={`${input.width}x${input.height}`}>{t('bw.custom')}</option>}
            </select>
          </label>
          <div className="bandwidth-grid">
            <label>{t('bw.widthPx')}<input disabled={sourceMode === 'screen'} type="number" min={1} value={input.width} onChange={(event) => update('width', Math.max(1, Number(event.target.value)))} /></label>
            <label>{t('bw.heightPx')}<input disabled={sourceMode === 'screen'} type="number" min={1} value={input.height} onChange={(event) => update('height', Math.max(1, Number(event.target.value)))} /></label>
            <label>{t('bw.refreshHz')}<input type="number" min={1} step={1} value={input.refreshRate} onChange={(event) => update('refreshRate', Math.max(1, Number(event.target.value)))} /></label>
            <label>{t('bw.colorDepth')}
              <select value={input.bitsPerComponent} onChange={(event) => update('bitsPerComponent', Number(event.target.value) as 8 | 10 | 12)}>
                <option value={8}>{t('bw.bits8')}</option><option value={10}>{t('bw.bits10')}</option><option value={12}>{t('bw.bits12')}</option>
              </select>
            </label>
            <label>{t('bw.colorFormat')}
              <select value={input.chroma} onChange={(event) => update('chroma', event.target.value as ChromaFormat)}>
                <option value="rgb-444">RGB 4:4:4</option><option value="ycbcr-444">YCbCr 4:4:4</option>
                <option value="ycbcr-422">YCbCr 4:2:2</option><option value="ycbcr-420">YCbCr 4:2:0</option>
              </select>
            </label>
            <label>DSC
              <select value={input.dscRatio} onChange={(event) => update('dscRatio', Number(event.target.value) as 1 | 2 | 2.5 | 3)}>
                <option value={1}>{t('bw.noDsc')}</option><option value={2}>2:1</option><option value={2.5}>2.5:1</option><option value={3}>3:1</option>
              </select>
            </label>
            <label>{t('bw.blankingPercent')}<input type="number" min={0} max={30} step={0.5} value={input.blankingPercent} onChange={(event) => update('blankingPercent', Math.min(30, Math.max(0, Number(event.target.value))))} /></label>
          </div>
        </fieldset>
        <div className="bandwidth-summary">
          <div><span>{t('bw.bitsPerPixel')}</span><b>{result.bitsPerPixel}</b></div>
          <div><span>{t('bw.uncompressed')}</span><b>{t('bw.gbps', { value: result.uncompressedGbps.toFixed(2) })}</b></div>
          <div><span>{t('bw.afterDsc')}</span><b>{t('bw.gbps', { value: result.requiredGbps.toFixed(2) })}</b></div>
          <div><span>{t('bw.minHdmi')}</span><b>{minimumHdmi?.label ?? t('bw.insufficientBandwidth')}</b></div>
          <div><span>{t('bw.minDp')}</span><b>{minimumDp?.label ?? t('bw.insufficientBandwidth')}</b></div>
        </div>
      </div>
      <div className="interface-results">
        {(['HDMI', 'DisplayPort'] as const).map((family) => (
          <div key={family}>
            <h3>{family}</h3>
            {VIDEO_INTERFACE_MODES.filter((mode) => mode.family === family).map((mode) => {
              const fits = mode.payloadGbps >= result.requiredGbps;
              const usage = result.requiredGbps / mode.payloadGbps * 100;
              const noteKey = NOTE_KEY_BY_MODE_ID[mode.id];
              return (
                <article key={mode.id} className={fits ? 'is-compatible' : 'is-overloaded'} title={noteKey ? t(noteKey) : undefined}>
                  <div><strong>{mode.label}</strong><span>{t('bw.usefulOfPhysical', { payload: mode.payloadGbps.toFixed(2), raw: mode.rawGbps })}</span></div>
                  <b>{t(fits ? 'bw.fits' : 'bw.notFits', { usage: usage.toFixed(0) })}</b>
                  <i><span style={{ width: `${Math.min(100, usage)}%` }} /></i>
                </article>
              );
            })}
          </div>
        ))}
      </div>
      <p className="field-hint">{t('bw.disclaimer')}</p>
    </section>
  );
}
