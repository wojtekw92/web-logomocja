// Reader (lexer) for Logomocja. See docs/ARCHITEKTURA.md and docs/PRIMITYWY.md §1.
//
// Two stages, like classic Logo implementations:
//
// 1. `readLines(source)` / `readList(text)` turn TEXT into Logo LISTS of raw words.
//    Words are delimited by whitespace, `[`, `]`, `(`, `)`. `;` starts a comment, `~` at the end
//    of a line joins it with the next one, `|...|` makes a word with spaces/special characters,
//    `\c` escapes one character and `\NN` is the character with code NN (`\13\10` -> `¶`).
//    List literals keep raw words: `[7-3 a+b]` stays two words. Canonical decimal numbers
//    (`12`, `-3`, `1.5`) become JS numbers; anything else stays a string.
//
// 2. `runparse(list)` turns a Logo list into executable TOKENS (cached per array). This splits
//    infix operators out of words (`7-3`, `:a*2`, `x<=y`), recognises `"quoted` words, `:vars`,
//    numbers (also with a decimal comma between digits: `0,6`) and applies the minus rule of
//    PRIMITYWY.md §1.5: a `-` glued to the START of a word (`-3`, `-:x`) begins a new
//    expression, a `-` inside a word (`7-3`) or standing alone (`7 - 3`) is binary.
//    Words read from `|...|` or containing `\` escapes are literal (never split).

import { LogoError } from './errors.js'

/** Token types produced by runparse. */
export const T = Object.freeze({
  NUM: 'num',       // number literal               {t, v:number}
  QUOTE: 'quote',   // "word                        {t, v:string}
  VAR: 'var',       // :name                        {t, v:name}
  WORD: 'word',     // procedure call / name        {t, v:name, key}
  LIST: 'list',     // [ ... ] literal              {t, v:Array}
  OP: 'op',         // binary infix operator        {t, v:'+'|'-'|'*'|'/'|'^'|'='|'<'|'>'|'<='|'>='|'<>'}
  NEG: 'neg',       // minus glued to an operand: starts a new (negated) expression
  LPAREN: '(',
  RPAREN: ')',
  LIT: 'lit',       // self-evaluating literal (|bar word|, objects, other JS values)
})

/** Raw words of a list that must not be split by runparse: WeakMap<Array, Set<index>>. */
const literalMarks = new WeakMap()

export function markLiteral(list, index) {
  let s = literalMarks.get(list)
  if (!s) literalMarks.set(list, (s = new Set()))
  s.add(index)
}

export function isMarkedLiteral(list, index) {
  const s = literalMarks.get(list)
  return !!s && s.has(index)
}

const CANON_NUM = /^-?\d+(\.\d+)?$/

/** Convert a raw word to a JS number when it is written canonically (keeps `1.50`, `007` as words). */
function rawAtom(w) {
  if (CANON_NUM.test(w)) {
    const n = Number(w)
    if (String(n) === w) return n
  }
  return w
}

const WS = new Set([' ', '\t', '\r', '\n', '\f', '\v', ' '])

/**
 * Read source text into logical lines.
 * A logical line ends at a newline that is outside any `[...]` and not preceded by `~`.
 * @returns {{items:Array, line:number, endLine:number, start:number, end:number}[]}
 *   `line` is the 1-based physical line where the logical line starts, `start`/`end` are
 *   character offsets of the logical line in `source` (end exclusive, without the newline).
 */
export function readLines(source) {
  const src = String(source ?? '')
  const lines = []
  let line = 1
  let i = 0
  const n = src.length

  let stack = [[]]            // stack of open lists; stack[0] = current logical line
  let listStartLines = []     // physical line of each open `[`
  let word = null             // current word being built (string) or null
  let wordLiteral = false     // word contains |..| or \ escapes
  let wordQuoted = false
  let curStart = 0            // start offset of current logical line
  let curLine = 1
  let lastContent = -1        // offset just after the last non-space, non-comment char of the logical line

  const top = () => stack[stack.length - 1]

  const flush = () => {
    if (word === null) return
    let w = word
    if (w.includes('\r\n')) w = w.replace(/\r\n/g, '¶')
    const list = top()
    if (wordLiteral && !wordQuoted) {
      list.push(w)
      markLiteral(list, list.length - 1)
    } else {
      list.push(wordLiteral ? w : rawAtom(w))
    }
    word = null
    wordLiteral = false
    wordQuoted = false
  }

  const addChar = (c) => {
    if (word === null) {
      word = ''
      wordQuoted = c === '"'
    }
    word += c
  }

  const endLogicalLine = (endOffset) => {
    flush()
    const items = stack[0]
    lines.push({ items, line: curLine, endLine: line, start: curStart, end: endOffset })
    stack = [[]]
  }

  while (i < n) {
    const c = src[i]

    if (c === '\n') {
      // newline: inside a list it's whitespace; `~` before it continues the line
      if (stack.length > 1) {
        flush()
        line++
        i++
        continue
      }
      // line continuation: the last word ends with an unescaped `~`
      flush()
      const items = stack[0]
      const li = items.length - 1
      const last = items[li]
      if (typeof last === 'string' && last.endsWith('~') && !isMarkedLiteral(items, li)) {
        const rest = last.slice(0, -1)
        if (rest === '') items.pop()
        else items[li] = rest[0] === '"' ? rest : rawAtom(rest)
        line++
        i++
        continue
      }
      const end = lastContent >= curStart ? lastContent : curStart
      endLogicalLine(end)
      line++
      i++
      curStart = i
      curLine = line
      lastContent = -1
      continue
    }

    if (c === ';') {
      // comment to end of line (newline not consumed)
      // a `~` right before the comment still continues the line
      while (i < n && src[i] !== '\n') i++
      continue
    }

    if (WS.has(c)) {
      flush()
      i++
      continue
    }

    lastContent = i + 1

    if (c === '[') {
      flush()
      const lst = []
      top().push(lst)
      stack.push(lst)
      listStartLines.push(line)
      i++
      continue
    }
    if (c === ']') {
      flush()
      if (stack.length <= 1) throw new LogoError('Nieoczekiwany ]', { line })
      stack.pop()
      listStartLines.pop()
      i++
      continue
    }
    if (c === '(' || c === ')') {
      // a paren glued to a quote (`"(`) stays part of the quoted word
      if (word === '"') {
        addChar(c)
        i++
        continue
      }
      flush()
      top().push(c)
      i++
      continue
    }
    if (c === '|') {
      // vertical-bar word part: everything literal up to the closing bar (may span lines)
      if (word === null) {
        word = ''
        wordQuoted = false
      }
      wordLiteral = true
      i++
      while (i < n && src[i] !== '|') {
        if (src[i] === '\n') line++
        word += src[i]
        i++
      }
      i++ // closing bar (or EOF)
      lastContent = Math.min(i, n)
      continue
    }
    if (c === '\\') {
      i++
      if (i >= n) break
      if (word === null) {
        word = ''
        wordQuoted = false
      }
      wordLiteral = true
      if (/\d/.test(src[i])) {
        let j = i
        while (j < n && /\d/.test(src[j]) && j - i < 5) j++
        word += String.fromCharCode(Number(src.slice(i, j)))
        i = j
      } else {
        if (src[i] === '\n') line++
        word += src[i]
        i++
      }
      lastContent = i
      continue
    }

    addChar(c)
    i++
  }

  if (stack.length > 1) throw new LogoError('Brakuje ]', { line: listStartLines[listStartLines.length - 1] })
  // last line (no trailing newline)
  const end = lastContent >= curStart ? lastContent : curStart
  flush()
  if (stack[0].length || end > curStart) endLogicalLine(end)
  return lines
}

/** Read text as one flat Logo list (lines joined). Used for `czytajListę`, running words, etc. */
export function readList(text) {
  const lines = readLines(text)
  if (lines.length === 1) return lines[0].items
  const out = []
  for (const l of lines) {
    const base = out.length
    for (let k = 0; k < l.items.length; k++) {
      out.push(l.items[k])
      if (isMarkedLiteral(l.items, k)) markLiteral(out, base + k)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// runparse

const OP_CHARS = new Set(['+', '-', '*', '/', '^', '=', '<', '>'])
const NUM_RE = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i
const COMMA_NUM_RE = /^\d+,\d+$/

function numberValue(seg) {
  if (NUM_RE.test(seg)) return Number(seg)
  if (COMMA_NUM_RE.test(seg)) return Number(seg.replace(',', '.'))
  return undefined
}

function isDigit(c) {
  return c >= '0' && c <= '9'
}

/** Tokenise one (non-literal, non-quoted) word string into `out`. */
function scanWord(s, out) {
  const n = s.length
  let i = 0
  let atStart = true // at word start or right after an operator / paren
  while (i < n) {
    const c = s[i]
    if (c === '(') { out.push({ t: T.LPAREN }); i++; atStart = true; continue }
    if (c === ')') { out.push({ t: T.RPAREN }); i++; atStart = false; continue }
    if (c === '-' && atStart && i + 1 < n && s[i + 1] !== ')') {
      // minus glued to the following operand
      const nx = s[i + 1]
      if (isDigit(nx) || (nx === '.' && i + 2 < n && isDigit(s[i + 2]))) {
        const j = segmentEnd(s, i + 1)
        const v = numberValue(s.slice(i + 1, j))
        if (v !== undefined) {
          out.push({ t: T.NUM, v: -v, neg: true })
          i = j
          atStart = false
          continue
        }
      }
      out.push({ t: T.NEG })
      i++
      atStart = true
      continue
    }
    if (OP_CHARS.has(c)) {
      let op = c
      if ((c === '<' && (s[i + 1] === '=' || s[i + 1] === '>')) || (c === '>' && s[i + 1] === '=')) op = c + s[i + 1]
      out.push({ t: T.OP, v: op })
      i += op.length
      atStart = true
      continue
    }
    const j = segmentEnd(s, i)
    pushSegment(s.slice(i, j), out)
    i = j
    atStart = false
  }
}

/** End of a name/number segment starting at i: stops at operator chars and parens. */
function segmentEnd(s, i) {
  const n = s.length
  let j = i
  while (j < n) {
    const c = s[j]
    if (c === '(' || c === ')') break
    if (OP_CHARS.has(c)) {
      // exponent sign inside a number: 1e-3
      if ((c === '-' || c === '+') && /^\d+\.?\d*e$/i.test(s.slice(i, j)) && isDigit(s[j + 1] ?? '')) {
        j++
        continue
      }
      break
    }
    j++
  }
  return j
}

function pushSegment(seg, out) {
  if (seg === '') return
  if (seg[0] === ':') {
    out.push({ t: T.VAR, v: seg.slice(1) })
    return
  }
  if (seg[0] === '"') {
    out.push({ t: T.QUOTE, v: seg.slice(1) })
    return
  }
  const num = numberValue(seg)
  if (num !== undefined) {
    out.push({ t: T.NUM, v: num })
    return
  }
  out.push({ t: T.WORD, v: seg })
}

const tokenCache = new WeakMap()

/**
 * Turn a Logo list into executable tokens. Result is cached per array (lists are immutable).
 * @param {Array} list
 * @returns {Array<{t:string, v?:any}>}
 */
export function runparse(list) {
  let toks = tokenCache.get(list)
  if (toks) return toks
  toks = []
  for (let k = 0; k < list.length; k++) {
    const item = list[k]
    if (Array.isArray(item)) toks.push({ t: T.LIST, v: item })
    else if (typeof item === 'number') toks.push({ t: T.NUM, v: item })
    else if (typeof item === 'string') {
      if (isMarkedLiteral(list, k)) toks.push({ t: T.LIT, v: item })
      else if (item === '(') toks.push({ t: T.LPAREN })
      else if (item === ')') toks.push({ t: T.RPAREN })
      else if (item[0] === '"') toks.push({ t: T.QUOTE, v: item.slice(1) })
      else if (/[\s¶]/.test(item)) toks.push({ t: T.LIT, v: item }) // word built at runtime with spaces
      else scanWord(item, toks)
    } else toks.push({ t: T.LIT, v: item })
  }
  tokenCache.set(list, toks)
  return toks
}
