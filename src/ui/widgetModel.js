// Widget model extraction (pure, no DOM). Owner: ui.
// Reads an Imagine UI object (Przycisk / Suwak / PoleTekstowe) defensively, so the renderer works
// whether prims/objects.js stores settings as JS fields, in `vars`, or behind getSetting().
import { normName } from '../core/values.js'

const KIND_BY_CLASS = new Map([
  ['przycisk', 'button'], ['button', 'button'],
  ['suwak', 'slider'], ['slider', 'slider'],
  ['poletekstowe', 'textbox'], ['textbox', 'textbox'], ['pole', 'textbox'],
  ['etykieta', 'label'], ['label', 'label'], ['napis', 'label'],
  ['panel', 'pane'], ['pane', 'pane'],
])
const KINDS = ['button', 'slider', 'textbox', 'label', 'pane']

/** 'button' | 'slider' | 'textbox' | 'label' | 'pane' | null — walks the class chain. */
export function widgetKind(obj) {
  if (!obj || typeof obj !== 'object') return null
  const direct = obj.widgetType ?? obj.widgetKind ?? obj.kind
  if (direct && KIND_BY_CLASS.has(normName(direct))) return KIND_BY_CLASS.get(normName(direct))
  if (direct && KINDS.includes(direct)) return direct
  for (let o = obj, i = 0; o && i < 20; o = o.parent, i++) {
    for (const n of [o.className, o.name]) {
      if (n && KIND_BY_CLASS.has(normName(n))) {
        // a class object itself is not a widget instance
        if (o === obj && o.name && KIND_BY_CLASS.has(normName(o.name)) && !obj.parent) return null
        return KIND_BY_CLASS.get(normName(n))
      }
    }
  }
  return null
}

/** Read a setting: JS field (EN/PL names), then getSetting(PL), then vars. */
export function readProp(obj, names) {
  for (const n of names) if (obj[n] !== undefined && typeof obj[n] !== 'function') return obj[n]
  if (typeof obj.getSetting === 'function') {
    for (const n of names) {
      try {
        const v = obj.getSetting(n)
        if (v !== undefined) return v
      } catch { /* not a setting */ }
    }
  }
  if (obj.vars instanceof Map) for (const n of names) { const k = normName(n); if (obj.vars.has(k)) return obj.vars.get(k) }
  return undefined
}

const num = (v, d) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : d
}
const bool = (v, d) => (v === undefined || v === null ? d : v === true || v === 'prawda' || v === 'true' || v === 1)
const pair = (v) => (Array.isArray(v) && v.length >= 2 ? [num(v[0], 0), num(v[1], 0)] : null)

export const DEFAULT_SIZES = { button: [90, 28], slider: [160, 24], textbox: [160, 60], label: [100, 22], pane: [200, 150] }

/**
 * Normalised model: {kind, name, x, y, width, height, caption, value, min, max, step, vertical,
 * contents, visible, background, color, anchor}. (x, y) = logo position of the anchor point;
 * anchor 'topleft' (default) or 'center' (when the object says so via `anchor`/`posAnchor`).
 */
export function widgetModel(obj) {
  const kind = widgetKind(obj)
  if (!kind) return null
  // docs/WIDGETS.md contract (prims/objects.js): snapshot() gives the exact renderer fields,
  // (x, y) = logo coordinates of the TOP-LEFT corner.
  if (typeof obj.snapshot === 'function') {
    const s = obj.snapshot()
    const k = KINDS.includes(s.kind) ? s.kind : kind
    return {
      kind: k,
      name: s.name ?? obj.name,
      x: num(s.x, 0),
      y: num(s.y, 0),
      width: Math.max(4, num(s.width, DEFAULT_SIZES[k][0])),
      height: Math.max(4, num(s.height, DEFAULT_SIZES[k][1])),
      caption: s.caption === undefined || s.caption === null ? String(s.name ?? '') : formatPlain(s.caption),
      value: k === 'slider' ? num(s.value, num(s.min, 0)) : s.value,
      min: num(s.min, 0),
      max: num(s.max, 100),
      step: 'any',
      vertical: !!s.vertical,
      contents: s.text === undefined || s.text === null ? '' : String(s.text),
      visible: s.visible !== false,
      background: colorCss(s.background),
      color: '',
      anchor: 'topleft',
      page: s.page ?? null,
    }
  }
  const pos = pair(readProp(obj, ['pos', 'poz', 'position'])) ?? [num(obj.x, 0), num(obj.y, 0)]
  const size = pair(readProp(obj, ['size', 'rozmiar'])) ?? [num(obj.width, DEFAULT_SIZES[kind][0]), num(obj.height, DEFAULT_SIZES[kind][1])]
  const min = num(readProp(obj, ['min']), 0)
  const max = num(readProp(obj, ['max', 'maks']), 100)
  let value = readProp(obj, ['value', 'wartość', 'contents', 'zawartość'])
  const contents = readProp(obj, ['contents', 'zawartość', 'text', 'tekst'])
  const caption = readProp(obj, ['caption', 'napis', 'label'])
  return {
    kind,
    name: obj.name,
    x: pos[0],
    y: pos[1],
    width: Math.max(4, size[0]),
    height: Math.max(4, size[1]),
    caption: caption === undefined ? obj.name : formatPlain(caption),
    value: kind === 'slider' ? num(value, min) : value,
    min,
    max,
    step: num(readProp(obj, ['step', 'krok']), 0) || 'any',
    vertical: bool(readProp(obj, ['vertical', 'pionowy']), false),
    contents: contents === undefined ? '' : formatPlain(contents).replace(/¶/g, '\n'),
    visible: bool(readProp(obj, ['visible', 'widoczny']), true),
    background: colorCss(readProp(obj, ['bgColor', 'kolTła', 'background'])),
    color: colorCss(readProp(obj, ['color', 'kolor', 'textColor'])),
    anchor: obj.anchor ?? obj.posAnchor ?? 'topleft',
    page: typeof obj.page === 'string' ? obj.page : obj.page?.name ?? null,
  }
}

function formatPlain(v) {
  if (Array.isArray(v)) return v.map((x) => (Array.isArray(x) ? '[' + formatPlain(x) + ']' : String(x))).join(' ')
  return String(v)
}

function colorCss(c) {
  if (!c) return ''
  if (typeof c === 'object' && c.css) return c.css
  if (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c)) return c
  return ''
}

/** CSS pixel rectangle (left, top, width, height) of a widget model on a page of pw×ph. */
export function widgetRect(m, pw, ph) {
  let left = m.x + pw / 2
  let top = ph / 2 - m.y
  if (m.anchor === 'center') { left -= m.width / 2; top -= m.height / 2 }
  return { left, top, width: m.width, height: m.height }
}

/** All widget objects of a world: world.widgets (array/Map/Set) or objects whose class is a widget class. */
export function listWidgets(world) {
  const w = world?.widgets
  let items
  if (w) items = w instanceof Map ? [...w.values()] : [...w]
  else items = world?.objects ? [...world.objects.values()] : []
  return items.filter((o) => widgetKind(o))
}
