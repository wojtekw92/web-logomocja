// Help index over registry.specs() (pure). Owner: ui.
import { normName } from '../core/values.js'

/** Strip Polish diacritics for forgiving search ("zolw" finds "żółw"). */
export function fold(s) {
  return normName(s)
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l')
    .replace(/ń/g, 'n').replace(/ó/g, 'o').replace(/ś/g, 's').replace(/[źż]/g, 'z')
}

/** Arity description in the style of PRIMITYWY.md: `1`, `0..∞`, `1 (0..∞)`. */
export function arityText(spec) {
  const a = spec.arity ?? 0
  const min = spec.minArity ?? a
  const max = spec.maxArity ?? a
  const fmt = (n) => (n === Infinity ? '∞' : String(n))
  if (min === a && max === a) return String(a)
  return `${a} (${fmt(min)}..${fmt(max)})`
}

/**
 * Filter and rank specs. Returns [{spec, score}] sorted: exact name, name prefix, alias prefix,
 * substring in names, substring in doc. Empty query -> all, alphabetical.
 */
export function searchSpecs(specs, query = '') {
  const q = fold(String(query).trim())
  const coll = (a, b) => a.spec.name.localeCompare(b.spec.name, 'pl', { sensitivity: 'base' })
  if (!q) return specs.map((spec) => ({ spec, score: 0 })).sort(coll)
  const out = []
  for (const spec of specs) {
    const name = fold(spec.name)
    const aliases = (spec.aliases || []).map(fold)
    let score = -1
    if (name === q || aliases.includes(q)) score = 100
    else if (name.startsWith(q)) score = 80
    else if (aliases.some((a) => a.startsWith(q))) score = 60
    else if (name.includes(q) || aliases.some((a) => a.includes(q))) score = 40
    else if (spec.doc && fold(spec.doc).includes(q)) score = 10
    if (score >= 0) out.push({ spec, score })
  }
  return out.sort((a, b) => b.score - a.score || coll(a, b))
}

/** Set of all normalised primitive names + aliases, for highlighting and autocomplete. */
export function primitiveNameSet(specs) {
  const s = new Set()
  for (const spec of specs) {
    s.add(normName(spec.name))
    for (const a of spec.aliases || []) s.add(normName(a))
  }
  return s
}

/** Autocomplete: names (canonical + aliases) starting with prefix, canonical first. */
export function completions(specs, prefix, extra = [], limit = 12) {
  const p = normName(prefix)
  if (!p) return []
  const seen = new Set()
  const res = []
  const add = (n) => {
    const k = normName(n)
    if (k.startsWith(p) && !seen.has(k)) { seen.add(k); res.push(n) }
  }
  for (const n of extra) add(n)
  for (const spec of specs) add(spec.name)
  for (const spec of specs) for (const a of spec.aliases || []) add(a)
  return res.slice(0, limit)
}
