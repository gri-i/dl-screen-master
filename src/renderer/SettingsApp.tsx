import React, { useEffect, useState } from 'react';
import type { CabinetPreset, PowerGridConfig, UiSkin } from '@shared/types';
import type { Lang } from '@shared/lang';
import { mergeUniquePresets, validatePreset } from '@shared/presetValidation';
import { useLanguage } from './i18n/context';
import './styles.css';

const INITIAL_FORM = {
  brand: '', model: '', widthMm: 500, heightMm: 500, pixelPitchMm: 3.9,
  resolutionX: 128, resolutionY: 128, weightKg: 6, maxPowerW: 200, avgPowerW: 80,
  receiverCardName: ''
};

const UI_SKIN_OPTIONS: { id: UiSkin; labelKey: string; accent: string; bg: string }[] = [
  { id: 'vscode', labelKey: 'settings.skin.vscode', accent: '#007acc', bg: '#1e1e1e' },
  { id: 'corporate', labelKey: 'settings.skin.corporate', accent: '#2e5a8f', bg: '#10151c' },
  { id: 'midnight', labelKey: 'settings.skin.midnight', accent: '#5b8cff', bg: '#0c0e13' },
  { id: 'carbon', labelKey: 'settings.skin.carbon', accent: '#7aa2ff', bg: '#0a0a0c' },
  { id: 'graphite', labelKey: 'settings.skin.graphite', accent: '#6ea8fe', bg: '#15171b' },
  { id: 'ocean', labelKey: 'settings.skin.ocean', accent: '#38bdf8', bg: '#07131a' },
  { id: 'forest', labelKey: 'settings.skin.forest', accent: '#4ade80', bg: '#0a130e' },
  { id: 'plum', labelKey: 'settings.skin.plum', accent: '#c77dff', bg: '#110b16' }
];

interface SettingsAppProps {
  onBack?: () => void;
  onPresetsChange?: (presets: CabinetPreset[]) => void;
  presets: CabinetPreset[];
  gridConfig: PowerGridConfig;
  onGridConfigChange: (config: PowerGridConfig) => void;
  uiSkin: UiSkin;
  onUiSkinChange: (skin: UiSkin) => void;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
}

export function SettingsApp({
  onBack, onPresetsChange, presets: initialPresets, gridConfig, onGridConfigChange,
  uiSkin, onUiSkinChange, lang, onLangChange
}: SettingsAppProps): JSX.Element {
  const { t } = useLanguage();
  const [presets, setPresets] = useState<CabinetPreset[]>(initialPresets);
  const [form, setForm] = useState(INITIAL_FORM);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  // Ширина/высота в мм по умолчанию подставляются как Разрешение × Шаг
  // пикселя (самый частый случай), но кабинет может иметь рамку/крепёж,
  // из-за которых физический габарит больше пиксельной области — поэтому
  // как только пользователь редактирует ширину/высоту вручную, автоподстановка
  // для этого поля отключается и дальнейшие правки разрешения/шага его не трогают.
  const [dimensionsTouched, setDimensionsTouched] = useState({ width: false, height: false });

  useEffect(() => setPresets(initialPresets), [initialPresets]);

  function updateField(field: keyof typeof INITIAL_FORM, value: string): void {
    if (field === 'widthMm' || field === 'heightMm') {
      setDimensionsTouched((current) => ({ ...current, [field === 'widthMm' ? 'width' : 'height']: true }));
    }
    setForm((current) => {
      const next = {
        ...current,
        [field]: field === 'brand' || field === 'model' || field === 'receiverCardName' ? value : Number(value)
      };
      if (!dimensionsTouched.width && (field === 'resolutionX' || field === 'pixelPitchMm')) {
        next.widthMm = Number((next.resolutionX * next.pixelPitchMm).toFixed(2));
      }
      if (!dimensionsTouched.height && (field === 'resolutionY' || field === 'pixelPitchMm')) {
        next.heightMm = Number((next.resolutionY * next.pixelPitchMm).toFixed(2));
      }
      return next;
    });
  }

  function persist(next: CabinetPreset[]): void {
    setPresets(next);
    onPresetsChange?.(next);
    void window.presetFiles.save(next).catch((error) => setStatus(error instanceof Error ? error.message : t('settings.library.saveError')));
  }

  function addPreset(event: React.FormEvent): void {
    event.preventDefault();
    if (!form.brand.trim() || !form.model.trim()) return;
    const id = editingPresetId ?? `custom-${form.brand}-${form.model}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const preset: CabinetPreset = {
      id,
      ...form,
      brand: form.brand.trim(),
      model: form.model.trim(),
      receiverCardName: form.receiverCardName.trim() || undefined
    };
    const errors = validatePreset(preset, lang);
    if (errors.length) {
      setStatus(errors.join('; '));
      return;
    }
    try {
      if (editingPresetId) {
        const others = presets.filter((item) => item.id !== editingPresetId);
        persist(mergeUniquePresets(others, [preset], { lang }));
      } else {
        persist(mergeUniquePresets(presets, [preset], { lang }));
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t('settings.library.duplicate'));
      return;
    }
    setForm(INITIAL_FORM);
    setEditingPresetId(null);
    setDimensionsTouched({ width: false, height: false });
    setStatus(editingPresetId ? t('settings.library.presetUpdated') : t('settings.library.presetAdded'));
  }

  function editPreset(preset: CabinetPreset): void {
    setEditingPresetId(preset.id);
    setForm({
      brand: preset.brand,
      model: preset.model,
      widthMm: preset.widthMm,
      heightMm: preset.heightMm,
      pixelPitchMm: preset.pixelPitchMm,
      resolutionX: preset.resolutionX,
      resolutionY: preset.resolutionY,
      weightKg: preset.weightKg,
      maxPowerW: preset.maxPowerW,
      avgPowerW: preset.avgPowerW,
      receiverCardName: preset.receiverCardName ?? ''
    });
    // Сохранённые мм уже могут отличаться от Разрешение × Шаг (рамка,
    // ручная правка) — считаем их осознанным значением и не перезаписываем
    // при последующих правках разрешения/шага пикселя в этой сессии редактирования.
    setDimensionsTouched({ width: true, height: true });
    setStatus(t('settings.library.editing', { brand: preset.brand, model: preset.model }));
  }

  async function importPresetFile(): Promise<void> {
    try {
      const imported = await window.presetFiles.import();
      if (!imported) return;
      persist(mergeUniquePresets(presets, imported, { lang }));
      setStatus(t('settings.library.imported', { count: imported.length }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t('settings.library.importError'));
    }
  }

  async function importRcfgFile(): Promise<void> {
    try {
      const imported = await window.presetFiles.importRcfg();
      if (!imported) return;
      persist(mergeUniquePresets(presets, [imported], { lang }));
      setStatus(t('settings.library.importedRcfg', { brand: imported.brand, model: imported.model }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t('settings.library.importRcfgError'));
    }
  }

  async function exportPresetFile(): Promise<void> {
    try {
      const filePath = await window.presetFiles.export(presets);
      if (filePath) setStatus(t('settings.library.exported', { path: filePath }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t('settings.library.exportError'));
    }
  }

  return (
    <main className="settings-app">
      <header className="settings-header">
        <div><div className="brand">DL_SCREEN MASTER</div><p>{t('settings.subtitle')}</p></div>
        {onBack && <button type="button" onClick={onBack}>{t('settings.back')}</button>}
      </header>
      <section className="settings-section">
        <h1>{t('settings.appearance.title')}</h1>
        <p className="field-hint">{t('settings.appearance.hint')}</p>
        <div className="skin-picker">
          {UI_SKIN_OPTIONS.map((skin) => (
            <button
              key={skin.id}
              type="button"
              className={skin.id === uiSkin ? 'is-active' : ''}
              onClick={() => onUiSkinChange(skin.id)}
              style={{ '--skin-bg': skin.bg, '--skin-accent': skin.accent } as React.CSSProperties}
            >
              <i />
              <span>{t(skin.labelKey)}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <h1>{t('settings.language.title')}</h1>
        <p className="field-hint">{t('settings.language.hint')}</p>
        <div className="skin-picker">
          <button type="button" className={lang === 'ru' ? 'is-active' : ''} onClick={() => onLangChange('ru')}>
            <span>{t('settings.language.ru')}</span>
          </button>
          <button type="button" className={lang === 'en' ? 'is-active' : ''} onClick={() => onLangChange('en')}>
            <span>{t('settings.language.en')}</span>
          </button>
        </div>
      </section>
      <section className="settings-section">
        <h1>{t('settings.grid.title')}</h1>
        <div className="grid-settings-form">
          <label>
            {gridConfig.phase === 'three' ? t('settings.grid.voltageThreePhase') : t('settings.grid.voltageSinglePhase')}
            <input type="number" min={1} value={gridConfig.voltage} onChange={(event) => onGridConfigChange({ ...gridConfig, voltage: Number(event.target.value) })} />
          </label>
          {gridConfig.phase === 'three' && <p className="field-hint">{t('settings.grid.voltageHint')}</p>}
          <label>
            {t('settings.grid.phase')}
            <select value={gridConfig.phase} onChange={(event) => {
              const phase = event.target.value as 'single' | 'three';
              const voltage = phase === 'three' && gridConfig.voltage === 230
                ? 400
                : phase === 'single' && gridConfig.voltage === 400 ? 230 : gridConfig.voltage;
              onGridConfigChange({ ...gridConfig, phase, voltage });
            }}>
              <option value="single">{t('settings.grid.phase.single')}</option>
              <option value="three">{t('settings.grid.phase.three')}</option>
            </select>
          </label>
          <label>
            {t('settings.grid.powerFactor')}
            <input type="number" min={0.01} max={1} step={0.01} value={gridConfig.powerFactor} onChange={(event) => onGridConfigChange({ ...gridConfig, powerFactor: Number(event.target.value) })} />
          </label>
          <label>
            {t('settings.grid.breakerAmps')}
            <input type="number" min={1} value={gridConfig.circuitBreakerAmps} onChange={(event) => onGridConfigChange({ ...gridConfig, circuitBreakerAmps: Number(event.target.value) })} />
          </label>
        </div>
      </section>
      <section className="settings-section">
        <h1>{t('settings.library.title')}</h1>
        <p className="field-hint">{t('settings.library.hint', { count: presets.length })}</p>
        <div className="preset-file-actions">
          <button type="button" onClick={() => void importRcfgFile()}>{t('settings.library.importRcfg')}</button>
          <button type="button" onClick={() => void importPresetFile()}>{t('settings.library.importJson')}</button>
          <button type="button" onClick={() => void exportPresetFile()} disabled={presets.length === 0}>{t('settings.library.exportJson')}</button>
          <button type="button" className="danger-button" onClick={() => {
            if (presets.length === 0 || window.confirm(t('settings.library.clearConfirm'))) {
              persist([]);
              setStatus(t('settings.library.cleared'));
            }
          }} disabled={presets.length === 0}>{t('settings.library.clear')}</button>
          {status && <span role="status">{status}</span>}
        </div>
        {presets.length > 0 && (
          <div className="preset-list">
            {presets.map((preset) => (
              <div className="preset-item" key={preset.id}>
                <span>
                  <strong>{preset.brand} {preset.model}</strong><br />
                  {t('settings.library.presetSummary', {
                    width: preset.widthMm, height: preset.heightMm,
                    resolutionX: preset.resolutionX, resolutionY: preset.resolutionY,
                    pitch: preset.pixelPitchMm
                  })}
                  {preset.receiverCardName && <small>{t('settings.library.receiverCard', { name: preset.receiverCardName })}</small>}
                </span>
                <span className="preset-item-actions">
                  <button type="button" onClick={() => editPreset(preset)}>{t('settings.library.edit')}</button>
                  <button type="button" onClick={() => persist(presets.filter((item) => item.id !== preset.id))}>{t('settings.library.delete')}</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="settings-section">
        <h2>{editingPresetId ? t('settings.form.editTitle') : t('settings.form.addTitle')}</h2>
        <form className="preset-form" onSubmit={addPreset}>
          <label>{t('settings.form.brand')}<input required value={form.brand} onChange={(e) => updateField('brand', e.target.value)} /></label>
          <label>{t('settings.form.model')}<input required value={form.model} onChange={(e) => updateField('model', e.target.value)} /></label>
          <label>{t('settings.form.pixelPitch')}<input type="number" step="0.1" value={form.pixelPitchMm} onChange={(e) => updateField('pixelPitchMm', e.target.value)} /></label>
          <label>{t('settings.form.resolutionX')}<input type="number" value={form.resolutionX} onChange={(e) => updateField('resolutionX', e.target.value)} /></label>
          <label>{t('settings.form.resolutionY')}<input type="number" value={form.resolutionY} onChange={(e) => updateField('resolutionY', e.target.value)} /></label>
          <label>{t('settings.form.widthMm')}<input type="number" value={form.widthMm} onChange={(e) => updateField('widthMm', e.target.value)} title={t('settings.form.widthMmHint')} /></label>
          <label>{t('settings.form.heightMm')}<input type="number" value={form.heightMm} onChange={(e) => updateField('heightMm', e.target.value)} title={t('settings.form.heightMmHint')} /></label>
          <label>{t('settings.form.weightKg')}<input type="number" step="0.1" value={form.weightKg} onChange={(e) => updateField('weightKg', e.target.value)} /></label>
          <label>{t('settings.form.maxPowerW')}<input type="number" value={form.maxPowerW} onChange={(e) => updateField('maxPowerW', e.target.value)} /></label>
          <label>{t('settings.form.avgPowerW')}<input type="number" value={form.avgPowerW} onChange={(e) => updateField('avgPowerW', e.target.value)} /></label>
          <div className="preset-form-actions">
            <button type="submit">{editingPresetId ? t('settings.form.saveChanges') : t('settings.form.addCabinet')}</button>
            {editingPresetId && <button type="button" onClick={() => { setEditingPresetId(null); setForm(INITIAL_FORM); setDimensionsTouched({ width: false, height: false }); setStatus(''); }}>{t('settings.form.cancel')}</button>}
          </div>
        </form>
      </section>
    </main>
  );
}
