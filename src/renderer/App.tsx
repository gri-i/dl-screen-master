import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PowerCalculator, type ScreenConfig } from './components/PowerCalculator';
import { TestPatternViewer, type ScreenHeaderSummary } from './components/TestPatternViewer';
import { SettingsApp } from './SettingsApp';
import { ProjectionMaskSection } from './sections/ProjectionMaskSection';
import { BandwidthCalculator } from './components/BandwidthCalculator';
import type { CabinetPreset, PowerGridConfig, Project, ScreenInstance, SignalFormat, UiSkin } from '@shared/types';
import { DEFAULT_SIGNAL } from '@shared/capacity';
import { mergeUniquePresets } from '@shared/presetValidation';
import { buildProjectSnapshot, finishDestructiveTransition, mergePresetsPreservingExisting } from '@shared/projectPersistence';
import { parseProject, ProjectValidationError } from '@shared/projectValidation';
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
  const [signal, setSignal] = useState<SignalFormat>(DEFAULT_SIGNAL);
  const [projectStatus, setProjectStatus] = useState('');
  const [profileReady, setProfileReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uiSkin, setUiSkin] = useState<UiSkin>(readUiSkin);
  const initializedRef = React.useRef(false);
  const transitionTargetRef = React.useRef<ScreenInstance[] | null>(null);
  const recoveryCheckedRef = React.useRef(false);
  const recoveryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionInProgressRef = React.useRef(false);
  const [gridConfig, setGridConfig] = useState<PowerGridConfig>(() => {
    try {
      const stored = window.localStorage.getItem(GRID_CONFIG_KEY);
      return stored ? { ...DEFAULT_GRID_CONFIG, ...JSON.parse(stored) } : DEFAULT_GRID_CONFIG;
    } catch {
      return DEFAULT_GRID_CONFIG;
    }
  });
  const presets = useMemo(() => mergeUniquePresets(customPresets, sessionPresets, { skipDuplicates: true, lang }), [customPresets, sessionPresets]);
  const currentProject = useMemo(() => buildProjectSnapshot({
    name: projectName,
    createdAt: projectCreatedAt,
    screens: projectScreens,
    customPresets,
    sessionPresets,
    signal
  }), [projectName, projectCreatedAt, projectScreens, customPresets, sessionPresets, signal]);
  const calculatorPreset = presets.find((preset) => preset.id === screenConfig.presetId) ?? presets[0];
  const handleProjectScreensChange = useCallback((screens: ScreenInstance[]) => {
    setProjectScreens(screens);
    if (!initializedRef.current) return;
    const target = transitionTargetRef.current;
    if (target) {
      if (JSON.stringify(target) === JSON.stringify(screens)) transitionTargetRef.current = null;
      return;
    }
    setDirty(true);
  }, []);

  function markDirty(): void {
    if (initializedRef.current) setDirty(true);
  }

  async function confirmDestructiveTransition(): Promise<boolean> {
    if (!dirty) return true;
    const choice = await window.projectFiles.confirmDiscard(lang);
    try {
      return await finishDestructiveTransition(choice, saveProject, window.projectRecovery.clear);
    } catch (error) {
      setProjectStatus(error instanceof Error ? error.message : t('app.status.recoveryClearFailed', { message: '' }));
      return false;
    }
  }

  async function newProject(): Promise<void> {
    if (transitionInProgressRef.current) return;
    transitionInProgressRef.current = true;
    try {
      if (!(await confirmDestructiveTransition())) return;
      transitionTargetRef.current = [];
      setProjectName(t('app.newProjectName'));
      setProjectPath(undefined);
      setProjectCreatedAt(new Date().toISOString());
      setScreensToLoad([]);
      setSignal(DEFAULT_SIGNAL);
      setProjectLoadSignal((value) => value + 1);
      setProjectStatus(t('app.status.newProject'));
      setSessionPresets([]);
      setDirty(false);
    } finally {
      transitionInProgressRef.current = false;
    }
  }

  async function openProject(): Promise<void> {
    if (transitionInProgressRef.current) return;
    transitionInProgressRef.current = true;
    try {
      if (!(await confirmDestructiveTransition())) return;
      const result = await window.projectFiles.open();
      if (!result) return;
      const project = parseProject(result.project, { lang, availablePresets: customPresets });
      const mergedCustom = mergePresetsPreservingExisting(customPresets, project.customPresets);
      if (mergedCustom.conflicts.length > 0) {
        throw new Error(t('app.status.presetConflict', { count: mergedCustom.conflicts.length }));
      }
      const sessionMerge = mergePresetsPreservingExisting(mergedCustom.presets, project.sessionPresets ?? []);
      if (sessionMerge.conflicts.length > 0) {
        throw new Error(t('app.status.presetConflict', { count: sessionMerge.conflicts.length }));
      }
      const nextSessionPresets = (project.sessionPresets ?? []).filter((preset) =>
        !mergedCustom.presets.some((existing) => existing.id === preset.id));
      // Global presets are merged, never replaced by a project-local list.
      await window.presetFiles.save(mergedCustom.presets);
      transitionTargetRef.current = project.screens;
      setCustomPresets(mergedCustom.presets);
      setSessionPresets(nextSessionPresets);
      setProjectName(project.name || t('app.status.untitled'));
      setProjectPath(result.filePath);
      setProjectCreatedAt(project.createdAt);
      setScreensToLoad(project.screens);
      setSignal(project.signal ?? DEFAULT_SIGNAL);
      setProjectLoadSignal((value) => value + 1);
      setProjectStatus(t('app.status.opened', { path: result.filePath }));
      setDirty(false);
    } catch (error) {
      setProjectStatus(error instanceof ProjectValidationError ? error.message : error instanceof Error ? error.message : t('app.status.openFailed'));
    } finally {
      transitionInProgressRef.current = false;
    }
  }

  async function saveProject(): Promise<boolean> {
    const project: Project = { ...currentProject, updatedAt: new Date().toISOString() };
    try {
      const savedPath = await window.projectFiles.save(project, projectPath);
      if (!savedPath) return false;
      setProjectPath(savedPath);
      setProjectStatus(t('app.status.saved', { path: savedPath }));
      setDirty(false);
      return true;
    } catch (error) {
      setProjectStatus(error instanceof Error ? error.message : t('app.status.saveFailed'));
      return false;
    }
  }

  function importSessionPresets(imported: CabinetPreset[]): void {
    // Проверяем синхронно: исключение из updater-функции React иначе
    // приводит к падению всего интерфейса, а не к сообщению об импорте.
    mergeUniquePresets([], imported, { skipDuplicates: true, lang });
    setSessionPresets((current) => mergeUniquePresets(current, imported, { skipDuplicates: true, lang }));
    markDirty();
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
      setProfileReady(true);
      initializedRef.current = true;
    }).catch((error) => {
      setProjectStatus(error instanceof Error ? error.message : t('app.status.presetsLoadFailed'));
      setProfileReady(true);
      initializedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!profileReady || recoveryCheckedRef.current) return;
    recoveryCheckedRef.current = true;
    void window.projectRecovery.load().then(async (recovery) => {
      if (recovery.status === 'corrupt') {
        setProjectStatus(t('app.status.recoveryCorrupt'));
        await window.projectRecovery.clear().catch(() => undefined);
        return;
      }
      if (recovery.status === 'error') {
        setProjectStatus(t('app.status.recoveryLoadFailed', { message: recovery.message ?? '' }));
        return;
      }
      if (recovery.status !== 'available' || !recovery.project) return;
      const choice = await window.projectFiles.confirmRecovery(lang);
      if (choice === 'cancel') return;
      if (choice === 'ignore') {
        try {
          await window.projectRecovery.clear();
        } catch (error) {
          setProjectStatus(error instanceof Error ? error.message : t('app.status.recoveryClearFailed', { message: '' }));
          return;
        }
        setProjectStatus(t('app.status.recoveryIgnored'));
        return;
      }
      try {
        const project = parseProject(recovery.project, { lang, availablePresets: customPresets });
        const merged = mergePresetsPreservingExisting(customPresets, project.customPresets);
        if (merged.conflicts.length > 0) throw new Error(t('app.status.presetConflict', { count: merged.conflicts.length }));
        const session = (project.sessionPresets ?? []).filter((preset) =>
          !merged.presets.some((existing) => existing.id === preset.id));
        await window.presetFiles.save(merged.presets);
        transitionTargetRef.current = project.screens;
        setCustomPresets(merged.presets);
        setSessionPresets(session);
        setProjectName(project.name);
        setProjectPath(recovery.filePath);
        setProjectCreatedAt(project.createdAt);
        setScreensToLoad(project.screens);
        setSignal(project.signal ?? DEFAULT_SIGNAL);
        setProjectLoadSignal((value) => value + 1);
        setDirty(true);
        setProjectStatus(t('app.status.recovered'));
      } catch (error) {
        setProjectStatus(error instanceof Error ? error.message : t('app.status.recoveryLoadFailed', { message: '' }));
      }
    }).catch((error) => setProjectStatus(error instanceof Error ? error.message : t('app.status.recoveryLoadFailed', { message: '' })));
  }, [profileReady]);

  useEffect(() => {
    window.appLifecycle.setDirty(dirty, lang);
  }, [dirty, lang]);

  useEffect(() => window.appLifecycle.onCloseSaveRequest(() => {
    void saveProject().then((saved) => window.appLifecycle.sendCloseSaveResult(saved));
  }), [currentProject, projectPath]);

  useEffect(() => {
    if (!profileReady || !dirty) return;
    if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = setTimeout(() => {
      void window.projectRecovery.save(currentProject, projectPath).catch((error) => {
        setProjectStatus(t('app.status.recoverySaveFailed', { message: error instanceof Error ? error.message : '' }));
      });
    }, 700);
    return () => {
      if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
    };
  }, [currentProject, dirty, profileReady, projectPath]);

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
            onChange={(event) => { setProjectName(event.target.value); markDirty(); }}
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
              signal={signal}
              onSignalChange={(nextSignal) => { setSignal(nextSignal); markDirty(); }}
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
        onPresetsChange={(nextPresets) => { setCustomPresets(nextPresets); markDirty(); }}
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
