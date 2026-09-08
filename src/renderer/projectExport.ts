import type { CabinetPreset, PowerPlan, Processor } from '@shared/types';
import { usablePowerPerPortW } from '@shared/powerLimits';

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

export function buildCsvFiles(screens: ExportScreen[]): Record<string, string> {
  const pick = new Map<string, { preset: CabinetPreset; count: number }>();
  screens.forEach((screen) => {
    const current = pick.get(screen.preset.id) ?? { preset: screen.preset, count: 0 };
    current.count += cabinetCount(screen);
    pick.set(screen.preset.id, current);
  });

  return {
    'screens.csv': csv([
      ['Экран', 'Модель', 'Колонки', 'Ряды', 'Кабинеты', 'Ширина, мм', 'Высота, мм', 'Разрешение X', 'Разрешение Y', 'Вес, кг', 'Макс. мощность, Вт', 'Средняя мощность, Вт'],
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
      ['Бренд', 'Модель', 'Количество', 'Размер кабинета, мм', 'Разрешение кабинета', 'Шаг, мм', 'Общий вес, кг', 'Макс. мощность, Вт'],
      ...Array.from(pick.values()).map(({ preset, count }) => [
        preset.brand, preset.model, count, `${preset.widthMm} × ${preset.heightMm}`,
        `${preset.resolutionX} × ${preset.resolutionY}`, preset.pixelPitchMm,
        (count * preset.weightKg).toFixed(2), (count * preset.maxPowerW).toFixed(2)
      ])
    ]),
    'power.csv': csv([
      ['Экран', 'Цепь', 'Фаза', 'Кабинеты', 'Количество', 'Напряжение, В', 'Автомат, А', 'Запас, %', 'Расчётный ток, А'],
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
      ['Экран', 'Контроллер', 'Порт', 'Порядок', 'Кабинет', 'Столбец', 'Ряд', 'Пикселей в порту', 'Лимит порта'],
      ...screens.flatMap((screen) => screen.processor?.ports.flatMap((port) => {
        const portPixels = port.assignedCabinets.length * screen.preset.resolutionX * screen.preset.resolutionY;
        return port.assignedCabinets.map((key, index) => {
          const [col, row] = key.split('-').map(Number);
          return [
            screen.name, `${screen.processor!.brand} ${screen.processor!.model}`,
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

export function buildScreenSvg(screen: ExportScreen, mode: 'signal' | 'power' = 'signal'): string {
  const cellWidth = screen.preset.widthMm;
  const cellHeight = screen.preset.heightMm;
  const width = screen.cols * cellWidth;
  const height = screen.rows * cellHeight;
  const empty = new Set(screen.emptyCabinetKeys);
  const cells = Array.from({ length: screen.rows }, (_, row) =>
    Array.from({ length: screen.cols }, (_, col) => {
      const key = `${col}-${row}`;
      const x = col * cellWidth;
      const y = row * cellHeight;
      return empty.has(key)
        ? `<rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" fill="none" stroke="#9ca3af" stroke-dasharray="12 8"/>`
        : `<g><rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" fill="#18232c" stroke="#67e8f9" stroke-width="2"/><text x="${x + cellWidth / 2}" y="${y + cellHeight / 2}" fill="#e5f7ff" font-size="${Math.min(cellWidth, cellHeight) * .12}" text-anchor="middle" dominant-baseline="middle">${col + 1}:${row + 1}</text></g>`;
    }).join('')
  ).join('');
  const routes = mode === 'power' ? screen.powerPlan?.circuits : screen.processor?.ports;
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#0b1117"/><title>${escapeXml(screen.name)}</title>${cells}${paths}<rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="#000" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

export function buildReportHtml(projectName: string, screens: ExportScreen[]): string {
  const table = (headers: string[], rows: unknown[][]): string => `<table><thead><tr>${headers.map((value) => `<th>${escapeXml(value)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${escapeXml(String(value ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const details = screens.map((screen) => {
    const caption = escapeXml(screen.name);
    const count = cabinetCount(screen);
    const ports = screen.processor?.ports ?? [];
    const plan = screen.powerPlan;
    const limit = plan ? usablePowerPerPortW(plan.voltage, plan.circuitBreakerAmps, plan.safetyMarginPercent, plan.powerFactor) : 0;
    const signalRows = ports.map((port) => {
      const pixels = port.assignedCabinets.length * screen.preset.resolutionX * screen.preset.resolutionY;
      return [port.controllerId ?? '', port.controllerName ?? screen.processor?.model ?? '', port.sourcePortName ?? port.portId, port.assignedCabinets.length, pixels, port.maxPixels, pixels > port.maxPixels || (port.maxCabinets !== undefined && port.assignedCabinets.length > port.maxCabinets) ? 'Перегрузка' : 'В норме', port.assignedCabinets.map((key, index) => `${index + 1}: ${key}`).join('; ')];
    });
    const powerRows = (plan?.circuits ?? []).map((circuit) => {
      const watts = circuit.assignedCabinets.length * screen.preset.maxPowerW;
      return [circuit.name, circuit.phase, circuit.assignedCabinets.length, watts.toFixed(2), limit.toFixed(2), (watts / Math.max(1, plan!.voltage * plan!.powerFactor)).toFixed(2), watts > limit ? 'Перегрузка' : 'В норме', circuit.assignedCabinets.map((key, index) => `${index + 1}: ${key}`).join('; ')];
    });
    const mask = screen.imageSource?.startsWith('data:image/png;base64,') ? `<img src="${escapeXml(screen.imageSource)}" alt="${caption}"/>` : buildScreenSvg({ ...screen, processor: undefined });
    return `<section class="page"><h2>${caption} · Маска</h2><div class="mask">${mask}</div>${table(['Параметр', 'Значение'], [
      ['Кабинет', `${screen.preset.brand} ${screen.preset.model}`],
      ['Раскладка / установлено', `${screen.cols} × ${screen.rows} / ${count}`],
      ['Разрешение экрана, px', `${screen.cols * screen.preset.resolutionX} × ${screen.rows * screen.preset.resolutionY}`],
      ['Размер кабинета, мм / разрешение, px', `${screen.preset.widthMm} × ${screen.preset.heightMm} / ${screen.preset.resolutionX} × ${screen.preset.resolutionY}`],
      ['Шаг пикселя, мм', screen.preset.pixelPitchMm],
      ['Размер экрана, мм', `${screen.cols * screen.preset.widthMm} × ${screen.rows * screen.preset.heightMm}`],
      ['Вес, кг', (count * screen.preset.weightKg).toFixed(2)],
      ['Мощность макс. / средняя, Вт', `${(count * screen.preset.maxPowerW).toFixed(2)} / ${(count * screen.preset.avgPowerW).toFixed(2)}`],
      ['Положение на холсте / поворот', `${screen.x}, ${screen.y} / ${screen.rotation}°`],
      ['Пустые кабинеты (col-row, от 0)', screen.emptyCabinetKeys.join('; ') || 'Нет']
    ])}</section>
    <section class="page"><h2>${caption} · signal path</h2><div class="mask">${buildScreenSvg(screen, 'signal')}</div><p>Кабинеты: col-row, координаты от 0. Последовательность указана отдельно для каждого порта.</p>${signalRows.length ? table(['Sending card', 'Модель', 'Порт', 'Каб.', 'Пикселей', 'Лимит, px', 'Состояние', 'Порядок: кабинет'], signalRows) : '<p>Сигнальные пути не назначены.</p>'}</section>
    <section class="page"><h2>${caption} · power path</h2><div class="mask">${buildScreenSvg(screen, 'power')}</div>${plan ? `<p>Напряжение: ${plan.voltage} В · автомат: ${plan.circuitBreakerAmps} А · запас: ${plan.safetyMarginPercent}% · cos φ: ${plan.powerFactor} · фаз: ${plan.phases}</p>` : ''}${powerRows.length ? table(['Цепь', 'Фаза', 'Каб.', 'Мощность, Вт', 'Лимит, Вт', 'Ток, А', 'Состояние', 'Порядок: кабинет'], powerRows) : '<p>Силовые пути не назначены.</p>'}</section>`;
  }).join('');
  const totalCabinets = screens.reduce((sum, screen) => sum + cabinetCount(screen), 0);
  const rows = screens.map((screen) => {
    const count = cabinetCount(screen);
    return `<tr><td>${escapeXml(screen.name)}</td><td>${escapeXml(`${screen.preset.brand} ${screen.preset.model}`)}</td><td>${screen.cols} × ${screen.rows}</td><td>${count}</td><td>${screen.cols * screen.preset.widthMm} × ${screen.rows * screen.preset.heightMm}</td><td>${(count * screen.preset.weightKg).toFixed(2)}</td><td>${(count * screen.preset.maxPowerW).toFixed(0)}</td></tr>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:14mm}body{font-family:Arial,sans-serif;color:#17212b}h1{font-size:22px}p{color:#52606d}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #aab4bd;padding:6px;text-align:left}th{background:#e7f7fb}.page{break-before:page}h2{font-size:18px}.mask{height:135mm;display:flex;align-items:center;justify-content:center;margin:8px 0}.mask svg{width:100%;height:100%}.mask img{width:auto;height:auto;max-width:100%;max-height:100%;outline:1px solid #000;outline-offset:-1px}td{overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}</style></head><body><h1>${escapeXml(projectName)}</h1><p>Экранов: ${screens.length} · кабинетов: ${totalCabinets} · отчёт создан ${new Date().toLocaleString('ru-RU')}</p><table><thead><tr><th>Экран</th><th>Кабинет</th><th>Раскладка</th><th>Количество</th><th>Размер, мм</th><th>Вес, кг</th><th>Макс., Вт</th></tr></thead><tbody>${rows}</tbody></table>${details}</body></html>`;
}
