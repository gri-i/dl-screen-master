import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PowerCalculator, type ScreenConfig } from './components/PowerCalculator';
import { TestPatternViewer, type ScreenHeaderSummary } from './components/TestPatternViewer';
import { SettingsApp } from './SettingsApp';
import type { CabinetPreset, PowerGridConfig, Project, ScreenInstance } from '@shared/types';
import { mergeUniquePresets } from '@shared/presetValidation';
import './styles.css';

const CUSTOM_PRESETS_KEY = 'wall-config-custom-presets';
const GRID_CONFIG_KEY = 'dl-screen-master-grid-config';
const DEFAULT_GRID_CONFIG: PowerGridConfig = {
  voltage: 230,
  phase: 'single',
  circuitBreakerAmps: 16,
  safetyMarginPercent: 20,
  powerFactor: .95
};
const DEFAULT_SCREEN_CONFIG: ScreenConfig = {
  presetId: '',
  cols: 6,
  rows: 4,
  emptyCabinetKeys: []
};

function readCustomPresets(): CabinetPreset[] {
  try {
    const value = window.localStorage.getItem(CUSTOM_PRESETS_KEY);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

export function App(): JSX.Element {
  const [activeSection, setActiveSection] = useState<'designer' | 'settings'>('designer');
  const [screenConfig, setScreenConfig] = useState(DEFAULT_SCREEN_CONFIG);
  const [addScreenSignal, setAddScreenSignal] = useState(0);
  const [clearScreensSignal, setClearScreensSignal] = useState(0);
  const [, setScreenSummaries] = useState<ScreenHeaderSummary[]>([]);
  const [customPresets, setCustomPresets] = useState<CabinetPreset[]>([]);
  const [projectScreens, setProjectScreens] = useState<ScreenInstance[]>([]);
  const [screensToLoad, setScreensToLoad] = useState<ScreenInstance[] | null>(null);
  const [projectLoadSignal, setProjectLoadSignal] = useState(0);
  const [projectName, setProjectName] = useState('Новый проект');
  const [projectPath, setProjectPath] = useState<string | undefined>();
  const [projectCreatedAt, setProjectCreatedAt] = useState(() => new Date().toISOString());
  const [projectStatus, setProjectStatus] = useState('');
  const [gridConfig, setGridConfig] = useState<PowerGridConfig>(() => {
    try {
      const stored = window.localStorage.getItem(GRID_CONFIG_KEY);
      return stored ? { ...DEFAULT_GRID_CONFIG, ...JSON.parse(stored) } : DEFAULT_GRID_CONFIG;
    } catch {
      return DEFAULT_GRID_CONFIG;
    }
  });
  const presets = useMemo(() => customPresets, [customPresets]);
  const handleProjectScreensChange = useCallback((screens: ScreenInstance[]) => {
    setProjectScreens(screens);
  }, []);

  function newProject(): void {
    setProjectName('Новый проект');
    setProjectPath(undefined);
    setProjectCreatedAt(new Date().toISOString());
    setScreensToLoad([]);
    setProjectLoadSignal((value) => value + 1);
    setProjectStatus('Создан новый проект');
  }

  async function openProject(): Promise<void> {
    try {
      const result = await window.projectFiles.open();
      if (!result) return;
      const project = result.project;
      if (project.format !== 'dl-screen-master-project' || project.version !== 1 || !Array.isArray(project.screens)) {
        throw new Error('Неподдерживаемый формат проекта');
      }
      const nextPresets = Array.isArray(project.customPresets) ? project.customPresets : [];
      setCustomPresets(nextPresets);
      await window.presetFiles.save(nextPresets);
      setProjectName(project.name || 'Без названия');
      setProjectPath(result.filePath);
      setProjectCreatedAt(project.createdAt || new Date().toISOString());
      setScreensToLoad(project.screens);
      setProjectLoadSignal((value) => value + 1);
      setProjectStatus(`Открыт: ${result.filePath}`);
    } catch (error) {
      setProjectStatus(error instanceof Error ? error.message : 'Не удалось открыть проект');
    }
  }

  async function saveProject(): Promise<void> {
    const now = new Date().toISOString();
    const project: Project = {
      format: 'dl-screen-master-project',
      version: 1,
      name: projectName,
      createdAt: projectCreatedAt,
      updatedAt: now,
      screens: projectScreens,
      customPresets
    };
    try {
      const savedPath = await window.projectFiles.save(project, projectPath);
      if (!savedPath) return;
      setProjectPath(savedPath);
      setProjectStatus(`Сохранено: ${savedPath}`);
    } catch (error) {
      setProjectStatus(error instanceof Error ? error.message : 'Не удалось сохранить проект');
    }
  }

  function importPresets(imported: CabinetPreset[]): void {
    try {
      const next = mergeUniquePresets(customPresets, imported, { skipDuplicates: true });
      void window.presetFiles.save(next);
      setCustomPresets(next);
    } catch (error) {
      setProjectStatus(error instanceof Error ? error.message : 'Не удалось импортировать пресеты');
    }
  }

  useEffect(() => {
    void window.presetFiles.load().then(async (stored) => {
      if (stored.length > 0) setCustomPresets(stored);
      else {
        const legacy = readCustomPresets();
        if (legacy.length > 0) {
          setCustomPresets(legacy);
          await window.presetFiles.save(legacy);
        }
      }
      window.localStorage.removeItem(CUSTOM_PRESETS_KEY);
    }).catch((error) => setProjectStatus(error instanceof Error ? error.message : 'Не удалось загрузить пресеты'));
  }, []);

  useEffect(() => {
    setScreenConfig((current) => {
      if (presets.some((preset) => preset.id === current.presetId)) return current;
      return { ...current, presetId: presets[0]?.id ?? '' };
    });
  }, [presets]);

  useEffect(() => {
    window.localStorage.setItem(GRID_CONFIG_KEY, JSON.stringify(gridConfig));
  }, [gridConfig]);

  return (
    <>
    <div className="app-shell" hidden={activeSection !== 'designer'}>
      <header className="app-header">
        <div className="brand">DL_SCREEN MASTER</div>
        <div className="project-toolbar">
          <button type="button" onClick={newProject}>Новый</button>
          <button type="button" onClick={() => void openProject()}>Открыть</button>
          <button type="button" onClick={() => void saveProject()}>Сохранить</button>
          <input
            aria-label="Название проекта"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
          {projectStatus && <span title={projectStatus}>{projectStatus}</span>}
        </div>
        <div className="header-spacer" />
        <button
          className="clear-screens-button"
          type="button"
          onClick={() => setClearScreensSignal((current) => current + 1)}
        >
          Очистить все
        </button>
        <button className="settings-button" type="button" onClick={() => setActiveSection('settings')}>
          Настройки
        </button>
      </header>

      <main className="designer-layout">
        <aside className="left-panel">
          <PowerCalculator screenConfig={screenConfig} onScreenConfigChange={setScreenConfig} presets={presets} gridConfig={gridConfig} />
          <button
            type="button"
            className="add-screen-left"
            disabled={presets.length === 0}
            onClick={() => setAddScreenSignal((current) => current + 1)}
          >
            Добавить экран на холст
          </button>
        </aside>
        {presets.length > 0 ? <TestPatternViewer
          projectName={projectName}
          screenConfig={screenConfig}
          onScreenConfigChange={setScreenConfig}
          onScreenSummariesChange={setScreenSummaries}
          addScreenSignal={addScreenSignal}
          clearScreensSignal={clearScreensSignal}
          presets={presets}
          onPresetsImport={importPresets}
          projectScreens={screensToLoad}
          projectLoadSignal={projectLoadSignal}
          onProjectScreensChange={handleProjectScreensChange}
        /> : (
          <section className="empty-preset-state">
            <div>
              <h1>База кабинетов пуста</h1>
              <p>Импортируйте RCFG/RCFGX или добавьте кабинет вручную в настройках.</p>
              <button type="button" onClick={() => setActiveSection('settings')}>Открыть настройки</button>
            </div>
          </section>
        )}
      </main>
    </div>
    {activeSection === 'settings' && (
      <SettingsApp
        onBack={() => setActiveSection('designer')}
        onPresetsChange={setCustomPresets}
        presets={customPresets}
        gridConfig={gridConfig}
        onGridConfigChange={setGridConfig}
      />
    )}
    </>
  );
}
