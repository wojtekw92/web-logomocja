// Syntax highlighting for the procedure editor (pure). Owner: ui.
//
//   tokenize(src, {isPrimitive, isProcedure}) -> [{text, cls}]   (concatenated texts == src)
//   highlightHTML(src, opts) -> HTML string with <span class="tok-…">
//
// Classes: comment, keyword (oto/już/to/end), quoted ("słowo), var (:x), number, bracket, op,
// prim (known primitive), proc (user procedure), bar (|…|), word, ws.
import { normName } from '../core/values.js'

const KEYWORDS = new Set(['oto', 'już', 'to', 'end'])
const WORD_BREAK = /[\s\[\]()+\-*/^=<>;|]/

export function tokenize(src, { isPrimitive = () => false, isProcedure = () => false } = {}) {
  const out = []
  const s = String(src)
  let i = 0
  const n = s.length
  const push = (text, cls) => { if (text) out.push({ text, cls }) }
  while (i < n) {
    const c = s[i]
    if (c === ';') {
      let j = s.indexOf('\n', i)
      if (j < 0) j = n
      push(s.slice(i, j), 'comment'); i = j; continue
    }
    if (/\s/.test(c)) {
      let j = i
      while (j < n && /\s/.test(s[j])) j++
      push(s.slice(i, j), 'ws'); i = j; continue
    }
    if (c === '[' || c === ']' || c === '(' || c === ')') {
      push(c, 'bracket'); i++; continue
    }
    if (c === '|') {
      let j = s.indexOf('|', i + 1)
      j = j < 0 ? n : j + 1
      push(s.slice(i, j), 'bar'); i = j; continue
    }
    // `7-3` / `:a-1` / `(x)-1` subtract; `7 -3` and `-3` are negative numbers (PRIMITYWY.md §17.7)
    const prev = out[out.length - 1]
    const tightAfterValue = prev && (['number', 'var', 'word', 'prim', 'proc'].includes(prev.cls) || prev.text === ')' || prev.text === ']')
    if ('+*/^=<>'.includes(c) || (c === '-' && (tightAfterValue || !/\d/.test(s[i + 1] || '')))) {
      let j = i + 1
      if ((c === '<' || c === '>') && (s[j] === '=' || (c === '<' && s[j] === '>'))) j++
      push(s.slice(i, j), 'op'); i = j; continue
    }
    // word-like token (may start with " : or -digit)
    let j = i + 1
    if (c === '"') {
      // quoted word runs until whitespace or bracket (operators are literal in a quoted word)
      while (j < n && !/[\s\[\]()]/.test(s[j])) j++
      push(s.slice(i, j), 'quoted'); i = j; continue
    }
    while (j < n && !WORD_BREAK.test(s[j])) {
      if (s[j] === '\\') j++
      j++
    }
    const text = s.slice(i, j)
    let cls = 'word'
    if (text[0] === ':') cls = 'var'
    else if (/^-?(\d+([.,]\d*)?|[.,]\d+)(e[+-]?\d+)?$/i.test(text)) cls = 'number'
    else if (text === '-') cls = 'op'
    else {
      const k = normName(text)
      const base = k.includes("'") ? k.slice(k.lastIndexOf("'") + 1) : k
      if (KEYWORDS.has(k)) cls = 'keyword'
      else if (isProcedure(base)) cls = 'proc'
      else if (isPrimitive(base)) cls = 'prim'
    }
    push(text, cls)
    i = j
  }
  return out
}

export function escapeHTML(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

export function highlightHTML(src, opts) {
  return tokenize(src, opts)
    .map(({ text, cls }) => (cls === 'ws' || cls === 'word' ? escapeHTML(text) : `<span class="tok-${cls}">${escapeHTML(text)}</span>`))
    .join('')
}
