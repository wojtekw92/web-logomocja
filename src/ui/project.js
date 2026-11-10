// Project files (pure logic, no DOM). Owner: ui.
//
// `.lgm` project = plain Logomocja source text, so example programs and saved projects share
// one loader (run the text, then `starter` if it is defined — PRIMITYWY.md §16):
//
//   ; Logomocja Web — projekt "nazwa"
//   oto kwadrat :a ... już           (every user procedure, in definition order)
//   przypisz "x 5                    (global variables; Imagine objects are skipped)
//   ;@obraz data:image/png;base64,…  (optional page drawing; a comment for the interpreter)
//
// `.imp` (Logomocja 2.0, header `LGF05 … polishTX`): we import `definiuj'Nazwa |…|` lines with `¶`
// as newline (PRIMITYWY.md §17.17); objects and the binary IMZ1 block are skipped.
import { LogoObject, normName } from '../core/values.js'
import { readLines, isMarkedLiteral } from '../core/lexer.js'
import { parse } from '../core/parser.js'

export const PROJECT_HEADER = '; Logomocja Web — projekt'
export const IMAGE_MARK = ';@obraz '

/** Number literal that round-trips exactly. */
function numberText(n) {
  if (!Number.isFinite(n)) return String(n)
  return String(n)
}

/** A word as it must appear inside a list literal. */
function wordInList(w) {
  const s = String(w)
  if (s === '') return '||'
  if (/[\s\[\]()|;¶]/.test(s)) return '|' + s.replace(/\|/g, '') + '|'
  return s
}

/** Logo source that evaluates to `v` (for `przypisz "x <here>`). Returns undefined if impossible. */
export function valueToSource(v) {
  if (v === undefined || v === null) return undefined
  if (v instanceof LogoObject) return undefined
  if (typeof v === 'number') return numberText(v)
  if (typeof v === 'boolean') return v ? '"prawda' : '"fałsz'
  if (typeof v === 'string') {
    if (v === '') return '"||'
    if (/[\s\[\]()|;¶]/.test(v)) return '"|' + v.replace(/\|/g, '') + '|'
    return '"' + v
  }
  if (Array.isArray(v)) {
    const inner = listInner(v)
    return inner === undefined ? undefined : '[' + inner + ']'
  }
  return undefined
}

function listInner(list) {
  const parts = []
  for (const x of list) {
    if (Array.isArray(x)) {
      const inner = listInner(x)
      if (inner === undefined) return undefined
      parts.push('[' + inner + ']')
    } else if (x instanceof LogoObject) {
      parts.push(wordInList(x.name))
    } else if (typeof x === 'number') parts.push(numberText(x))
    else if (typeof x === 'boolean') parts.push(x ? 'prawda' : 'fałsz')
    else if (typeof x === 'string') parts.push(wordInList(x))
    else return undefined
  }
  return parts.join(' ')
}

/**
 * Build `.lgm` text.
 * @param {{name?:string, procedures: string[] (source texts), globals?: Map|Iterable<[name,value]>,
 *          image?: string (data URL), extra?: string}} p
 */
export function buildProject({ name = '', procedures = [], globals = new Map(), image = '', extra = '' } = {}) {
  const lines = [PROJECT_HEADER + (name ? ` "${name}"` : ''), `; zapisano ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`, '']
  for (const src of procedures) {
    const t = String(src).replace(/\s+$/, '')
    if (t) lines.push(t, '')
  }
  const gl = []
  for (const [k, v] of globals) {
    const s = valueToSource(v)
    if (s !== undefined && /^[^\s\[\]()|;"':]+$/.test(k)) gl.push(`przypisz "${k} ${s}`)
  }
  if (gl.length) lines.push('; zmienne globalne', ...gl, '')
  if (extra) lines.push(String(extra), '')
  if (image) lines.push(IMAGE_MARK + image)
  return lines.join('\n').replace(/\n+$/, '') + '\n'
}

/** Split `.lgm` text into {source, image}: the `;@obraz` line is removed from the source. */
export function parseProject(text) {
  let image = ''
  const kept = []
  for (const line of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    if (line.startsWith(IMAGE_MARK)) image = line.slice(IMAGE_MARK.length).trim()
    else kept.push(line)
  }
  return { source: repairMissingEnds(kept.join('\n')), image }
}

const START_WORDS = new Set(['oto', 'to'])
const END_WORDS = new Set(['już', 'end'])
const wordAt = (items, i) => (typeof items[i] === 'string' && !isMarkedLiteral(items, i) ? normName(items[i]) : null)

/**
 * Older saves could contain a procedure whose source lacked the closing `już` (accepted at the end
 * of a text). Insert the missing `już` before the next `oto`, so such a project still loads.
 * Text that cannot be read at all is returned unchanged (the run reports the real error).
 */
export function repairMissingEnds(source) {
  let lines
  try { lines = readLines(source) } catch { return source }
  const inserts = []
  let open = false
  for (const L of lines) {
    const first = wordAt(L.items, 0)
    if (START_WORDS.has(first)) {
      if (open) inserts.push(L.start)
      // one-line `oto kw :b … już` closes itself
      open = !(L.items.length > 2 && END_WORDS.has(wordAt(L.items, L.items.length - 1)))
    } else if (END_WORDS.has(first)) open = false
  }
  if (!inserts.length) return source
  let out = source
  for (const at of inserts.reverse()) out = out.slice(0, at) + 'już\n' + out.slice(at)
  return out
}

/**
 * Source of the top-level `przypisz` lines (global variables) of a project, as whole logical
 * lines: a multi-line `"|a¶b|` value stays one instruction. Procedure bodies are not included.
 */
export function globalsSource(source) {
  let parsed, lines
  try { parsed = parse(source); lines = readLines(source) } catch { return '' }
  const wanted = new Set(parsed.bodyLines.filter((L) => wordAt(L.items, 0) === 'przypisz').map((L) => L.line))
  return lines.filter((L) => wanted.has(L.line)).map((L) => source.slice(L.start, L.end)).join('\n')
}

/** True for a Logomocja 2.0 / Imagine `.imp` project text. */
export function isImp(text) {
  const head = String(text).slice(0, 64)
  return /^\s*LGF\d\d/.test(head) || /definiuj'[^\s|]+\s*\|/.test(String(text))
}

/**
 * Extract procedure definitions from `.imp` text.
 * Returns [{name, owner, source}] where `owner` is the object prefix for `ż1'definiuj'x` style lines
 * (null for main-window procedures) and `source` has `¶` replaced by newlines.
 */
export function extractImp(text) {
  const t = String(text)
  const out = []
  const re = /(?:^|[\s\x00-\x1f])((?:[^\s'|\x00-\x1f]+')*)(?:definiuj|define)'([^\s|'\x00-\x1f]+)\s*\|([^|]*)\|/giu
  let m
  while ((m = re.exec(t))) {
    const prefix = m[1] ? m[1].replace(/'$/, '') : ''
    const body = m[3].replace(/\r\n|\r|\n/g, '¶').replace(/¶/g, '\n')
    out.push({ name: m[2], owner: prefix || null, source: normalizeImpBody(m[2], body) })
  }
  return out
}

/** `.imp` bodies may store the whole `oto … już` text or only the lines after the header. */
function normalizeImpBody(name, body) {
  const trimmed = body.replace(/^\s+/, '')
  if (/^(oto|to)\s/i.test(trimmed)) return /\n\s*(już|end)\s*$/i.test(trimmed.replace(/\s+$/, '')) ? trimmed : trimmed.replace(/\s*$/, '\njuż')
  // only parameters + lines: first line may be the parameter list (":a :b")
  const lines = trimmed.split('\n')
  let header = `oto ${name}`
  if (lines.length && /^(\s*:[^\s]+)+\s*$/.test(lines[0])) header += ' ' + lines.shift().trim()
  return [header, ...lines, 'już'].join('\n')
}

/** Decode bytes: UTF-8 when valid, else Windows-1250 (Polish Windows, `.imp` files). */
export function decodeBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  try {
    const s = new TextDecoder('utf-8', { fatal: true }).decode(u8)
    return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
  } catch {
    try { return new TextDecoder('windows-1250').decode(u8) } catch { return new TextDecoder('latin1').decode(u8) }
  }
}

/** Safe file name for a download. */
export function fileNameFor(name, ext = '.lgm') {
  const base = String(name || 'projekt').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_') || 'projekt'
  return base.toLowerCase().endsWith(ext) ? base : base + ext
}
