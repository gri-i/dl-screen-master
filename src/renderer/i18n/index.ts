import type { Dict, Lang } from './types';
import { appDict } from './dict.app';
import { settingsDict } from './dict.settings';
import { powerCalcDict } from './dict.powerCalc';
import { bandwidthDict } from './dict.bandwidth';
import { powerPathDict } from './dict.powerPath';
import { testPatternDict } from './dict.testPattern';
import { projectionDict } from './dict.projection';

export type { Lang, Dict } from './types';
export { LanguageProvider, useLanguage, useT } from './context';

function mergeDicts(...dicts: Record<Lang, Dict>[]): Record<Lang, Dict> {
  return {
    ru: Object.assign({}, ...dicts.map((d) => d.ru)),
    en: Object.assign({}, ...dicts.map((d) => d.en))
  };
}

export const DICT: Record<Lang, Dict> = mergeDicts(
  appDict,
  settingsDict,
  powerCalcDict,
  bandwidthDict,
  powerPathDict,
  testPatternDict,
  projectionDict
);
