import React, { useMemo, useState } from 'react';

export function ProjectionMaskSection(): JSX.Element {
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [projectors, setProjectors] = useState(2);
  const [overlap, setOverlap] = useState(160);
  const previewColumns = useMemo(() => `repeat(${projectors}, 1fr)`, [projectors]);

  async function exportProjectionMasks(): Promise<void> {
    for (let index = 0; index < projectors; index += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      if (overlap > 0 && index > 0) {
        const gradient = context.createLinearGradient(0, 0, overlap, 0);
        gradient.addColorStop(0, '#000');
        gradient.addColorStop(1, '#fff');
        context.fillStyle = gradient;
        context.fillRect(0, 0, overlap, height);
      }
      if (overlap > 0 && index < projectors - 1) {
        const gradient = context.createLinearGradient(width - overlap, 0, width, 0);
        gradient.addColorStop(0, '#fff');
        gradient.addColorStop(1, '#000');
        context.fillStyle = gradient;
        context.fillRect(width - overlap, 0, overlap, height);
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const saved = await window.imageFiles.savePng(bytes, `projection-mask-${index + 1}-${width}x${height}.png`);
      if (!saved) break;
    }
  }

  return (
    <section className="projection-section">
      <header>
        <div>
          <h1>Проекционные маски</h1>
          <p>Создание soft-edge масок для горизонтального совмещения проекторов.</p>
        </div>
        <button type="button" onClick={() => void exportProjectionMasks()}>Экспортировать PNG</button>
      </header>
      <div className="projection-layout">
        <aside>
          <fieldset>
            <legend>Проектор</legend>
            <label>Ширина, px<input type="number" min={64} value={width} onChange={(event) => setWidth(Math.max(64, Number(event.target.value)))} /></label>
            <label>Высота, px<input type="number" min={64} value={height} onChange={(event) => setHeight(Math.max(64, Number(event.target.value)))} /></label>
            <label>Количество<input type="number" min={1} max={12} value={projectors} onChange={(event) => setProjectors(Math.min(12, Math.max(1, Number(event.target.value))))} /></label>
            <label>Перекрытие, px<input type="number" min={0} max={Math.floor(width / 2)} value={overlap} onChange={(event) => setOverlap(Math.min(width / 2, Math.max(0, Number(event.target.value))))} /></label>
          </fieldset>
          <p className="field-hint">Каждая маска экспортируется в разрешении выбранного проектора. В зоне перекрытия создаётся линейный градиент яркости.</p>
        </aside>
        <div className="projection-preview" style={{ gridTemplateColumns: previewColumns }}>
          {Array.from({ length: projectors }, (_, index) => (
            <div key={index} className="projection-tile">
              <span>Проектор {index + 1}</span>
              {index > 0 && <i className="fade-left" style={{ width: `${Math.min(45, overlap / width * 100)}%` }} />}
              {index < projectors - 1 && <i className="fade-right" style={{ width: `${Math.min(45, overlap / width * 100)}%` }} />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
