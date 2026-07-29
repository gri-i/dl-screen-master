import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PowerCalculator, type ScreenConfig } from './components/PowerCalculator';
import { TestPatternViewer, type ScreenHeaderSummary } from './components/TestPatternViewer';
import { SettingsApp } from './SettingsApp';
import { ProjectionMaskSection } from './sections/ProjectionMaskSection';
import { BandwidthCalculator } from './components/BandwidthCalculator';
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
  const [activeSection, setActiveSection] = useState<'workspace' | 'settings'>('workspace');
  const [workspaceSection, setWorkspaceSection] = useState<'pixel-mask' | 'wiring' | 'projection-mask' | 'calculator'>('pixel-mask');
  const [screenConfig, setScreenConfig] = useState(DEFAULT_SCREEN_CONFIG);
  const [addScreenSignal, setAddScreenSignal] = useState(0);
  const [clearScreensSignal, setClearScreensSignal] = useState(0);
  const [, setScreenSummaries] = useState<ScreenHeaderSummary[]>([]);
  const [customPresets, setCustomPresets] = useState<CabinetPreset[]>([]);
  const [sessionPresets, setSessionPresets] = useState<CabinetPreset[]>([]);
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
  const presets = useMemo(() => mergeUniquePresets(customPresets, sessionPresets, { skipDuplicates: true }), [customPresets, sessionPresets]);
  const calculatorPreset = presets.find((preset) => preset.id === screenConfig.presetId) ?? presets[0];
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
    setSessionPresets([]);
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
      setSessionPresets([]);
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

  function importSessionPresets(imported: CabinetPreset[]): void {
    setSessionPresets((current) => mergeUniquePresets(current, imported, { skipDuplicates: true }));
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
    <div className="app-shell" hidden={activeSection !== 'workspace'}>
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

      <main className="sectioned-layout">
        <nav className="section-navigation" aria-label="Разделы приложения">
          <button type="button" className={workspaceSection === 'pixel-mask' ? 'is-active' : ''} onClick={() => setWorkspaceSection('pixel-mask')}><b>▣</b><span>Пиксельная маска</span></button>
          <button type="button" className={workspaceSection === 'wiring' ? 'is-active' : ''} onClick={() => setWorkspaceSection('wiring')}><b>⌁</b><span>Расключение</span></button>
          <button type="button" className={workspaceSection === 'projection-mask' ? 'is-active' : ''} onClick={() => setWorkspaceSection('projection-mask')}><b>◫</b><span>Проекционные маски</span></button>
          <button type="button" className={workspaceSection === 'calculator' ? 'is-active' : ''} onClick={() => setWorkspaceSection('calculator')}><b>Σ</b><span>Калькулятор</span></button>
          <button type="button" className="nav-settings" onClick={() => setActiveSection('settings')}><b>⚙</b><span>Настройки</span></button>
        </nav>
        <div className="section-content">
          <div className="designer-layout" hidden={workspaceSection !== 'pixel-mask' && workspaceSection !== 'wiring'}>
            <aside className="left-panel">
              {workspaceSection === 'pixel-mask' ? (
                <>
                  <PowerCalculator screenConfig={screenConfig} onScreenConfigChange={setScreenConfig} presets={presets} gridConfig={gridConfig} />
                  <button type="button" className="add-screen-left" disabled={presets.length === 0} onClick={() => setAddScreenSignal((current) => current + 1)}>
                    Добавить экран на холст
                  </button>
                </>
              ) : (
                <section className="section-intro">
                  <h2>Расключение</h2>
                  <p>Выберите экран на холсте и настройте сигнальные порты или силовые цепи в правой панели.</p>
                  <p>Геометрия экранов общая с разделом «Пиксельная маска».</p>
                </section>
              )}
            </aside>
            {presets.length > 0 ? <TestPatternViewer
              projectName={projectName}
              workspaceMode={workspaceSection === 'wiring' ? 'wiring' : 'pixel-mask'}
              screenConfig={screenConfig}
              onScreenConfigChange={setScreenConfig}
              onScreenSummariesChange={setScreenSummaries}
              addScreenSignal={addScreenSignal}
              clearScreensSignal={clearScreensSignal}
              presets={presets}
              onPresetsImport={importSessionPresets}
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
          </div>
          {workspaceSection === 'projection-mask' && <ProjectionMaskSection />}
          {workspaceSection === 'calculator' && (
            <section className="calculator-section">
              <header><h1>Калькулятор</h1><p>Расчёт размеров, разрешения, веса и электропитания экрана.</p></header>
              <div className="calculator-dashboard">
                <PowerCalculator screenConfig={screenConfig} onScreenConfigChange={setScreenConfig} presets={presets} gridConfig={gridConfig} />
                <BandwidthCalculator
                  linkedWidth={(calculatorPreset?.resolutionX ?? 1) * screenConfig.cols}
                  linkedHeight={(calculatorPreset?.resolutionY ?? 1) * screenConfig.rows}
                  linkedLabel={calculatorPreset ? `${calculatorPreset.brand} ${calculatorPreset.model} · ${screenConfig.cols} × ${screenConfig.rows} кабинетов` : 'Экран без пресета'}
                />
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
    {activeSection === 'settings' && (
      <SettingsApp
        onBack={() => setActiveSection('workspace')}
        onPresetsChange={setCustomPresets}
        presets={customPresets}
        gridConfig={gridConfig}
        onGridConfigChange={setGridConfig}
      />
    )}
    </>
  );
}
