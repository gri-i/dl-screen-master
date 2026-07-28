import type { CabinetPreset } from './types';

/**
 * Библиотека пресетов кабинетов. Данные взяты из официальных спек-листов
 * производителей. Мощность указана и как Вт/панель, и как Вт/м2 в комментариях
 * для проверки при добавлении новых моделей.
 *
 * Когда пресетов станет много, имеет смысл вынести каждый в отдельный JSON
 * и подгружать через IPC (см. README, пункт "Библиотека пресетов").
 */
export const CABINET_PRESETS: CabinetPreset[] = [
  {
    id: 'absen-pl-p2.5',
    brand: 'Absen',
    model: 'PL 2.5 px',
    widthMm: 500,     // imported: 150 W per cabinet / 600 W per m2 = 0.25 m2
    heightMm: 500,
    pixelPitchMm: 2.5,
    resolutionX: 200,
    resolutionY: 200,
    weightKg: 0,      // not specified in Gri-obsidian/DL/LED_Screens
    maxPowerW: 150,
    avgPowerW: 60     // estimated at 40% of max; source only has max power
  },
  {
    id: 'absen-floor-p4.8',
    brand: 'Absen',
    model: 'Floor 4.8 px',
    widthMm: 500,     // imported: 180 W per cabinet / 720 W per m2 = 0.25 m2
    heightMm: 500,
    pixelPitchMm: 4.8,
    resolutionX: 104,
    resolutionY: 104,
    weightKg: 0,      // not specified in Gri-obsidian/DL/LED_Screens
    maxPowerW: 180,
    avgPowerW: 72     // estimated at 40% of max; source only has max power
  },
  {
    id: 'absen-nt-p1.9-pro',
    brand: 'Absen',
    model: 'NT 1.9 px PRO',
    widthMm: 500,     // imported: 135 W per cabinet / 540 W per m2 = 0.25 m2
    heightMm: 500,
    pixelPitchMm: 1.9,
    resolutionX: 256,
    resolutionY: 256,
    weightKg: 0,      // not specified in Gri-obsidian/DL/LED_Screens
    maxPowerW: 135,
    avgPowerW: 54     // estimated at 40% of max; source only has max power
  },
  {
    id: 'yestech-p2.6',
    brand: 'Yestech',
    model: '2.6 px',
    widthMm: 500,     // imported: 150 W per cabinet / 600 W per m2 = 0.25 m2
    heightMm: 500,
    pixelPitchMm: 2.6,
    resolutionX: 192,
    resolutionY: 192,
    weightKg: 0,      // not specified in Gri-obsidian/DL/LED_Screens
    maxPowerW: 150,
    avgPowerW: 60     // estimated at 40% of max; source only has max power
  },
  {
    id: 'yestech-pl-p3.9-pro',
    brand: 'Yestech',
    model: 'PL 3.9 px PRO',
    widthMm: 500,     // imported: 160 W per cabinet / 640 W per m2 = 0.25 m2
    heightMm: 500,
    pixelPitchMm: 3.9,
    resolutionX: 128,
    resolutionY: 128,
    weightKg: 0,      // not specified in Gri-obsidian/DL/LED_Screens
    maxPowerW: 160,
    avgPowerW: 64     // estimated at 40% of max; source only has max power
  }
];

export function getPresetById(id: string): CabinetPreset | undefined {
  return CABINET_PRESETS.find((p) => p.id === id);
}
