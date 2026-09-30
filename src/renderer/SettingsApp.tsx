import React, { useEffect, useState } from 'react';
import type { CabinetPreset, PowerGridConfig, UiSkin } from '@shared/types';
import { mergeUniquePresets, validatePreset } from '@shared/presetValidation';
import './styles.css';

const INITIAL_FORM = {
  brand: '', model: '', widthMm: 500, heightMm: 500, pixelPitchMm: 3.9,
  resolutionX: 128, resolutionY: 128, weightKg: 6, maxPowerW: 200, avgPowerW: 80,
  receiverCardName: ''
};

const UI_SKIN_OPTIONS: { id: UiSkin; label: string; accent: string; bg: string }[] = [
  { id: 'vscode', label: 'VS Code', accent: '#007acc', bg: '#1e1e1e' },
  { id: 'corporate', label: 'Корпоративный', accent: '#2e5a8f', bg: '#10151c' },
  { id: 'midnight', label: 'Полночь', accent: '#5b8cff', bg: '#0c0e13' },
  { id: 'carbon', label: 'Карбон', accent: '#7aa2ff', bg: '#0a0a0c' },
  { id: 'graphite', label: 'Графит', accent: '#6ea8fe', bg: '#15171b' },
  { id: 'ocean', label: 'Океан', accent: '#38bdf8', bg: '#07131a' },
  { id: 'forest', label: 'Лес', accent: '#4ade80', bg: '#0a130e' },
  { id: 'plum', label: 'Слива', accent: '#c77dff', bg: '#110b16' }
];

interface SettingsAppProps {
  onBack?: () => void;
  onPresetsChange?: (presets: CabinetPreset[]) => void;
  presets: CabinetPreset[];
  gridConfig: PowerGridConfig;
  onGridConfigChange: (config: PowerGridConfig) => void;
  uiSkin: UiSkin;
  onUiSkinChange: (skin: UiSkin) => void;
}

export function SettingsApp({ onBack, onPresetsChange, presets: initialPresets, gridConfig, onGridConfigChange, uiSkin, onUiSkinChange }: SettingsAppProps): JSX.Element {
  const [presets, setPresets] = useState<CabinetPreset[]>(initialPresets);
  const [form, setForm] = useState(INITIAL_FORM);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => setPresets(initialPresets), [initialPresets]);

  function updateField(field: keyof typeof INITIAL_FORM, value: string): void {
    setForm((current) => ({
      ...current,
      [field]: field === 'brand' || field === 'model' || field === 'receiverCardName' ? value : Number(value)
    }));
  }

  function persist(next: CabinetPreset[]): void {
    setPresets(next);
    onPresetsChange?.(next);
    void window.presetFiles.save(next).catch((error) => setStatus(error instanceof Error ? error.message : 'Ошибка сохранения'));
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
    const errors = validatePreset(preset);
    if (errors.length) {
      setStatus(errors.join('; '));
      return;
    }
    try {
      if (editingPresetId) {
        const others = presets.filter((item) => item.id !== editingPresetId);
        persist(mergeUniquePresets(others, [preset]));
      } else {
        persist(mergeUniquePresets(presets, [preset]));
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Дубликат пресета');
      return;
    }
    setForm(INITIAL_FORM);
    setEditingPresetId(null);
    setStatus(editingPresetId ? 'Кабинет обновлён' : 'Кабинет добавлен');
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
    setStatus(`Редактирование: ${preset.brand} ${preset.model}`);
  }

  async function importPresetFile(): Promise<void> {
    try {
      const imported = await window.presetFiles.import();
      if (!imported) return;
      persist(mergeUniquePresets(presets, imported));
      setStatus(`Импортировано: ${imported.length}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Ошибка импорта');
    }
  }

  async function importRcfgFile(): Promise<void> {
    try {
      const imported = await window.presetFiles.importRcfg();
      if (!imported) return;
      persist(mergeUniquePresets(presets, [imported]));
      setStatus(`Импортирован RCFG: ${imported.brand} ${imported.model}. Проверьте вес и мощность.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Ошибка импорта RCFG');
    }
  }

  async function exportPresetFile(): Promise<void> {
    try {
      const filePath = await window.presetFiles.export(presets);
      if (filePath) setStatus(`Экспортировано: ${filePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Ошибка экспорта');
    }
  }

  return (
    <main className="settings-app">
      <header className="settings-header">
        <div><div className="brand">DL_SCREEN MASTER</div><p>Настройки приложения</p></div>
        {onBack && <button type="button" onClick={onBack}>Вернуться к редактору</button>}
      </header>
      <section className="settings-section">
        <h1>Оформление</h1>
        <p className="field-hint">Цветовая тема интерфейса (DreamLaser Design System). Применяется сразу и сохраняется между запусками.</p>
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
              <span>{skin.label}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <h1>Электросеть</h1>
        <div className="grid-settings-form">
          <label>
            {gridConfig.phase === 'three' ? 'Линейное напряжение, В' : 'Напряжение, В'}
            <input type="number" min={1} value={gridConfig.voltage} onChange={(event) => onGridConfigChange({ ...gridConfig, voltage: Number(event.target.value) })} />
          </label>
          {gridConfig.phase === 'three' && <p className="field-hint">Для сети 400/230 В укажите 400 В.</p>}
          <label>
            Фаза
            <select value={gridConfig.phase} onChange={(event) => {
              const phase = event.target.value as 'single' | 'three';
              const voltage = phase === 'three' && gridConfig.voltage === 230
                ? 400
                : phase === 'single' && gridConfig.voltage === 400 ? 230 : gridConfig.voltage;
              onGridConfigChange({ ...gridConfig, phase, voltage });
            }}>
              <option value="single">Однофазная</option>
              <option value="three">Трёхфазная</option>
            </select>
          </label>
          <label>
            Коэффициент мощности (cos φ)
            <input type="number" min={0.01} max={1} step={0.01} value={gridConfig.powerFactor} onChange={(event) => onGridConfigChange({ ...gridConfig, powerFactor: Number(event.target.value) })} />
          </label>
          <label>
            Номинал автомата, А
            <input type="number" min={1} value={gridConfig.circuitBreakerAmps} onChange={(event) => onGridConfigChange({ ...gridConfig, circuitBreakerAmps: Number(event.target.value) })} />
          </label>
        </div>
      </section>
      <section className="settings-section">
        <h1>Библиотека экранов</h1>
        <p className="field-hint">Кабинетов в базе: {presets.length}. Изменения сразу отображаются в основном окне.</p>
        <div className="preset-file-actions">
          <button type="button" onClick={() => void importRcfgFile()}>Импорт RCFG / RCFGX</button>
          <button type="button" onClick={() => void importPresetFile()}>Импорт JSON</button>
          <button type="button" onClick={() => void exportPresetFile()} disabled={presets.length === 0}>Экспорт JSON</button>
          <button type="button" className="danger-button" onClick={() => {
            if (presets.length === 0 || window.confirm('Удалить все пользовательские кабинеты из базы?')) {
              persist([]);
              setStatus('Пользовательская база кабинетов очищена');
            }
          }} disabled={presets.length === 0}>Очистить базу</button>
          {status && <span role="status">{status}</span>}
        </div>
        {presets.length > 0 && (
          <div className="preset-list">
            {presets.map((preset) => (
              <div className="preset-item" key={preset.id}>
                <span>
                  <strong>{preset.brand} {preset.model}</strong><br />
                  {preset.widthMm} × {preset.heightMm} мм · {preset.resolutionX} × {preset.resolutionY} px · pitch {preset.pixelPitchMm} мм
                  {preset.receiverCardName && <small>Приёмная карта: {preset.receiverCardName}</small>}
                </span>
                <span className="preset-item-actions">
                  <button type="button" onClick={() => editPreset(preset)}>Редактировать</button>
                  <button type="button" onClick={() => persist(presets.filter((item) => item.id !== preset.id))}>Удалить</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="settings-section">
        <h2>{editingPresetId ? 'Редактировать кабинет' : 'Добавить кабинет'}</h2>
        <form className="preset-form" onSubmit={addPreset}>
          <label>Бренд<input required value={form.brand} onChange={(e) => updateField('brand', e.target.value)} /></label>
          <label>Модель<input required value={form.model} onChange={(e) => updateField('model', e.target.value)} /></label>
          <label>Ширина, мм<input type="number" value={form.widthMm} onChange={(e) => updateField('widthMm', e.target.value)} /></label>
          <label>Высота, мм<input type="number" value={form.heightMm} onChange={(e) => updateField('heightMm', e.target.value)} /></label>
          <label>Шаг пикселя, мм<input type="number" step="0.1" value={form.pixelPitchMm} onChange={(e) => updateField('pixelPitchMm', e.target.value)} /></label>
          <label>Разрешение X, px<input type="number" value={form.resolutionX} onChange={(e) => updateField('resolutionX', e.target.value)} /></label>
          <label>Разрешение Y, px<input type="number" value={form.resolutionY} onChange={(e) => updateField('resolutionY', e.target.value)} /></label>
          <label>Вес, кг<input type="number" step="0.1" value={form.weightKg} onChange={(e) => updateField('weightKg', e.target.value)} /></label>
          <label>Макс. мощность, Вт<input type="number" value={form.maxPowerW} onChange={(e) => updateField('maxPowerW', e.target.value)} /></label>
          <label>Средняя мощность, Вт<input type="number" value={form.avgPowerW} onChange={(e) => updateField('avgPowerW', e.target.value)} /></label>
          <div className="preset-form-actions">
            <button type="submit">{editingPresetId ? 'Сохранить изменения' : 'Добавить кабинет'}</button>
            {editingPresetId && <button type="button" onClick={() => { setEditingPresetId(null); setForm(INITIAL_FORM); setStatus(''); }}>Отмена</button>}
          </div>
        </form>
      </section>
    </main>
  );
}
