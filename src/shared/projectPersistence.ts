import type { CabinetPreset, Project, ScreenInstance, SignalFormat } from './types';

export interface ProjectStateForPersistence {
  name: string;
  createdAt: string;
  screens: ScreenInstance[];
  customPresets: CabinetPreset[];
  sessionPresets: CabinetPreset[];
  signal: SignalFormat;
}

export interface PresetMergeResult {
  presets: CabinetPreset[];
  conflicts: CabinetPreset[];
}

export type DestructiveChoice = 'save' | 'discard' | 'cancel';

/** Complete a destructive transition only after the selected async action succeeds. */
export async function finishDestructiveTransition(
  choice: DestructiveChoice,
  save: () => Promise<boolean>,
  clearRecovery: () => Promise<void>
): Promise<boolean> {
  if (choice === 'cancel') return false;
  if (choice === 'discard') {
    await clearRecovery();
    return true;
  }
  return save();
}

function samePreset(left: CabinetPreset, right: CabinetPreset): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

/**
 * Keep the global library authoritative. Project/session presets are added
 * only when they do not collide by id or by physical brand/model identity.
 * A non-identical collision is reported instead of silently replacing a
 * user's global definition.
 */
export function mergePresetsPreservingExisting(existing: CabinetPreset[], incoming: CabinetPreset[]): PresetMergeResult {
  const presets = [...existing];
  const conflicts: CabinetPreset[] = [];
  for (const candidate of incoming) {
    const collision = presets.find((preset) =>
      preset.id === candidate.id ||
      (normalizedName(preset.brand) === normalizedName(candidate.brand) && normalizedName(preset.model) === normalizedName(candidate.model)));
    if (!collision) {
      presets.push(candidate);
    } else if (!samePreset(collision, candidate)) {
      conflicts.push(candidate);
    }
  }
  return { presets, conflicts };
}

export function usedPresetIds(screens: ScreenInstance[]): Set<string> {
  return new Set(screens.map((screen) => screen.presetId));
}

/** Store project-local imports only if a saved screen actually references them. */
export function sessionPresetsForProject(screens: ScreenInstance[], customPresets: CabinetPreset[], sessionPresets: CabinetPreset[]): CabinetPreset[] {
  const customIds = new Set(customPresets.map((preset) => preset.id));
  const used = usedPresetIds(screens);
  return sessionPresets.filter((preset) => used.has(preset.id) && !customIds.has(preset.id));
}

export function buildProjectSnapshot(state: ProjectStateForPersistence, updatedAt = new Date().toISOString()): Project {
  return {
    format: 'dl-screen-master-project',
    version: 1,
    name: state.name,
    createdAt: state.createdAt,
    updatedAt,
    screens: state.screens,
    customPresets: state.customPresets,
    sessionPresets: sessionPresetsForProject(state.screens, state.customPresets, state.sessionPresets),
    signal: state.signal
  };
}

export function projectFingerprint(project: Project): string {
  return JSON.stringify(project);
}
