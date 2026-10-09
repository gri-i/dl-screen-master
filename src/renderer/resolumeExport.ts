/**
 * Экспорт в Resolume Arena «Advanced Output» (пресет для
 * Presets/Advanced Output/).
 *
 * Схема XML (имена элементов, вложенность, формат чисел) перенесена из
 * pixel-peeker (MIT, export/resolume.ts), где она снята с реальных файлов
 * Arena 7.27.0 (rev 14395). Наша раскладка (по Slice на порт, по Screen на
 * экран с процессором) в живой Arena НЕ загружалась, а Resolume меняет формат
 * между версиями — проверяйте результат и назначьте каждому Screen физический
 * выход вручную (deviceId/idHash привязаны к машине и не синтезируются).
 *
 * Что пишется:
 *  - композиция = ограничивающий прямоугольник всех экспортируемых экранов на
 *    рабочей области (в нативных пикселях);
 *  - Screen на каждый экран с назначенным контроллером, Virtual-устройство
 *    размером с растр процессора (bbox его портов);
 *  - Slice на каждый порт: InputRect — область порта в композиции, OutputRect —
 *    то же в растре процессора, Warper — единичная сетка.
 *
 * Повёрнутые экраны: InputRect берётся в координатах композиции (после
 * поворота), OutputRect — в растре процессора без поворота. Ориентацию вершин
 * Arena для поворота мы не проверяли, поэтому такие экраны возвращаются в
 * `rotatedScreens` — поворот на выходе нужно задать в Resolume самому.
 */
import type { ExportScreen } from './projectExport';

const ARENA_VERSION = { name: 'Resolume Arena', majorVersion: 7, minorVersion: 27, microVersion: 0, revision: 14395 };

interface Rect { x: number; y: number; width: number; height: number }
interface Chain { name: string; input: Rect; output: Rect }

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const num = (value: number): string => String(Number.isInteger(value) ? value : Number(value.toFixed(6)));

/** По часовой стрелке от левого верхнего, как пишет Arena. */
const corners = (r: Rect) => [
  { x: r.x, y: r.y }, { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }
];

const verts = (points: { x: number; y: number }[], indent: string): string =>
  points.map((p) => `${indent}<v x="${num(p.x)}" y="${num(p.y)}"/>`).join('\n');

function bezierGrid(r: Rect): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) points.push({ x: r.x + (r.width * col) / 3, y: r.y + (r.height * row) / 3 });
  }
  return points;
}

/** Поворот прямоугольника внутри экрана W×H на угол по часовой (как CSS rotate). */
function rotateRect(r: Rect, rotation: number, screenW: number, screenH: number): Rect {
  switch (rotation) {
    case 90: return { x: screenH - (r.y + r.height), y: r.x, width: r.height, height: r.width };
    case 180: return { x: screenW - (r.x + r.width), y: screenH - (r.y + r.height), width: r.width, height: r.height };
    case 270: return { x: r.y, y: screenW - (r.x + r.width), width: r.height, height: r.width };
    default: return r;
  }
}

function sliceXml(chain: Chain, id: number): string {
  const t = (k: number): string => '\t'.repeat(k + 3);
  const input = corners(chain.input);
  const output = corners(chain.output);
  return `${t(0)}<Slice uniqueId="${id}">
${t(1)}<Params name="Common">
${t(2)}<Param name="Name" T="STRING" default="Layer" value="${esc(chain.name)}"/>
${t(2)}<Param name="Enabled" T="BOOL" default="1" value="1"/>
${t(1)}</Params>
${t(1)}<Params name="Input">
${t(2)}<ParamChoice name="Input Source" default="0:1" value="0:1" storeChoices="0"/>
${t(1)}</Params>
${t(1)}<Params name="Output">
${t(2)}<Param name="Flip" T="UINT8" default="0" value="0"/>
${t(1)}</Params>
${t(1)}<InputRect orientation="0">
${verts(input, t(2))}
${t(1)}</InputRect>
${t(1)}<OutputRect orientation="0">
${verts(output, t(2))}
${t(1)}</OutputRect>
${t(1)}<Warper>
${t(2)}<Params name="Warper">
${t(3)}<ParamChoice name="Point Mode" default="PM_LINEAR" value="PM_LINEAR" storeChoices="0"/>
${t(3)}<Param name="Flip" T="UINT8" default="0" value="0"/>
${t(2)}</Params>
${t(2)}<BezierWarper controlWidth="4" controlHeight="4">
${t(3)}<vertices>
${verts(bezierGrid(chain.output), t(4))}
${t(3)}</vertices>
${t(2)}</BezierWarper>
${t(2)}<Homography>
${t(3)}<src>
${verts(output, t(4))}
${t(3)}</src>
${t(3)}<dst>
${verts(output, t(4))}
${t(3)}</dst>
${t(2)}</Homography>
${t(1)}</Warper>
${t(0)}</Slice>`;
}

export interface ResolumeExportResult {
  xml: string;
  screens: number;
  slices: number;
  compositionWidth: number;
  compositionHeight: number;
  rotatedScreens: string[];
}

export function buildResolumeXml(projectName: string, screens: ExportScreen[]): ResolumeExportResult | null {
  const placed = screens.filter((screen) => screen.processor?.ports.some((port) => port.assignedCabinets.length > 0));
  if (placed.length === 0) return null;

  const compX = Math.min(...screens.map((screen) => screen.x));
  const compY = Math.min(...screens.map((screen) => screen.y));
  const compW = Math.max(...screens.map((screen) => screen.x + screen.width)) - compX;
  const compH = Math.max(...screens.map((screen) => screen.y + screen.height)) - compY;

  let seq = 0;
  const base = 1_800_000_000_000;
  const nextId = (): number => base + seq++;
  let sliceCount = 0;

  const screenBlocks = placed.map((screen) => {
    const { preset } = screen;
    const unrotatedW = screen.cols * preset.resolutionX;
    const unrotatedH = screen.rows * preset.resolutionY;
    const chains: Chain[] = [];
    for (const port of screen.processor!.ports) {
      const rects = port.assignedCabinets.map((key) => {
        const [col, row] = key.split('-').map(Number);
        return { x: col * preset.resolutionX, y: row * preset.resolutionY, width: preset.resolutionX, height: preset.resolutionY };
      });
      if (rects.length === 0) continue;
      const x0 = Math.min(...rects.map((r) => r.x));
      const y0 = Math.min(...rects.map((r) => r.y));
      const x1 = Math.max(...rects.map((r) => r.x + r.width));
      const y1 = Math.max(...rects.map((r) => r.y + r.height));
      const bounds = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
      const rotated = rotateRect(bounds, screen.rotation, unrotatedW, unrotatedH);
      chains.push({
        name: `${screen.name} ${port.controllerName ?? screen.processor!.model} ${port.sourcePortName ?? port.portId}`.trim(),
        input: { ...rotated, x: rotated.x + screen.x - compX, y: rotated.y + screen.y - compY },
        output: bounds
      });
    }
    // Растр процессора — bbox его портов; выход сдвигаем в его начало.
    const rx = Math.min(...chains.map((c) => c.output.x));
    const ry = Math.min(...chains.map((c) => c.output.y));
    const rw = Math.max(...chains.map((c) => c.output.x + c.output.width)) - rx;
    const rh = Math.max(...chains.map((c) => c.output.y + c.output.height)) - ry;
    chains.forEach((c) => { c.output = { ...c.output, x: c.output.x - rx, y: c.output.y - ry }; });
    sliceCount += chains.length;
    const name = esc(screen.name);
    const slices = chains.map((chain) => sliceXml(chain, nextId())).join('\n');
    return `\t\t\t<Screen name="${name}" uniqueId="${nextId()}">
\t\t\t\t<Params name="Params">
\t\t\t\t\t<Param name="Name" T="STRING" default="" value="${name}"/>
\t\t\t\t\t<Param name="Enabled" T="BOOL" default="1" value="1"/>
\t\t\t\t\t<Param name="Hidden" T="BOOL" default="0" value="0"/>
\t\t\t\t</Params>
\t\t\t\t<guides>
\t\t\t\t\t<ScreenGuide name="ScreenGuide" type="0"/>
\t\t\t\t\t<ScreenGuide name="ScreenGuide" type="1"/>
\t\t\t\t</guides>
\t\t\t\t<layers>
${slices}
\t\t\t\t</layers>
\t\t\t\t<OutputDevice>
\t\t\t\t\t<OutputDeviceVirtual name="${name}" deviceId="Virtual${name}" width="${rw}" height="${rh}"/>
\t\t\t\t</OutputDevice>
\t\t\t</Screen>`;
  });

  const v = ARENA_VERSION;
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<XmlState name="${esc(projectName.trim() || 'DL_SCREEN MASTER')}">
\t<versionInfo name="${v.name}" majorVersion="${v.majorVersion}" minorVersion="${v.minorVersion}" microVersion="${v.microVersion}" revision="${v.revision}"/>
\t<ScreenSetup name="ScreenSetup">
\t\t<Params name="ScreenSetupParams"/>
\t\t<CurrentCompositionTextureSize width="${compW}" height="${compH}"/>
\t\t<screens>
${screenBlocks.join('\n')}
\t\t</screens>
\t</ScreenSetup>
</XmlState>
`;
  return {
    xml, screens: placed.length, slices: sliceCount, compositionWidth: compW, compositionHeight: compH,
    rotatedScreens: placed.filter((screen) => screen.rotation !== 0).map((screen) => screen.name)
  };
}
