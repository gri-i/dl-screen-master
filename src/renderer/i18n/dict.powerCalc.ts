import type { Dict, Lang } from './types';

export const powerCalcDict: Record<Lang, Dict> = {
  ru: {
    'pc.testScreenName': 'Тестовый экран',
    'pc.title': 'Параметры экрана',
    'pc.cabinetModel': 'Модель кабинета',
    'pc.noCabinets': 'В базе нет кабинетов. Добавьте или импортируйте кабинет в настройках.',
    'pc.optionLabel': '{brand} {model} (pitch {pitch} мм)',
    'pc.presetSummary': '{width}×{height} мм, {weight} кг, макс. {maxPower} Вт / сред. {avgPower} Вт на кабинет',
    'pc.layout': 'Раскладка экрана',
    'pc.colsLabel': 'Кабинетов по горизонтали:',
    'pc.rowsLabel': 'Кабинетов по вертикали:',
    'pc.calculation': 'Расчёт',
    'pc.totalCabinets': 'Всего кабинетов',
    'pc.resolutionPx': 'Разрешение (px)',
    'pc.dimensionsMm': 'Габариты (мм)',
    'pc.totalWeightKg': 'Общий вес (кг)',
    'pc.peakPowerW': 'Пиковое потребление (Вт)',
    'pc.peakPowerKw': 'Пиковое потребление (кВт)',
    'pc.avgPowerW': 'Среднее потребление (Вт)',
    'pc.circuitsNeeded': 'Нужно цепей питания',
    'pc.phaseThree': '3ф',
    'pc.phaseSingle': '1ф'
  },
  en: {
    'pc.testScreenName': 'Test screen',
    'pc.title': 'Screen parameters',
    'pc.cabinetModel': 'Cabinet model',
    'pc.noCabinets': 'The library has no cabinets. Add or import one in settings.',
    'pc.optionLabel': '{brand} {model} (pitch {pitch} mm)',
    'pc.presetSummary': '{width}×{height} mm, {weight} kg, max {maxPower} W / avg {avgPower} W per cabinet',
    'pc.layout': 'Screen layout',
    'pc.colsLabel': 'Cabinets across:',
    'pc.rowsLabel': 'Cabinets down:',
    'pc.calculation': 'Calculation',
    'pc.totalCabinets': 'Total cabinets',
    'pc.resolutionPx': 'Resolution (px)',
    'pc.dimensionsMm': 'Size (mm)',
    'pc.totalWeightKg': 'Total weight (kg)',
    'pc.peakPowerW': 'Peak power (W)',
    'pc.peakPowerKw': 'Peak power (kW)',
    'pc.avgPowerW': 'Average power (W)',
    'pc.circuitsNeeded': 'Power circuits needed',
    'pc.phaseThree': '3-phase',
    'pc.phaseSingle': '1-phase'
  }
};
