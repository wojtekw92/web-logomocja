// Value model. See docs/ARCHITEKTURA.md.
import { LogoError } from './errors.js'

export const TRUE = 'prawda'
export const FALSE = 'fałsz'

export const normName = (s) => String(s).toLocaleLowerCase('pl')

export class LogoObject {
  constructor({ name = '', className = '', parent = null } = {}) {
    this.name = name
    this.className = className
    this.parent = parent       // class object (LogoObject) or null
    this.vars = new Map()      // normName -> value
    this.procs = new Map()     // normName -> procedure def
    this.events = new Map()    // normName(event) -> runlist
  }
  /** Look up a variable through the class chain; returns {found, value, owner}. */
  findVar(name) {
    const k = normName(name)
    for (let o = this; o; o = o.parent) if (o.vars.has(k)) return { found: true, value: o.vars.get(k), owner: o }
    return { found: false }
  }
  findProc(name) {
    const k = normName(name)
    for (let o = this; o; o = o.parent) if (o.procs.has(k)) return o.procs.get(k)
    return undefined
  }
  findEvent(name) {
    const k = normName(name)
    for (let o = this; o; o = o.parent) if (o.events.has(k)) return o.events.get(k)
    return undefined
  }
}

export const isNumber = (v) => typeof v === 'number'
export const isWord = (v) => typeof v === 'string' || typeof v === 'number'
export const isList = (v) => Array.isArray(v)
export const isObject = (v) => v instanceof LogoObject

const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i

export function isNumeric(v) {
  if (typeof v === 'number') return Number.isFinite(v)
  if (typeof v === 'string') return NUM_RE.test(v.trim().replace(',', '.'))
  return false
}

export function toNumber(v, who) {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const s = v.trim().replace(',', '.')
    if (NUM_RE.test(s)) return Number(s)
  }
  throw badInput(who, v, 'nie jest liczbą')
}

export function toBool(v, who) {
  if (v === true) return true
  if (v === false) return false
  if (typeof v === 'string') {
    const n = normName(v)
    if (n === TRUE || n === 'true') return true
    if (n === FALSE || n === 'false') return false
    if (n === 'jld' || n === 'any') return Math.random() < 0.5
  }
  // Imagine numeric logic: <=0 false, >=1 true, 0<p<1 true with probability p
  if (isNumeric(v)) {
    const p = toNumber(v)
    return p <= 0 ? false : p >= 1 ? true : Math.random() < p
  }
  throw badInput(who, v, 'nie jest wartością logiczną')
}

/**
 * Wrong-input error per PRIMITYWY.md §15: `X nie lubi Y jako danej`.
 * Without `who`, the message is provisional (`Y nie jest liczbą`) and the error is flagged
 * `needsWho`; the interpreter rewrites it with the name of the primitive being called.
 */
export function badInput(who, v, fallback = 'nie jest poprawną daną') {
  const shown = formatValue(v) === '' ? '"' : formatValue(v)
  if (who) return new LogoError(`${who} nie lubi ${shown} jako danej`, { value: v })
  const e = new LogoError(`${shown} ${fallback}`, { value: v })
  e.needsWho = true
  return e
}

export const fromBool = (b) => (b ? TRUE : FALSE)

function formatNumber(n) {
  if (Number.isInteger(n)) return String(n)
  if (!Number.isFinite(n)) return String(n)
  return String(Number(n.toPrecision(6)))
}

/** Print a value like Logo does. top=true: a top-level list prints without outer brackets. */
export function formatValue(v, { top = false } = {}) {
  if (v === undefined || v === null) return ''
  if (typeof v === 'number') return formatNumber(v)
  if (typeof v === 'string') return v
  if (Array.isArray(v)) {
    const inner = v.map((x) => formatValue(x)).join(' ')
    return top ? inner : `[${inner}]`
  }
  if (v instanceof LogoObject) return v.name || `<${v.className || 'obiekt'}>`
  if (typeof v === 'boolean') return fromBool(v)
  return String(v)
}

export function equalValues(a, b) {
  if (isNumeric(a) && isNumeric(b)) return toNumber(a) === toNumber(b)
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((x, i) => equalValues(x, b[i]))
  }
  if (a instanceof LogoObject || b instanceof LogoObject) return a === b
  return normName(formatValue(a)) === normName(formatValue(b))
}
