// Colour model — PRIMITYWY.md §3. Owner: graphics.
//
// A resolved colour is a plain object `{ r, g, b, css }` (0–255 ints, css = '#rrggbb').
// Accepted Logo forms (resolveColor):
//   - number 0–15 (or numeric word) → basic palette §3.2
//   - colour name (PL or EN, case-insensitive) with optional brightness suffix 1–12 (§3.3, §3.4)
//   - [r g b] list (elements may be `jld`)
//   - `jld` / `any` → random colour
//   - an already-resolved {r,g,b} object, or '#rrggbb' (extension)
// colorToLogo(c) → palette number 0–15 if the colour is exactly in the palette, else [r g b] (§3.1).
import { LogoError } from '../core/errors.js'
import { random as sharedRandom } from '../core/values.js'
import { normName, formatValue, isNumeric, toNumber } from '../core/values.js'

const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function makeColor(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0)))
  r = c(r); g = c(g); b = c(b)
  const css = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
  return { r, g, b, css }
}

/** §3.2 basic palette, index 0–15 (Windows VGA order). */
export const PALETTE = [
  '#000000', '#000080', '#008000', '#008080', '#800000', '#800080', '#808000', '#C0C0C0',
  '#808080', '#0000FF', '#00FF00', '#00FFFF', '#FF0000', '#FF00FF', '#FFFF00', '#FFFFFF',
].map((h) => { const { r, g, b } = hex(h); return makeColor(r, g, b) })

/** §3.3 — names returned by `kolory`, in order. */
export const IMAGINE_COLOR_NAMES = [
  'biały', 'czarny', 'purpurowy', 'różowy', 'fioletowy', 'ciemnoniebieski', 'niebieski',
  'jasnoniebieski', 'błękitny', 'ciemnozielony', 'zielony', 'oliwkowy', 'żółty', 'pomarańczowy',
  'brązowy', 'jasnoczerwony', 'czerwony', 'szary',
]

// family key -> { base hex, grey: boolean }. Names (§3.3) win over palette (§3.2) where they differ.
const FAMILIES = {
  biały: { hex: '#FFFFFF', grey: true, greyBase: 12 },
  czarny: { hex: '#000000', grey: true, greyBase: 1 },
  purpurowy: { hex: '#FF00FF' },
  różowy: { hex: '#FF80C0' },
  fioletowy: { hex: '#8000C0' },
  ciemnoniebieski: { hex: '#000080' },
  niebieski: { hex: '#0000FF' },
  jasnoniebieski: { hex: '#0CB0F4' },
  błękitny: { hex: '#00FFFF' },
  ciemnozielony: { hex: '#008000' },
  zielony: { hex: '#00C000' },
  oliwkowy: { hex: '#808000' },
  żółty: { hex: '#FFFF00' },
  pomarańczowy: { hex: '#FF8000' },
  brązowy: { hex: '#8C6A4F' },
  jasnoczerwony: { hex: '#FF6060' },
  czerwony: { hex: '#FF0000' },
  szary: { hex: '#808080', grey: true, greyBase: 6 },
  jasnoszary: { hex: '#C0C0C0', grey: true, greyBase: 9 },
  // extra palette-only names from §3.2
  morski: { hex: '#008080' },
  bordowy: { hex: '#800000' },
  limonkowy: { hex: '#00FF00' },
}

// alias (normName) -> family key
const ALIASES = new Map()
for (const k of Object.keys(FAMILIES)) ALIASES.set(normName(k), k)
for (const [alias, k] of Object.entries({
  white: 'biały', black: 'czarny', magenta: 'purpurowy', pink: 'różowy', purple: 'fioletowy',
  darkblue: 'ciemnoniebieski', navy: 'ciemnoniebieski', blue: 'niebieski', paleblue: 'jasnoniebieski',
  cyan: 'błękitny', darkgreen: 'ciemnozielony', green: 'zielony', olive: 'oliwkowy', yellow: 'żółty',
  orange: 'pomarańczowy', taupe: 'brązowy', brown: 'brązowy', palered: 'jasnoczerwony', red: 'czerwony',
  grey: 'szary', gray: 'szary', lightgrey: 'jasnoszary', lightgray: 'jasnoszary', silver: 'jasnoszary',
  teal: 'morski', maroon: 'bordowy', lime: 'limonkowy',
})) ALIASES.set(alias, k)

/** §3.4 lightness per suffix (index 1..12; 6 = base). */
export const SUFFIX_L = [null, 0.08, 0.16, 0.25, 0.33, 0.42, null, 0.60, 0.705, 0.75, 0.82, 0.89, 0.95]
// Grey family: szary1 = #000, szary12 = #FFF, szary9 = #C0C0C0 (exact), szary6 = #808080.
const GREY_LEVELS = [null, 0, 41, 64, 84, 107, 128, 153, 180, 192, 209, 227, 255]

// §3.4 control values from EN-help are pinned exactly (the HSL approximation misses some by a few units).
const PINNED = {
  czerwony8: [255, 104, 104],
  jasnoniebieski8: [104, 208, 248],
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = d / (1 - Math.abs(2 * l - 1))
  let h
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  if (h < 0) h += 360
  return { h, s: Math.min(1, s), l }
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

/** Resolve a colour name (with optional 1–12 suffix). Returns {r,g,b,css} or undefined. */
export function colorFromName(name) {
  const n = normName(name).trim()
  const m = /^(.*?)(\d{1,2})?$/.exec(n)
  const key = ALIASES.get(m[1])
  if (!key) return undefined
  const fam = FAMILIES[key]
  let suffix = m[2] === undefined ? null : Number(m[2])
  if (suffix !== null && (suffix < 1 || suffix > 12)) return undefined
  if (suffix === null) {
    const { r, g, b } = hex(fam.hex)
    return makeColor(r, g, b)
  }
  const pin = PINNED[key + suffix]
  if (pin) return makeColor(...pin)
  if (fam.grey) {
    const v = GREY_LEVELS[suffix]
    return makeColor(v, v, v)
  }
  if (suffix === 6) { const { r, g, b } = hex(fam.hex); return makeColor(r, g, b) }
  const base = hex(fam.hex)
  const { h, s } = rgbToHsl(base.r, base.g, base.b)
  return makeColor(...hslToRgb(h, s, SUFFIX_L[suffix]))
}

const isAny = (v) => typeof v === 'string' && (normName(v) === 'jld' || normName(v) === 'any')
const rnd256 = () => Math.floor(sharedRandom() * 256)

function bad(v, who) {
  return new LogoError(`${who || 'kolor'} nie lubi ${formatValue(v)} jako danej`)
}

/**
 * Resolve any Logo colour form to {r,g,b,css}. Throws LogoError `<who> nie lubi X jako danej`.
 * @param {*} v
 * @param {string} [who] primitive name for the error message
 */
export function resolveColor(v, who) {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'r' in v && 'g' in v && 'b' in v) {
    return makeColor(v.r, v.g, v.b)
  }
  if (isAny(v)) return makeColor(rnd256(), rnd256(), rnd256())
  if (Array.isArray(v)) {
    if (v.length !== 3) throw bad(v, who)
    const parts = v.map((x) => {
      if (isAny(x)) return rnd256()
      if (!isNumeric(x)) throw bad(v, who)
      return toNumber(x)
    })
    return makeColor(...parts)
  }
  if (isNumeric(v)) {
    const n = Math.round(toNumber(v))
    if (n >= 0 && n <= 15) return PALETTE[n]
    throw bad(v, who)
  }
  if (typeof v === 'string') {
    if (/^#[0-9a-f]{6}$/i.test(v)) { const { r, g, b } = hex(v); return makeColor(r, g, b) }
    const c = colorFromName(v)
    if (c) return c
  }
  throw bad(v, who)
}

/** Palette index of an exact colour, or -1. */
export function paletteIndex(c) {
  return PALETTE.findIndex((p) => p.r === c.r && p.g === c.g && p.b === c.b)
}

/** Colour → Logo value: number 0–15 if in palette, else [r g b] (§3.1). */
export function colorToLogo(c) {
  if (!c) return []
  const i = paletteIndex(c)
  return i >= 0 ? i : [c.r, c.g, c.b]
}

/** `naRGB` helper: any colour form → [r g b]. */
export function toRGBList(v, who) {
  const c = resolveColor(v, who)
  return [c.r, c.g, c.b]
}

export const sameColor = (a, b) => !!a && !!b && a.r === b.r && a.g === b.g && a.b === b.b

export const BLACK = PALETTE[0]
export const WHITE = PALETTE[15]
