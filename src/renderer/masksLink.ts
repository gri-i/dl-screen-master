/**
 * Ссылка из дизайна (CRM) в подпрограмму «Маски».
 *
 * Дизайн открывает `/masks/?wall=…&doc=…&preset=…&model=…&cols=…&rows=…&name=…`.
 * `wall` — id узла LED-стены: по нему маска привязывается к ноде, чтобы повторное
 * открытие показывало тот же экран. `preset` — id модели в каталоге кабинетов,
 * `model` — запасной признак, если id не совпал (например, старый каталог).
 */
export interface MasksLink {
  doc: string | null;
  wall: string;
  preset: string | null;
  model: string | null;
  cols: number;
  rows: number;
  name: string | null;
}

export const MAX_GRID = 100;

function text(value: string | null, limit = 200): string | null {
  const trimmed = (value || '').trim();
  return trimmed ? trimmed.slice(0, limit) : null;
}

function grid(value: string | null): number | null {
  const number = Number.parseInt(value || '', 10);
  return Number.isInteger(number) && number >= 1 && number <= MAX_GRID ? number : null;
}

/** Разбирает query масок; null — если это обычный запуск, а не из узла стены. */
export function parseMasksLink(search: string): MasksLink | null {
  const params = new URLSearchParams(search);
  const wall = text(params.get('wall'));
  const preset = text(params.get('preset'));
  const model = text(params.get('model'));
  const cols = grid(params.get('cols'));
  const rows = grid(params.get('rows'));
  // Без стены или без кабинета/сетки привязывать нечего — обычный запуск.
  if (!wall || (!preset && !model) || !cols || !rows) return null;
  return {
    doc: text(params.get('doc')),
    wall,
    preset,
    model,
    cols,
    rows,
    name: text(params.get('name'), 120)
  };
}
