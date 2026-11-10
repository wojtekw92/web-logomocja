// Parser: top-level source -> runnable body + procedure definitions.
// See docs/ARCHITEKTURA.md (Reader) and docs/PRIMITYWY.md §1.2.
//
//   parse(source) -> {
//     body:        Array                       flat Logo list of all top-level instructions
//     bodyLines:   [{items:Array, line:number}] top-level logical lines (run one by one)
//     definitions: [Definition]
//   }
//
//   Definition = {
//     name, params: string[]            required inputs (without ':'),
//     optionalParams: [{name, default: Array}]   UCB-style `[:b 5]` (default = runlist evaluated at call),
//     restParam: string|null            UCB-style `[:reszta]` (gets a list of the remaining inputs),
//     defaultArity: number              inputs consumed without parentheses (Imagine `[n]` sets it),
//     minArity, maxArity               bounds for calls in parentheses (maxArity may be Infinity),
//     blankMissing: boolean             Imagine `[n]` style: missing inputs get the empty word,
//     lines: Array<Array>               body, one Logo list per logical line,
//     lineNumbers: number[]             source line of each body line (relative to the parsed text),
//     body: Array                       flat body (all lines concatenated),
//     sourceText: string                exact text from `oto` to `już` (for the editor),
//     line: number                      line of the `oto` header
//   }
//
// `oto`/`to` must be the first word of a logical line; the definition ends at a line whose first
// word is `już`/`end` (or at end of text). `już` outside a definition -> error `już bez oto`.

import { LogoError } from './errors.js'
import { normName } from './values.js'
import { readLines, isMarkedLiteral, markLiteral } from './lexer.js'

export const DEF_START = new Set(['oto', 'to'])
export const DEF_END = new Set(['już', 'end'])

const isStart = (w) => typeof w === 'string' && DEF_START.has(normName(w))
const isEnd = (w) => typeof w === 'string' && DEF_END.has(normName(w))

/** Parse a Logo program. Throws LogoError on reader errors (`Brakuje ]`, `już bez oto`...). */
export function parse(source) {
  const src = String(source ?? '')
  const lines = readLines(src)
  const bodyLines = []
  const definitions = []
  let k = 0
  while (k < lines.length) {
    const L = lines[k]
    const first = L.items[0]
    if (isEnd(first)) throw new LogoError(`${first} bez oto`, { line: L.line })
    if (!isStart(first)) {
      if (L.items.length) bodyLines.push({ items: L.items, line: L.line })
      k++
      continue
    }
    // definition
    const header = L
    const def = parseHeader(header.items, header.line)
    const bodyLs = []
    const lineNumbers = []
    let endLine = null
    k++
    while (k < lines.length) {
      const B = lines[k]
      const f = B.items[0]
      if (isEnd(f)) { endLine = B; k++; break }
      if (isStart(f)) throw new LogoError(`Brakuje już w procedurze ${def.name}`, { line: B.line, procedure: def.name })
      if (B.items.length) {
        bodyLs.push(B.items)
        lineNumbers.push(B.line)
      }
      k++
    }
    const last = endLine ?? lines[k - 1] ?? header
    def.sourceText = src.slice(header.start, last.end)
    finishDef(def, bodyLs, lineNumbers)
    definitions.push(def)
  }
  const body = []
  for (const l of bodyLines) appendItems(body, l.items)
  return { body, bodyLines, definitions }
}

function appendItems(out, items) {
  const base = out.length
  for (let i = 0; i < items.length; i++) {
    out.push(items[i])
    if (isMarkedLiteral(items, i)) markLiteral(out, base + i)
  }
}

/** Parse `oto nazwa :a :b [:c 5] [:reszta] [2]` (items include the leading `oto`). */
export function parseHeader(items, line) {
  const name = items[1]
  if (name === undefined || Array.isArray(name)) throw new LogoError(`Za mało danych dla ${items[0] ?? 'oto'}`, { line })
  const def = newDef(String(name))
  def.line = line
  const rest = items.slice(2)
  for (const it of rest) {
    // header items: `:x` inputs or `[...]` (optional/rest/default count). Anything else (e.g. a
    // one-line `oto kw :b powtórz 4 [...] już`) is an error rather than silently becoming inputs.
    if (Array.isArray(it)) continue
    if (typeof it === 'string' && it[0] === ':' && it.length > 1) continue
    throw new LogoError(`${items[0]} nie lubi ${it} jako danej`, { line, procedure: def.name })
  }
  parseParamSpec(def, rest, line)
  return def
}

function newDef(name) {
  return {
    name,
    params: [],
    optionalParams: [],
    restParam: null,
    defaultArity: 0,
    minArity: 0,
    maxArity: 0,
    blankMissing: false,
    lines: [],
    lineNumbers: [],
    body: [],
    sourceText: '',
    line: 0,
  }
}

const stripColon = (w) => {
  const s = String(w)
  return s[0] === ':' || s[0] === '"' ? s.slice(1) : s
}

/** Fill params of def from a list of header items (`:a`, `a`, `[:b 5]`, `[:rest]`, `[n]`). */
export function parseParamSpec(def, items, line) {
  let explicitDefault = null
  for (const it of items) {
    if (Array.isArray(it)) {
      if (it.length === 1 && typeof it[0] === 'number') {
        explicitDefault = it[0]
      } else if (it.length === 1) {
        def.restParam = stripColon(it[0])
      } else if (it.length >= 2) {
        def.optionalParams.push({ name: stripColon(it[0]), default: it.slice(1) })
      }
      continue
    }
    if (typeof it === 'number') {
      explicitDefault = it
      continue
    }
    const p = stripColon(it)
    if (!p) continue
    def.params.push(p)
  }
  const nReq = def.params.length
  const nAll = nReq + def.optionalParams.length
  if (explicitDefault !== null) {
    // Imagine style: `oto podwój :co :ile [1]` -> 1 input by default, more/less in parentheses,
    // missing inputs are empty.
    def.defaultArity = Math.max(0, Math.round(explicitDefault))
    def.blankMissing = true
    def.minArity = 0
    def.maxArity = def.restParam ? Infinity : Math.max(nAll, def.defaultArity)
  } else {
    def.defaultArity = nReq
    def.minArity = nReq
    def.maxArity = def.restParam ? Infinity : nAll
  }
  return def
}

function finishDef(def, lines, lineNumbers) {
  def.lines = lines
  def.lineNumbers = lineNumbers
  const body = []
  for (const l of lines) appendItems(body, l)
  def.body = body
  return def
}

/**
 * Build a definition from the `definiuj`/`tekst` list form:
 *   [[:a :b] [wiersz1] [wiersz2]]   (parameter words with or without ':')
 */
export function defFromList(name, list) {
  if (!Array.isArray(list) || !Array.isArray(list[0] ?? [])) {
    throw new LogoError(`definiuj nie lubi ${Array.isArray(list) ? '[...]' : list} jako danej`)
  }
  const def = newDef(String(name))
  parseParamSpec(def, list[0] ?? [], 0)
  const lines = list.slice(1).map((l) => (Array.isArray(l) ? l : [l]))
  finishDef(def, lines, lines.map((_, i) => i + 2))
  def.sourceText = defToSource(def)
  return def
}

/** The `tekst` list of a definition: [[params...] [line1] [line2] ...]. */
export function defToList(def) {
  const params = [...def.params]
  for (const o of def.optionalParams) params.push([o.name, ...o.default])
  if (def.restParam) params.push([def.restParam])
  if (def.blankMissing) params.push(def.defaultArity)
  return [params, ...def.lines]
}

function fmtItem(v) {
  if (Array.isArray(v)) return '[' + v.map(fmtItem).join(' ') + ']'
  if (typeof v === 'string' && /[\s\[\]()|;]/.test(v)) return '|' + v + '|'
  return String(v)
}

/** Regenerate source text `oto ... już` for a definition (used when no source text was kept). */
export function defToSource(def) {
  const head = ['oto', def.name, ...def.params.map((p) => ':' + p)]
  for (const o of def.optionalParams) head.push('[:' + o.name + ' ' + o.default.map(fmtItem).join(' ') + ']')
  if (def.restParam) head.push('[:' + def.restParam + ']')
  if (def.blankMissing) head.push('[' + def.defaultArity + ']')
  const body = def.lines.map((l) => '  ' + l.map(fmtItem).join(' '))
  return [head.join(' '), ...body, 'już'].join('\n')
}

/**
 * True when the text is an unfinished command-line entry: an open `[` or an `oto` without `już`.
 * The UI uses it to switch the prompt from `? ` to `> `.
 */
export function needsMoreInput(source) {
  let lines
  try {
    lines = readLines(source)
  } catch (e) {
    return e instanceof LogoError && e.message === 'Brakuje ]'
  }
  let open = false
  for (const L of lines) {
    const f = L.items[0]
    if (isStart(f)) open = true
    else if (isEnd(f)) open = false
  }
  return open
}
