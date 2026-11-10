// Primitives module: words & lists — PRIMITYWY.md §10.
// Owner: prims-data. See docs/ARCHITEKTURA.md for ownership and docs/PRIMITYWY.md for names.
//
// Conventions:
// - A number is a word: `pierw 123` gives `1`, `długość 3.5` gives 3 (via formatValue).
// - Word fragments are returned as JS strings (numeric strings still work as numbers).
// - Characters are split with Array.from (code points).
// - Membership/position tests are case-insensitive, like `=` (equalValues / normName).
// - Wrong inputs throw `badInput(undefined, v)`; the interpreter writes `X nie lubi Y jako danej`
//   using the primitive name as typed.
// - `ascii` / `znak` use Windows-1250 for codes 128–255 (§17.16), Unicode otherwise.
import { LogoError } from '../core/errors.js'
import { normName, toNumber, toBool, fromBool, badInput, equalValues, isNumeric, formatValue, isList } from '../core/values.js'
import { randomInt } from './math.js'

// ---------------------------------------------------------------------------------- helpers

const isWordValue = (v) => typeof v === 'string' || typeof v === 'number'

function wordText(v) {
  if (!isWordValue(v)) throw badInput(undefined, v)
  return formatValue(v)
}

const chars = (v) => Array.from(wordText(v))

/** Split a value into items: list -> elements, word -> characters. */
function items(v) {
  if (Array.isArray(v)) return { list: true, xs: v }
  return { list: false, xs: chars(v) }
}

/** Rebuild a value of the same kind as the input. */
const rebuild = (list, xs) => (list ? xs : xs.map((x) => formatValue(x)).join(''))

function index(n, len, v = n) {
  const k = typeof n === 'number' ? n : isNumeric(n) ? toNumber(n) : NaN
  if (!Number.isInteger(k) || k < 1 || k > len) throw badInput(undefined, v)
  return k - 1
}

function nonEmpty(v) {
  const it = items(v)
  if (!it.xs.length) throw badInput(undefined, v)
  return it
}

function shuffled(xs) {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function deepPath(p) {
  const path = Array.isArray(p) ? p : [p]
  if (!path.length) throw badInput(undefined, p)
  return path
}

function deepItem(path, v, orig) {
  let cur = v
  for (const n of path) {
    const it = items(cur)
    cur = it.xs[index(n, it.xs.length, orig)]
  }
  return cur
}

function deepReplace(path, v, x, orig) {
  const it = items(v)
  const i = index(path[0], it.xs.length, orig)
  const xs = it.xs.slice()
  xs[i] = path.length === 1 ? x : deepReplace(path.slice(1), xs[i], x, orig)
  if (!it.list && !isWordValue(xs[i])) throw badInput(undefined, x)
  return rebuild(it.list, xs)
}

// sortuj: numbers (ascending) before words (Polish alphabet), lists/objects last (stable).
const collator = new Intl.Collator('pl', { sensitivity: 'base' })
const collatorCase = new Intl.Collator('pl')
function sortRank(v) {
  if (typeof v === 'number' || isNumeric(v)) return 0
  if (typeof v === 'string') return 1
  return 2
}
function sortCompare(a, b) {
  const ra = sortRank(a)
  const rb = sortRank(b)
  if (ra !== rb) return ra - rb
  if (ra === 0) return toNumber(a) - toNumber(b)
  if (ra === 1) return collator.compare(a, b) || collatorCase.compare(a, b)
  return 0
}

// ---- Windows-1250 (§17.16)
// Only used when TextDecoder lacks windows-1250 (e.g. Node built without full ICU).
// prettier-ignore
const CP1250_FALLBACK = [
  '€', '', '‚', '', '„', '…', '†', '‡', '', '‰', 'Š', '‹', 'Ś', 'Ť', 'Ž', 'Ź',
  '', '‘', '’', '“', '”', '•', '–', '—', '', '™', 'š', '›', 'ś', 'ť', 'ž', 'ź',
  ' ', 'ˇ', '˘', 'Ł', '¤', 'Ą', '¦', '§', '¨', '©', 'Ş', '«', '¬', '­', '®', 'Ż',
  '°', '±', '˛', 'ł', '´', 'µ', '¶', '·', '¸', 'ą', 'ş', '»', 'Ľ', '˝', 'ľ', 'ż',
  'Ŕ', 'Á', 'Â', 'Ă', 'Ä', 'Ĺ', 'Ć', 'Ç', 'Č', 'É', 'Ę', 'Ë', 'Ě', 'Í', 'Î', 'Ď',
  'Đ', 'Ń', 'Ň', 'Ó', 'Ô', 'Ő', 'Ö', '×', 'Ř', 'Ů', 'Ú', 'Ű', 'Ü', 'Ý', 'Ţ', 'ß',
  'ŕ', 'á', 'â', 'ă', 'ä', 'ĺ', 'ć', 'ç', 'č', 'é', 'ę', 'ë', 'ě', 'í', 'î', 'ď',
  'đ', 'ń', 'ň', 'ó', 'ô', 'ő', 'ö', '÷', 'ř', 'ů', 'ú', 'ű', 'ü', 'ý', 'ţ', '˙',
]
const CP1250_TO_CHAR = new Map() // code -> char
const CHAR_TO_CP1250 = new Map() // char -> code
;(() => {
  let dec = null
  try {
    dec = new TextDecoder('windows-1250')
  } catch {
    dec = null
  }
  for (let b = 0x80; b <= 0xff; b++) {
    let ch
    if (dec) ch = dec.decode(new Uint8Array([b]))
    else ch = CP1250_FALLBACK[b - 0x80]
    if (!ch || ch === '�') continue
    // undefined slots decode to C1 controls (U+0081 ...) — keep them out of the reverse map
    if (ch.codePointAt(0) === b && b < 0xa0) continue
    CP1250_TO_CHAR.set(b, ch)
    if (!CHAR_TO_CP1250.has(ch)) CHAR_TO_CP1250.set(ch, b)
  }
})()


export function charCode(ch) {
  if (CHAR_TO_CP1250.has(ch)) return CHAR_TO_CP1250.get(ch)
  return ch.codePointAt(0)
}

export function codeChar(n) {
  if (n >= 0x80 && n <= 0xff && CP1250_TO_CHAR.has(n)) return CP1250_TO_CHAR.get(n)
  return String.fromCodePoint(n)
}

function caseMap(v, f) {
  if (Array.isArray(v)) return v.map((x) => caseMap(x, f))
  return f(wordText(v))
}

/**
 * Apply a template to one element. `tmpl` is a list `[wyrażenie z :%]` or a word naming a
 * procedure (called with the element as its single input).
 */
async function applyTemplate(ctx, tmpl, x, who) {
  const interp = ctx.interp
  if (Array.isArray(tmpl)) {
    const c = interp.childCtx(ctx, { newFrame: true })
    c.scope.vars.set('%', x)
    return interp.evalList(tmpl, c, who)
  }
  if (typeof tmpl === 'string' && tmpl !== '') {
    const v = await interp.callProcedure(tmpl, [x], ctx)
    if (v === undefined) throw new LogoError(`${tmpl} nie dał wyniku dla ${who}`)
    return v
  }
  throw badInput(undefined, tmpl)
}

// ---------------------------------------------------------------------------------- register

export function register(registry) {
  const def = (names, spec) => registry.define(names, spec)
  const ext = { extension: true, redefinable: true }

  def(['pierw', 'first'], { arity: 1, doc: 'Pierwszy znak albo element.', fn: async (ctx, v) => nonEmpty(v).xs[0] })
  def(['ost', 'ostw', 'last'], {
    arity: 1, doc: 'Ostatni znak albo element.',
    fn: async (ctx, v) => { const { xs } = nonEmpty(v); return xs[xs.length - 1] },
  })
  def(['bezPierw', 'bp', 'butFirst', 'bf'], {
    arity: 1, doc: 'Bez pierwszego znaku albo elementu.',
    fn: async (ctx, v) => { const it = nonEmpty(v); return rebuild(it.list, it.xs.slice(1)) },
  })
  def(['bezOst', 'bo', 'butLast', 'bl'], {
    arity: 1, doc: 'Bez ostatniego znaku albo elementu.',
    fn: async (ctx, v) => { const it = nonEmpty(v); return rebuild(it.list, it.xs.slice(0, -1)) },
  })
  def(['element', 'item'], {
    arity: 2, doc: 'n-ty znak albo element; indeks [od do] daje fragment.',
    fn: async (ctx, n, v) => {
      const it = items(v)
      if (Array.isArray(n)) {
        if (n.length !== 2) throw badInput(undefined, n)
        const a = index(n[0], it.xs.length, n)
        const b = index(n[1], it.xs.length, n)
        if (b < a) throw badInput(undefined, n)
        return rebuild(it.list, it.xs.slice(a, b + 1))
      }
      return it.xs[index(n, it.xs.length)]
    },
  })
  def(['bezElNum', 'ben', 'butItem'], {
    arity: 2, doc: 'Bez elementu o numerze n.',
    fn: async (ctx, n, v) => {
      const it = items(v)
      const i = index(n, it.xs.length)
      return rebuild(it.list, it.xs.filter((_, k) => k !== i))
    },
  })
  def(['bezElementu', 'be', 'butMember'], {
    arity: 2, doc: 'Usuwa wszystkie wystąpienia x z y.',
    fn: async (ctx, x, v) => {
      const it = items(v)
      return rebuild(it.list, it.xs.filter((e) => !equalValues(e, x)))
    },
  })
  def(['zastąp', 'replace'], {
    arity: 3, doc: 'Kopia z n-tym elementem zamienionym na x.',
    fn: async (ctx, n, v, x) => {
      const it = items(v)
      const i = index(n, it.xs.length)
      if (!it.list && !isWordValue(x)) throw badInput(undefined, x)
      const xs = it.xs.slice()
      xs[i] = x
      return rebuild(it.list, xs)
    },
  })
  def(['elementGłęboki', 'deepItem'], {
    arity: 2, doc: 'Element wskazany ścieżką numerów, np. [2 1].',
    fn: async (ctx, p, v) => deepItem(deepPath(p), v, p),
  })
  def(['zastąpGłęboko', 'deepReplace'], {
    arity: 3, doc: 'Kopia z elementem wskazanym ścieżką zamienionym na x.',
    fn: async (ctx, p, v, x) => deepReplace(deepPath(p), v, x, p),
  })
  def(['los', 'pick'], {
    arity: 1, doc: 'Losowy znak albo element.',
    fn: async (ctx, v) => { const { xs } = nonEmpty(v); return xs[randomInt(xs.length)] },
  })
  def(['długość', 'count'], { arity: 1, doc: 'Liczba znaków albo elementów.', fn: async (ctx, v) => items(v).xs.length })
  def(['element?', 'member?'], {
    arity: 2, doc: 'Czy x należy do y (dla słów: podsłowo).',
    fn: async (ctx, x, v) => {
      if (Array.isArray(v)) return fromBool(v.some((e) => equalValues(e, x)))
      const w = normName(wordText(v))
      if (!isWordValue(x)) return fromBool(false)
      return fromBool(w.includes(normName(formatValue(x))))
    },
  })
  def(['numel', 'member'], {
    arity: 2, doc: 'Pozycja pierwszego wystąpienia x w y; 0, gdy brak.',
    fn: async (ctx, x, v) => {
      if (Array.isArray(v)) return v.findIndex((e) => equalValues(e, x)) + 1
      if (!isWordValue(x)) return 0
      const w = Array.from(normName(wordText(v)))
      const s = Array.from(normName(formatValue(x)))
      if (!s.length) return 0
      for (let i = 0; i + s.length <= w.length; i++) if (s.every((c, k) => w[i + k] === c)) return i + 1
      return 0
    },
  })
  def(['odElementu', 'fromMember'], {
    arity: 2, doc: 'Fragment y od pierwszego wystąpienia x.',
    fn: async (ctx, x, v) => {
      if (Array.isArray(v)) {
        const i = v.findIndex((e) => equalValues(e, x))
        return i < 0 ? [] : v.slice(i)
      }
      if (!isWordValue(x)) return ''
      const xs = chars(v)
      const w = xs.map((c) => normName(c))
      const s = Array.from(normName(formatValue(x)))
      for (let i = 0; i + s.length <= w.length; i++) if (s.every((c, k) => w[i + k] === c)) return xs.slice(i).join('')
      return ''
    },
  })
  def(['puste?', 'empty?'], {
    arity: 1, doc: 'Czy dana to " albo [].',
    fn: async (ctx, v) => fromBool((Array.isArray(v) && v.length === 0) || v === ''),
  })
  def(['liczba?', 'number?'], { arity: 1, doc: 'Czy dana jest liczbą.', fn: async (ctx, v) => fromBool(isNumeric(v)) })
  def(['lista?', 'list?'], { arity: 1, doc: 'Czy dana jest listą.', fn: async (ctx, v) => fromBool(isList(v)) })
  def(['słowo?', 'word?'], { arity: 1, doc: 'Czy dana jest słowem.', fn: async (ctx, v) => fromBool(isWordValue(v)) })

  def(['lista', 'list'], { arity: 2, minArity: 0, maxArity: Infinity, doc: 'Lista z danych.', fn: async (ctx, ...a) => a })
  def(['zdanie', 'zd', 'sentence', 'se'], {
    arity: 2, minArity: 0, maxArity: Infinity, doc: 'Lista z danych; listy są rozwijane o jeden poziom.',
    fn: async (ctx, ...a) => a.flatMap((x) => (Array.isArray(x) ? x : [x])),
  })
  def(['słowo', 'word'], {
    arity: 2, minArity: 0, maxArity: Infinity, doc: 'Skleja słowa.',
    fn: async (ctx, ...a) => a.map(wordText).join(''),
  })
  def(['nap', 'fPut'], {
    arity: 2, doc: 'Dodaje x na początek y.',
    fn: async (ctx, x, v) => (Array.isArray(v) ? [x, ...v] : wordText(x) + wordText(v)),
  })
  def(['nak', 'lPut'], {
    arity: 2, doc: 'Dodaje x na koniec y.',
    fn: async (ctx, x, v) => (Array.isArray(v) ? [...v, x] : wordText(v) + wordText(x)),
  })
  def(['wspak', 'reverse'], {
    arity: 1, doc: 'Odwraca słowo albo listę.',
    fn: async (ctx, v) => { const it = items(v); return rebuild(it.list, it.xs.slice().reverse()) },
  })
  def(['tasuj', 'shuffle'], {
    arity: 1, doc: 'Losowa permutacja.',
    fn: async (ctx, v) => { const it = items(v); return rebuild(it.list, shuffled(it.xs)) },
  })
  def(['sortuj', 'sort'], {
    arity: 1, doc: 'Sortuje: liczby rosnąco, potem słowa alfabetycznie (polski alfabet).',
    fn: async (ctx, v) => { const it = items(v); return rebuild(it.list, it.xs.slice().sort(sortCompare)) },
  })
  def(['generuj', 'generate'], {
    arity: 3, doc: 'generuj n [wyrażenie z :%] start — lista n elementów.',
    fn: async (ctx, n, tmpl, start) => {
      const k = Math.round(toNumber(n))
      if (!Number.isFinite(k)) throw badInput(undefined, n)
      const out = []
      let cur = start
      for (let i = 0; i < k; i++) {
        if (i > 0) cur = await applyTemplate(ctx, tmpl, cur, 'generuj')
        out.push(cur)
      }
      return out
    },
  })
  def(['mapuj', 'map'], {
    arity: 2, doc: 'mapuj [wyrażenie z :%] lista — stosuje wyrażenie albo procedurę do każdego elementu.',
    fn: async (ctx, tmpl, v) => {
      const it = items(v)
      const out = []
      for (const x of it.xs) out.push(await applyTemplate(ctx, tmpl, x, 'mapuj'))
      if (!it.list && out.every(isWordValue)) return rebuild(false, out)
      return out
    },
  })
  def(['filtruj', 'filter'], {
    arity: 2, doc: 'filtruj [warunek z :%] lista — elementy spełniające warunek.',
    fn: async (ctx, tmpl, v) => {
      const it = items(v)
      const out = []
      for (const x of it.xs) if (toBool(await applyTemplate(ctx, tmpl, x, 'filtruj'))) out.push(x)
      return rebuild(it.list, out)
    },
  })

  def(['ascii'], {
    arity: 1, doc: 'Kod pierwszego znaku (Windows-1250 dla polskich liter).',
    fn: async (ctx, v) => {
      const xs = chars(v)
      if (!xs.length) throw badInput(undefined, v)
      return charCode(xs[0])
    },
  })
  def(['znak', 'char'], {
    arity: 1, doc: 'Znak o podanym kodzie (128–255 według Windows-1250).',
    fn: async (ctx, v) => {
      const n = typeof v === 'number' ? v : isNumeric(v) ? toNumber(v) : NaN
      if (!Number.isInteger(n) || n < 0 || n > 0x10ffff) throw badInput(undefined, v)
      return codeChar(n)
    },
  })
  def(['wielkie', 'uppercase'], {
    arity: 1, ...ext, doc: 'Wielkie litery (rozszerzenie).',
    fn: async (ctx, v) => caseMap(v, (s) => s.toLocaleUpperCase('pl')),
  })
  def(['małe', 'lowercase'], {
    arity: 1, ...ext, doc: 'Małe litery (rozszerzenie).',
    fn: async (ctx, v) => caseMap(v, (s) => s.toLocaleLowerCase('pl')),
  })
}

