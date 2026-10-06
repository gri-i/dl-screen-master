import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PowerCalculator, type ScreenConfig } from './components/PowerCalculator';
import { TestPatternViewer, type ScreenHeaderSummary } from './components/TestPatternViewer';
import { SettingsApp } from './SettingsApp';
import { ProjectionMaskSection } from './sections/ProjectionMaskSection';
import { BandwidthCalculator } from './components/BandwidthCalculator';
import type { CabinetPreset, PowerGridConfig, Project, ScreenInstance, UiSkin } from '@shared/types';
import { mergeUniquePresets } from '@shared/presetValidation';
import { useLanguage } from './i18n/context';
import './styles.css';

const CUSTOM_PRESETS_KEY = 'wall-config-custom-presets';
const GRID_CONFIG_KEY = 'dl-screen-master-grid-config';
const UI_SKIN_KEY = 'dl-screen-master-ui-skin';
const DEFAULT_UI_SKIN: UiSkin = 'ocean';
const UI_SKINS: UiSkin[] = ['vscode', 'corporate', 'midnight', 'carbon', 'graphite', 'ocean', 'forest', 'plum'];

function readUiSkin(): UiSkin {
  try {
    const stored = window.localStorage.getItem(UI_SKIN_KEY);
    return stored && (UI_SKINS as string[]).includes(stored) ? (stored as UiSkin) : DEFAULT_UI_SKIN;
  } catch {
    return DEFAULT_UI_SKIN;
  }
}
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
  const { t, lang, setLang } = useLanguage();
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
  const [projectName, setProjectName] = useState(() => t('app.newProjectName'));
  const [projectPath, setProjectPath] = useState<string | undefined>();
  const [projectCreatedAt, setProjectCreatedAt] = useState(() => new Date().toISOString());
  const [projectStatus, setProjectStatus] = useState('');
  const [uiSkin, setUiSkin] = useState<UiSkin>(readUiSkin);
  const [gridConfig, setGridConfig] = useState<PowerGridConfig>(() => {
    try {
      const stored = window.localStorage.getItem(GRID_CONFIG_KEY);
      return stored ? { ...DEFAULT_GRID_CONFIG, ...JSON.parse(stored) } : DEFAULT_GRID_CONFIG;
    } catch {
      return DEFAULT_GRID_CONFIG;
    }
  });
  const presets = useMemo(() => mergeUniquePresets(customPresets, sessionPresets, { skipDuplicates: true, lang }), [customPresets, sessionPresets]);
  const calculatorPreset = presets.find((preset) => preset.id === screenConfig.presetId) ?? presets[0];
  const handleProjectScreensChange = useCallback((screens: ScreenInstance[]) => {
    setProjectScreens(screens);
  }, []);

  function newProject(): void {
    setProjectName(t('app.newProjectName'));
    setProjectPath(undefined);
    setProjectCreatedAt(new Date().toISOString());
    setScreensToLoad([]);
    setProjectLoadSignal((value) => value + 1);
    setProjectStatus(t('app.status.newProject'));
    setSessionPresets([]);
  }

  async function openProject(): Promise<void> {
    try {
      const result = await window.projectFiles.open();
      if (!result) return;
      const project = result.project;
      if (project.format !== 'dl-screen-master-project' || project.version !== 1 || !Array.isArray(project.screens)) {
        throw new Error(t('app.status.unsupportedFormat'));
      }
      const nextPresets = Array.isArray(project.customPresets) ? project.customPresets : [];
      setCustomPresets(nextPresets);
      setSessionPresets([]);
      await window.presetFiles.save(nextPresets);
      setProjectName(project.name || t('app.status.untitled'));
      setProjectPath(result.filePath);
      setProjectCreatedAt(project.createdAt || new Date().toISOString());
      setScreensToLoad(project.screens);
      setProjectLoadSignal((value) => value + 1);
      setProjectStatus(t('app.status.opened', { path: result.filePath }));
    } catch (error) {
      setProjectStatus(error instanceof Error ? error.message : t('app.status.openFailed'));
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
      setProjectStatus(t('app.status.saved', { path: savedPath }));
    } catch (error) {
      setProjectStatus(error instanceof Error ? error.message : t('app.status.saveFailed'));
    }
  }

  function importSessionPresets(imported: CabinetPreset[]): void {
    // Проверяем синхронно: исключение из updater-функции React иначе
    // приводит к падению всего интерфейса, а не к сообщению об импорте.
    mergeUniquePresets([], imported, { skipDuplicates: true, lang });
    setSessionPresets((current) => mergeUniquePresets(current, imported, { skipDuplicates: true, lang }));
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
    }).catch((error) => setProjectStatus(error instanceof Error ? error.message : t('app.status.presetsLoadFailed')));
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

  useEffect(() => {
    document.documentElement.setAttribute('data-dl-skin', uiSkin);
    window.localStorage.setItem(UI_SKIN_KEY, uiSkin);
  }, [uiSkin]);

  return (
    <>
    <div className="app-shell" hidden={activeSection !== 'workspace'}>
      <header className="app-header">
        <div className="brand">DL_SCREEN MASTER</div>
        <div className="project-toolbar">
          <button type="button" onClick={newProject}>{t('app.new')}</button>
          <button type="button" onClick={() => void openProject()}>{t('app.open')}</button>
          <button type="button" onClick={() => void saveProject()}>{t('app.save')}</button>
          <input
            aria-label={t('app.projectNameLabel')}
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
          {projectStatus && <span title={projectStatus}>{projectStatus}</span>}
        </div>
        <nav className="section-navigation" aria-label={t('app.nav.ariaLabel')}>
          <button
            type="button"
            className={workspaceSection === 'pixel-mask' ? 'is-active' : ''}
            aria-label={t('app.nav.pixelMask')}
            title={t('app.nav.pixelMask')}
            onClick={() => setWorkspaceSection('pixel-mask')}
          >
            <b aria-hidden="true">▣</b>
          </button>
          <button
            type="button"
            className={workspaceSection === 'wiring' ? 'is-active' : ''}
            aria-label={t('app.nav.wiring')}
            title={t('app.nav.wiring')}
            onClick={() => setWorkspaceSection('wiring')}
          >
            <b aria-hidden="true">⌁</b>
          </button>
          <button
            type="button"
            className={workspaceSection === 'projection-mask' ? 'is-active' : ''}
            aria-label={t('app.nav.projectionMask')}
            title={t('app.nav.projectionMask')}
            onClick={() => setWorkspaceSection('projection-mask')}
          >
            <b aria-hidden="true">◫</b>
          </button>
          <button
            type="button"
            className={workspaceSection === 'calculator' ? 'is-active' : ''}
            aria-label={t('app.nav.calculator')}
            title={t('app.nav.calculator')}
            onClick={() => setWorkspaceSection('calculator')}
          >
            <b aria-hidden="true">Σ</b>
          </button>
        </nav>
        <div className="header-spacer" />
        <button
          className="clear-screens-button"
          type="button"
          onClick={() => setClearScreensSignal((current) => current + 1)}
        >
          {t('app.clearAll')}
        </button>
        <button className="settings-button" type="button" onClick={() => setActiveSection('settings')}>
          {t('app.settings')}
        </button>
      </header>

      <main className="sectioned-layout">
        <div className="section-content">
          <div className="designer-layout" hidden={workspaceSection !== 'pixel-mask' && workspaceSection !== 'wiring'}>
            <aside className="left-panel">
              {workspaceSection === 'pixel-mask' ? (
                <>
                  <PowerCalculator screenConfig={screenConfig} onScreenConfigChange={setScreenConfig} presets={presets} gridConfig={gridConfig} />
                  <button type="button" className="add-screen-left" disabled={presets.length === 0} onClick={() => setAddScreenSignal((current) => current + 1)}>
                    {t('app.addScreenToCanvas')}
                  </button>
                </>
              ) : (
                <section className="section-intro">
                  <h2>{t('app.wiringIntro.title')}</h2>
                  <p>{t('app.wiringIntro.p1')}</p>
                  <p>{t('app.wiringIntro.p2')}</p>
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
                  <h1>{t('app.emptyPresets.title')}</h1>
                  <p>{t('app.emptyPresets.body')}</p>
                  <button type="button" onClick={() => setActiveSection('settings')}>{t('app.emptyPresets.openSettings')}</button>
                </div>
              </section>
            )}
          </div>
          {workspaceSection === 'projection-mask' && <ProjectionMaskSection />}
          {workspaceSection === 'calculator' && (
            <section className="calculator-section">
              <header><h1>{t('app.calculator.title')}</h1><p>{t('app.calculator.subtitle')}</p></header>
              <div className="calculator-dashboard">
                <PowerCalculator screenConfig={screenConfig} onScreenConfigChange={setScreenConfig} presets={presets} gridConfig={gridConfig} />
                <BandwidthCalculator
                  linkedWidth={(calculatorPreset?.resolutionX ?? 1) * screenConfig.cols}
                  linkedHeight={(calculatorPreset?.resolutionY ?? 1) * screenConfig.rows}
                  linkedLabel={calculatorPreset
                    ? t('app.calculator.linkedLabel', { brand: calculatorPreset.brand, model: calculatorPreset.model, cols: screenConfig.cols, rows: screenConfig.rows })
                    : t('app.calculator.noPreset')}
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
        uiSkin={uiSkin}
        onUiSkinChange={setUiSkin}
        lang={lang}
        onLangChange={setLang}
      />
    )}
    </>
  );
}
