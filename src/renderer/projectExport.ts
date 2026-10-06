import type { CabinetPreset, PowerCircuit, PowerPlan, Processor, ProcessorPort } from '@shared/types';
import type { Lang } from '@shared/lang';
import { usablePowerPerPortW } from '@shared/powerLimits';

const MESSAGES = {
  ru: {
    csvScreensHeaders: ['Экран', 'Модель', 'Колонки', 'Ряды', 'Кабинеты', 'Ширина, мм', 'Высота, мм', 'Разрешение X', 'Разрешение Y', 'Вес, кг', 'Макс. мощность, Вт', 'Средняя мощность, Вт'],
    csvPickListHeaders: ['Бренд', 'Модель', 'Количество', 'Размер кабинета, мм', 'Разрешение кабинета', 'Шаг, мм', 'Общий вес, кг', 'Макс. мощность, Вт'],
    csvPowerHeaders: ['Экран', 'Цепь', 'Фаза', 'Кабинеты', 'Количество', 'Напряжение, В', 'Автомат, А', 'Запас, %', 'Расчётный ток, А'],
    csvDataPathHeaders: ['Экран', 'Контроллер', 'Порт', 'Порядок', 'Кабинет', 'Столбец', 'Ряд', 'Пикселей в порту', 'Лимит порта'],
    mask: 'Маска',
    overloaded: 'Перегрузка',
    ok: 'В норме',
    cabinetsCaption: 'Кабинеты: col-row, координаты от 0. Последовательность указана отдельно для каждого порта.',
    signalHeaders: ['Sending card', 'Модель', 'Порт', 'Каб.', 'Пикселей', 'Лимит, px', 'Состояние', 'Порядок: кабинет'],
    noSignalPaths: 'Сигнальные пути не назначены.',
    powerSummary: (voltage: number, amps: number, margin: number, pf: number, phases: number) =>
      `Напряжение: ${voltage} В · автомат: ${amps} А · запас: ${margin}% · cos φ: ${pf} · фаз: ${phases}`,
    powerHeaders: ['Цепь', 'Фаза', 'Каб.', 'Мощность, Вт', 'Лимит, Вт', 'Ток, А', 'Состояние', 'Порядок: кабинет'],
    noPowerPaths: 'Силовые пути не назначены.',
    detailHeaders: ['Параметр', 'Значение'],
    cabinetParam: 'Кабинет',
    layoutInstalled: 'Раскладка / установлено',
    screenResolutionPx: 'Разрешение экрана, px',
    cabinetSizeResolution: 'Размер кабинета, мм / разрешение, px',
    pixelPitchMm: 'Шаг пикселя, мм',
    screenSizeMm: 'Размер экрана, мм',
    weightKg: 'Вес, кг',
    powerMaxAvg: 'Мощность макс. / средняя, Вт',
    positionRotation: 'Положение на холсте / поворот',
    emptyCabinets: 'Пустые кабинеты (col-row, от 0)',
    none: 'Нет',
    summaryHeaders: ['Экран', 'Кабинет', 'Раскладка', 'Количество', 'Размер, мм', 'Вес, кг', 'Макс., Вт'],
    reportSummary: (screens: number, cabinets: number, date: string) => `Экранов: ${screens} · кабинетов: ${cabinets} · отчёт создан ${date}`,
    dateLocale: 'ru-RU'
  },
  en: {
    csvScreensHeaders: ['Screen', 'Model', 'Columns', 'Rows', 'Cabinets', 'Width, mm', 'Height, mm', 'Resolution X', 'Resolution Y', 'Weight, kg', 'Max power, W', 'Average power, W'],
    csvPickListHeaders: ['Brand', 'Model', 'Count', 'Cabinet size, mm', 'Cabinet resolution', 'Pitch, mm', 'Total weight, kg', 'Max power, W'],
    csvPowerHeaders: ['Screen', 'Circuit', 'Phase', 'Cabinets', 'Count', 'Voltage, V', 'Breaker, A', 'Margin, %', 'Calculated current, A'],
    csvDataPathHeaders: ['Screen', 'Controller', 'Port', 'Order', 'Cabinet', 'Column', 'Row', 'Pixels on port', 'Port limit'],
    mask: 'Mask',
    overloaded: 'Overloaded',
    ok: 'OK',
    cabinetsCaption: 'Cabinets: col-row, 0-based coordinates. The sequence is listed separately for each port.',
    signalHeaders: ['Sending card', 'Model', 'Port', 'Cab.', 'Pixels', 'Limit, px', 'Status', 'Order: cabinet'],
    noSignalPaths: 'No signal paths assigned.',
    powerSummary: (voltage: number, amps: number, margin: number, pf: number, phases: number) =>
      `Voltage: ${voltage} V · breaker: ${amps} A · margin: ${margin}% · cos φ: ${pf} · phases: ${phases}`,
    powerHeaders: ['Circuit', 'Phase', 'Cab.', 'Power, W', 'Limit, W', 'Current, A', 'Status', 'Order: cabinet'],
    noPowerPaths: 'No power paths assigned.',
    detailHeaders: ['Parameter', 'Value'],
    cabinetParam: 'Cabinet',
    layoutInstalled: 'Layout / installed',
    screenResolutionPx: 'Screen resolution, px',
    cabinetSizeResolution: 'Cabinet size, mm / resolution, px',
    pixelPitchMm: 'Pixel pitch, mm',
    screenSizeMm: 'Screen size, mm',
    weightKg: 'Weight, kg',
    powerMaxAvg: 'Power max / average, W',
    positionRotation: 'Canvas position / rotation',
    emptyCabinets: 'Empty cabinets (col-row, 0-based)',
    none: 'None',
    summaryHeaders: ['Screen', 'Cabinet', 'Layout', 'Count', 'Size, mm', 'Weight, kg', 'Max, W'],
    reportSummary: (screens: number, cabinets: number, date: string) => `Screens: ${screens} · cabinets: ${cabinets} · report generated ${date}`,
    dateLocale: 'en-US'
  }
} satisfies Record<Lang, unknown>;

export interface ExportScreen {
  id: string;
  name: string;
  preset: CabinetPreset;
  imageSource?: string;
  cols: number;
  rows: number;
  emptyCabinetKeys: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  processor?: Processor;
  powerPlan?: PowerPlan;
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function csv(rows: unknown[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

function cabinetCount(screen: ExportScreen): number {
  return screen.cols * screen.rows - screen.emptyCabinetKeys.length;
}

export function buildCsvFiles(screens: ExportScreen[], lang: Lang = 'ru'): Record<string, string> {
  const m = MESSAGES[lang];
  const pick = new Map<string, { preset: CabinetPreset; count: number }>();
  screens.forEach((screen) => {
    const current = pick.get(screen.preset.id) ?? { preset: screen.preset, count: 0 };
    current.count += cabinetCount(screen);
    pick.set(screen.preset.id, current);
  });

  return {
    'screens.csv': csv([
      m.csvScreensHeaders,
      ...screens.map((screen) => {
        const count = cabinetCount(screen);
        return [
          screen.name, `${screen.preset.brand} ${screen.preset.model}`, screen.cols, screen.rows, count,
          screen.cols * screen.preset.widthMm, screen.rows * screen.preset.heightMm,
          screen.cols * screen.preset.resolutionX, screen.rows * screen.preset.resolutionY,
          (count * screen.preset.weightKg).toFixed(2),
          (count * screen.preset.maxPowerW).toFixed(2),
          (count * screen.preset.avgPowerW).toFixed(2)
        ];
      })
    ]),
    'pick-list.csv': csv([
      m.csvPickListHeaders,
      ...Array.from(pick.values()).map(({ preset, count }) => [
        preset.brand, preset.model, count, `${preset.widthMm} × ${preset.heightMm}`,
        `${preset.resolutionX} × ${preset.resolutionY}`, preset.pixelPitchMm,
        (count * preset.weightKg).toFixed(2), (count * preset.maxPowerW).toFixed(2)
      ])
    ]),
    'power.csv': csv([
      m.csvPowerHeaders,
      ...screens.flatMap((screen) => screen.powerPlan?.circuits.map((circuit) => {
        const count = circuit.assignedCabinets.length;
        const amps = count * screen.preset.maxPowerW /
          Math.max(1, screen.powerPlan!.voltage * screen.powerPlan!.powerFactor);
        return [
          screen.name, circuit.name, circuit.phase, circuit.assignedCabinets.join(', '), count,
          screen.powerPlan!.voltage, screen.powerPlan!.circuitBreakerAmps,
          screen.powerPlan!.safetyMarginPercent, amps.toFixed(2)
        ];
      }) ?? [])
    ]),
    'data-path.csv': csv([
      m.csvDataPathHeaders,
      ...screens.flatMap((screen) => screen.processor?.ports.flatMap((port) => {
        const portPixels = port.assignedCabinets.length * screen.preset.resolutionX * screen.preset.resolutionY;
        return port.assignedCabinets.map((key, index) => {
          const [col, row] = key.split('-').map(Number);
          return [
            screen.name, `${screen.processor!.brand} ${port.controllerName ?? screen.processor!.model}`,
            port.sourcePortName || port.portId, index + 1, key, col + 1, row + 1,
            portPixels, port.maxPixels
          ];
        });
      }) ?? [])
    ])
  };
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** "S1P1" = Sending card 1, Port 1 — controllerId не всегда чистая цифра
 * (напр. "A1" из NovaStar-сцены), поэтому номер карты вытаскиваем регуляркой. */
function formatSignalPortLabel(port: ProcessorPort): string {
  const cardNumber = port.controllerId?.match(/\d+/)?.[0] ?? port.controllerId;
  const portNumber = port.sourcePortName ?? port.portId;
  return cardNumber ? `S${cardNumber}P${portNumber}` : `P${portNumber}`;
}

function formatPowerCircuitLabel(circuit: PowerCircuit, index: number): string {
  return `C${index + 1}·${circuit.phase}`;
}

export function buildScreenSvg(screen: ExportScreen, mode: 'signal' | 'power' = 'signal'): string {
  const cellWidth = screen.preset.widthMm;
  const cellHeight = screen.preset.heightMm;
  const width = screen.cols * cellWidth;
  const height = screen.rows * cellHeight;
  const empty = new Set(screen.emptyCabinetKeys);
  const routes = mode === 'power' ? screen.powerPlan?.circuits : screen.processor?.ports;
  const coordFontSize = Math.min(cellWidth, cellHeight) * .12;
  const portFontSize = coordFontSize * .72;

  // Подпись порта/цепи — только на ПЕРВОМ кабинете каждого маршрута (не на
  // каждом подряд — иначе на длинной цепи это просто шум), прижата к верху
  // ячейки в виде плашки — линия пути идёт через ЦЕНТР ячейки, так что сверху
  // она её не перекрывает.
  const firstCabinetLabels = new Map<string, { label: string; colorIndex: number }>();
  routes?.forEach((route, index) => {
    const firstKey = route.assignedCabinets[0];
    if (!firstKey) return;
    const label = mode === 'power'
      ? formatPowerCircuitLabel(route as PowerCircuit, index)
      : formatSignalPortLabel(route as ProcessorPort);
    firstCabinetLabels.set(firstKey, { label, colorIndex: index });
  });

  // Слой 1 — тело кабинетов, без текста.
  const cabinetBodies = Array.from({ length: screen.rows }, (_, row) =>
    Array.from({ length: screen.cols }, (_, col) => {
      const key = `${col}-${row}`;
      const x = col * cellWidth;
      const y = row * cellHeight;
      return empty.has(key)
        ? `<rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" fill="none" stroke="#9ca3af" stroke-dasharray="12 8"/>`
        : `<rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" fill="#18232c" stroke="#67e8f9" stroke-width="2"/>`;
    }).join('')
  ).join('');

  const paths = routes?.map((port, index) => {
    const centers = port.assignedCabinets.map((key) => {
      const [col, row] = key.split('-').map(Number);
      return { x: (col + .5) * cellWidth, y: (row + .5) * cellHeight };
    });
    if (centers.length === 0) return '';
    const color = `hsl(${index * 83} 78% 55%)`;
    const strokeWidth = Math.min(cellWidth, cellHeight) * .035;
    const arrowSize = Math.min(cellWidth, cellHeight) * .08;
    const segments = centers.slice(0, -1).map((point, segmentIndex) => {
      const next = centers[segmentIndex + 1];
      const middleX = (point.x + next.x) / 2;
      const middleY = (point.y + next.y) / 2;
      const angle = Math.atan2(next.y - point.y, next.x - point.x) * 180 / Math.PI;
      return `<g><line x1="${point.x}" y1="${point.y}" x2="${next.x}" y2="${next.y}" stroke="#fff" stroke-opacity=".88" stroke-width="${strokeWidth * 2.2}" stroke-linecap="round"/><line x1="${point.x}" y1="${point.y}" x2="${next.x}" y2="${next.y}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round"/><path d="M ${-arrowSize} ${-arrowSize * .7} L ${arrowSize} 0 L ${-arrowSize} ${arrowSize * .7} Z" transform="translate(${middleX} ${middleY}) rotate(${angle})" fill="${color}" stroke="#fff" stroke-width="${strokeWidth * .25}"/></g>`;
    }).join('');
    const first = centers[0];
    const last = centers[centers.length - 1];
    const radius = Math.min(cellWidth, cellHeight) * .09;
    return `${segments}<circle cx="${first.x}" cy="${first.y}" r="${radius}" fill="#16a34a" stroke="#fff" stroke-width="${strokeWidth * .5}"/><circle cx="${last.x}" cy="${last.y}" r="${radius}" fill="#dc2626" stroke="#fff" stroke-width="${strokeWidth * .5}"/>`;
  }).join('') ?? '';

  // Слой 3 — весь текст поверх путей, чтобы линии НИКОГДА не перекрывали подписи.
  const labels = Array.from({ length: screen.rows }, (_, row) =>
    Array.from({ length: screen.cols }, (_, col) => {
      const key = `${col}-${row}`;
      if (empty.has(key)) return '';
      const x = col * cellWidth;
      const y = row * cellHeight;
      // Координата — в левый верхний угол ячейки (не в центр, где проходит
      // линия пути и стоят маркеры начала/конца).
      const coordInset = coordFontSize * .35;
      const coordText = `<text x="${x + coordInset}" y="${y + coordInset}" fill="#e5f7ff" font-size="${coordFontSize}" text-anchor="start" dominant-baseline="hanging">${col + 1}:${row + 1}</text>`;
      const route = firstCabinetLabels.get(key);
      if (!route) return coordText;
      // Порт/цепь — плашкой по центру снизу ячейки, подальше от линии в центре.
      const chipHeight = portFontSize * 1.5;
      const chipWidth = Math.min(cellWidth * .94, route.label.length * portFontSize * .64 + portFontSize);
      const chipX = x + (cellWidth - chipWidth) / 2;
      const chipY = y + cellHeight - chipHeight - cellHeight * .05;
      const color = `hsl(${route.colorIndex * 83} 78% 55%)`;
      const portChip = `<rect x="${chipX}" y="${chipY}" width="${chipWidth}" height="${chipHeight}" rx="${chipHeight * .25}" fill="${color}" stroke="#fff" stroke-width="${portFontSize * .08}"/><text x="${x + cellWidth / 2}" y="${chipY + chipHeight / 2}" fill="#07131a" font-size="${portFontSize}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeXml(route.label)}</text>`;
      return `${coordText}${portChip}`;
    }).join('')
  ).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#0b1117"/><title>${escapeXml(screen.name)}</title>${cabinetBodies}${paths}${labels}<rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="#000" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

export function buildReportHtml(projectName: string, screens: ExportScreen[], lang: Lang = 'ru'): string {
  const m = MESSAGES[lang];
  const table = (headers: string[], rows: unknown[][]): string => `<table><thead><tr>${headers.map((value) => `<th>${escapeXml(value)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${escapeXml(String(value ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const details = screens.map((screen) => {
    const caption = escapeXml(screen.name);
    const count = cabinetCount(screen);
    const ports = screen.processor?.ports ?? [];
    const plan = screen.powerPlan;
    const limit = plan ? usablePowerPerPortW(plan.voltage, plan.circuitBreakerAmps, plan.safetyMarginPercent, plan.powerFactor) : 0;
    const signalRows = ports.map((port) => {
      const pixels = port.assignedCabinets.length * screen.preset.resolutionX * screen.preset.resolutionY;
      return [port.controllerId ?? '', port.controllerName ?? screen.processor?.model ?? '', port.sourcePortName ?? port.portId, port.assignedCabinets.length, pixels, port.maxPixels, pixels > port.maxPixels || (port.maxCabinets !== undefined && port.assignedCabinets.length > port.maxCabinets) ? m.overloaded : m.ok, port.assignedCabinets.map((key, index) => `${index + 1}: ${key}`).join('; ')];
    });
    const powerRows = (plan?.circuits ?? []).map((circuit) => {
      const watts = circuit.assignedCabinets.length * screen.preset.maxPowerW;
      return [circuit.name, circuit.phase, circuit.assignedCabinets.length, watts.toFixed(2), limit.toFixed(2), (watts / Math.max(1, plan!.voltage * plan!.powerFactor)).toFixed(2), watts > limit ? m.overloaded : m.ok, circuit.assignedCabinets.map((key, index) => `${index + 1}: ${key}`).join('; ')];
    });
    const mask = screen.imageSource?.startsWith('data:image/png;base64,') ? `<img src="${escapeXml(screen.imageSource)}" alt="${caption}"/>` : buildScreenSvg({ ...screen, processor: undefined });
    return `<section class="page"><h2>${caption} · ${m.mask}</h2><div class="mask">${mask}</div>${table(m.detailHeaders, [
      [m.cabinetParam, `${screen.preset.brand} ${screen.preset.model}`],
      [m.layoutInstalled, `${screen.cols} × ${screen.rows} / ${count}`],
      [m.screenResolutionPx, `${screen.cols * screen.preset.resolutionX} × ${screen.rows * screen.preset.resolutionY}`],
      [m.cabinetSizeResolution, `${screen.preset.widthMm} × ${screen.preset.heightMm} / ${screen.preset.resolutionX} × ${screen.preset.resolutionY}`],
      [m.pixelPitchMm, screen.preset.pixelPitchMm],
      [m.screenSizeMm, `${screen.cols * screen.preset.widthMm} × ${screen.rows * screen.preset.heightMm}`],
      [m.weightKg, (count * screen.preset.weightKg).toFixed(2)],
      [m.powerMaxAvg, `${(count * screen.preset.maxPowerW).toFixed(2)} / ${(count * screen.preset.avgPowerW).toFixed(2)}`],
      [m.positionRotation, `${screen.x}, ${screen.y} / ${screen.rotation}°`],
      [m.emptyCabinets, screen.emptyCabinetKeys.join('; ') || m.none]
    ])}</section>
    <section class="page"><h2>${caption} · signal path</h2><div class="mask">${buildScreenSvg(screen, 'signal')}</div><p>${m.cabinetsCaption}</p>${signalRows.length ? table(m.signalHeaders, signalRows) : `<p>${m.noSignalPaths}</p>`}</section>
    <section class="page"><h2>${caption} · power path</h2><div class="mask">${buildScreenSvg(screen, 'power')}</div>${plan ? `<p>${m.powerSummary(plan.voltage, plan.circuitBreakerAmps, plan.safetyMarginPercent, plan.powerFactor, plan.phases)}</p>` : ''}${powerRows.length ? table(m.powerHeaders, powerRows) : `<p>${m.noPowerPaths}</p>`}</section>`;
  }).join('');
  const totalCabinets = screens.reduce((sum, screen) => sum + cabinetCount(screen), 0);
  const rows = screens.map((screen) => {
    const count = cabinetCount(screen);
    return `<tr><td>${escapeXml(screen.name)}</td><td>${escapeXml(`${screen.preset.brand} ${screen.preset.model}`)}</td><td>${screen.cols} × ${screen.rows}</td><td>${count}</td><td>${screen.cols * screen.preset.widthMm} × ${screen.rows * screen.preset.heightMm}</td><td>${(count * screen.preset.weightKg).toFixed(2)}</td><td>${(count * screen.preset.maxPowerW).toFixed(0)}</td></tr>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:14mm}body{font-family:Arial,sans-serif;color:#17212b}h1{font-size:22px}p{color:#52606d}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #aab4bd;padding:6px;text-align:left}th{background:#e7f7fb}.page{break-before:page}h2{font-size:18px}.mask{height:135mm;display:flex;align-items:center;justify-content:center;margin:8px 0}.mask svg{width:100%;height:100%}.mask img{width:auto;height:auto;max-width:100%;max-height:100%;outline:1px solid #000;outline-offset:-1px}td{overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}</style></head><body><h1>${escapeXml(projectName)}</h1><p>${m.reportSummary(screens.length, totalCabinets, new Date().toLocaleString(m.dateLocale))}</p><table><thead><tr>${m.summaryHeaders.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>${details}</body></html>`;
}
