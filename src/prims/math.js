// Primitives module: math — arithmetic (PRIMITYWY.md §8) and logic (§9).
// Owner: prims-data. See docs/ARCHITEKTURA.md for ownership and docs/PRIMITYWY.md for names.
//
// Notes:
// - Infix operators (+ - * / ^ = < > ...) are evaluated by the interpreter itself; the prefix forms
//   here (suma, różnica, ...) follow the same rules: elementwise on lists, number with list applies
//   to every element, `jld` used as a number gives 0–99, `/` by 0 -> `Nie można dzielić przez zero`.
// - Wrong inputs throw `badInput(undefined, v)`; the interpreter fills in the primitive name as typed
//   (`X nie lubi Y jako danej`).
// - Random numbers come from a seedable PRNG (`losujOdNowa`). Exported as `random()` so other
//   modules may share it.
import { LogoError } from '../core/errors.js'
import { normName, toNumber, toBool, fromBool, badInput, equalValues, TRUE, FALSE, setRandom } from '../core/values.js'

// ---------------------------------------------------------------------------------- random

let rngState = (Math.random() * 2 ** 32) >>> 0

/** mulberry32: uniform float in [0, 1). */
export function random() {
  rngState = (rngState + 0x6d2b79f5) >>> 0
  let t = rngState
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Seed the generator (number), or from the clock when seed is undefined. */
export function seedRandom(seed) {
  if (seed === undefined) rngState = ((Date.now() ^ (Math.random() * 2 ** 32)) >>> 0)
  else rngState = (Math.trunc(seed) ^ 0x9e3779b9) >>> 0
}

/** Random integer 0..n-1. */
export function randomInt(n) {
  return Math.floor(random() * n)
}

// Every `jld`/random decision in core, graphics and the other prims uses this generator too.
setRandom(random)

// ---------------------------------------------------------------------------------- helpers

const isJld = (v) => typeof v === 'string' && (normName(v) === 'jld' || normName(v) === 'any')

/** Number input; `jld` gives a random 0–99 (PRIMITYWY.md §8 `jld`). */
export function num(v) {
  if (typeof v === 'number') return v
  if (isJld(v)) return randomInt(100)
  if (Array.isArray(v) || (v !== null && typeof v === 'object')) throw badInput(undefined, v)
  return toNumber(v)
}

function finite(r, v) {
  if (!Number.isFinite(r)) throw badInput(undefined, v)
  return r === 0 ? 0 : r // no -0
}

/** Remove floating noise of trig results: sin 180 -> 0, sin 30 -> 0.5. */
function snap(r) {
  const k = Math.round(r)
  if (Math.abs(r - k) < 1e-10) return k === 0 ? 0 : k
  const h = Math.round(r * 2) / 2
  if (Math.abs(r - h) < 1e-12) return h
  return r
}

/** Unary numeric function, applied elementwise to lists. */
function unary(f) {
  const g = (v) => (Array.isArray(v) ? v.map(g) : f(num(v), v))
  return g
}

/** Binary numeric function: list⊕list elementwise, number⊕list per element. */
function binary(f) {
  const g = (a, b) => {
    const la = Array.isArray(a)
    const lb = Array.isArray(b)
    if (la && lb) {
      if (a.length !== b.length) throw badInput(undefined, b)
      return a.map((x, i) => g(x, b[i]))
    }
    if (la) return a.map((x) => g(x, b))
    if (lb) return b.map((y) => g(a, y))
    return f(num(a), num(b), a, b)
  }
  return g
}

const add = binary((x, y) => x + y)
const sub = binary((x, y) => x - y)
const mul = binary((x, y) => x * y)
const div = binary((x, y) => {
  if (y === 0) throw new LogoError('Nie można dzielić przez zero')
  return x / y
})
const idiv = binary((x, y) => {
  const a = Math.trunc(x)
  const b = Math.trunc(y)
  if (b === 0) throw new LogoError('Nie można dzielić przez zero')
  return Math.trunc(a / b) || 0
})
const mod = binary((x, y) => {
  if (y === 0) throw new LogoError('Nie można dzielić przez zero')
  return x % y || 0
})
const pow = binary((x, y, a, b) => finite(Math.pow(x, y), b))

const RAD = Math.PI / 180

function compare(ctx, op, a, b) {
  return ctx.interp.infix(op, a, b)
}

/** Evaluate a logical input; a list `[wyrażenie]` is evaluated lazily (§9). */
async function logical(ctx, v, who) {
  if (Array.isArray(v)) v = await ctx.interp.evalList(v, ctx, who)
  return toBool(v)
}

function vec2(v) {
  if (!Array.isArray(v) || v.length !== 2) throw badInput(undefined, v)
  return [num(v[0]), num(v[1])]
}

function numberList(args) {
  const xs = args.length === 1 && Array.isArray(args[0]) ? args[0] : args
  if (!xs.length) throw badInput(undefined, args.length === 1 ? args[0] : [])
  return xs.map((x) => {
    if (Array.isArray(x)) throw badInput(undefined, x)
    return num(x)
  })
}

// ---------------------------------------------------------------------------------- register

export function register(registry) {
  const def = (names, spec) => registry.define(names, spec)
  const ext = { extension: true, redefinable: true }

  // ---- §8 arithmetic
  def(['suma', 'sum'], {
    arity: 2, minArity: 0, maxArity: Infinity,
    doc: 'Suma danych (+ przedrostkowo).',
    fn: async (ctx, ...a) => (a.length ? a.reduce((s, x) => add(s, x), 0) : 0),
  })
  def(['różnica', 'difference'], { arity: 2, doc: 'Różnica a − b.', fn: async (ctx, a, b) => sub(a, b) })
  def(['iloczyn', 'product'], {
    arity: 2, minArity: 0, maxArity: Infinity,
    doc: 'Iloczyn danych (* przedrostkowo).',
    fn: async (ctx, ...a) => (a.length ? a.reduce((s, x) => mul(s, x), 1) : 1),
  })
  def(['iloraz', 'quotient'], { arity: 2, doc: 'Iloraz a / b.', fn: async (ctx, a, b) => div(a, b) })
  def(['ilorazc', 'div'], { arity: 2, doc: 'Dzielenie całkowite (najpierw obcina dane).', fn: async (ctx, a, b) => idiv(a, b) })
  def(['reszta', 'mod'], { arity: 2, doc: 'Reszta z dzielenia (znak pierwszej danej).', fn: async (ctx, a, b) => mod(a, b) })
  def(['abs'], { arity: 1, doc: 'Wartość bezwzględna.', fn: async (ctx, x) => unary((n) => Math.abs(n))(x) })
  def(['int'], { arity: 1, doc: 'Część całkowita (obcina).', fn: async (ctx, x) => unary((n) => Math.trunc(n) || 0)(x) })
  def(['zaokrąglij', 'round'], {
    arity: 1, doc: 'Zaokrągla do najbliższej całkowitej.',
    fn: async (ctx, x) => unary((n) => (Math.sign(n) * Math.round(Math.abs(n))) || 0)(x),
  })
  def(['pwk', 'sqrt'], {
    arity: 1, doc: 'Pierwiastek kwadratowy.',
    fn: async (ctx, x) => unary((n, v) => { if (n < 0) throw badInput(undefined, v); return Math.sqrt(n) })(x),
  })
  def(['potęga', 'power'], { arity: 2, ...ext, doc: 'Potęga a^b (rozszerzenie).', fn: async (ctx, a, b) => pow(a, b) })
  def(['exp'], { arity: 1, doc: 'e do potęgi x.', fn: async (ctx, x) => unary((n, v) => finite(Math.exp(n), v))(x) })
  def(['ln'], {
    arity: 1, doc: 'Logarytm naturalny.',
    fn: async (ctx, x) => unary((n, v) => { if (n <= 0) throw badInput(undefined, v); return Math.log(n) })(x),
  })
  def(['log', 'log10'], {
    arity: 1, ...ext, doc: 'Logarytm dziesiętny (rozszerzenie).',
    fn: async (ctx, x) => unary((n, v) => { if (n <= 0) throw badInput(undefined, v); return snap(Math.log10(n)) })(x),
  })
  def(['sin'], { arity: 1, doc: 'Sinus kąta w stopniach.', fn: async (ctx, x) => unary((n) => snap(Math.sin(n * RAD)))(x) })
  def(['cos'], { arity: 1, doc: 'Cosinus kąta w stopniach.', fn: async (ctx, x) => unary((n) => snap(Math.cos(n * RAD)))(x) })
  def(['tg', 'tan'], {
    arity: 1, doc: 'Tangens kąta w stopniach.',
    fn: async (ctx, x) => unary((n, v) => {
      if (Math.abs(((n % 180) + 180) % 180 - 90) < 1e-12) throw badInput(undefined, v)
      return snap(Math.tan(n * RAD))
    })(x),
  })
  def(['arctg', 'arctan'], { arity: 1, doc: 'Arcus tangens w stopniach.', fn: async (ctx, x) => unary((n) => snap(Math.atan(n) / RAD))(x) })
  def(['pi'], { arity: 0, ...ext, doc: 'Liczba π (rozszerzenie).', fn: async () => Math.PI })

  def(['losowa', 'random'], {
    arity: 1, doc: 'Losowa liczba całkowita 0..n−1; dla listy losuje każdy element.',
    fn: async (ctx, x) => {
      const r = (v) => {
        if (Array.isArray(v)) return v.map(r)
        const n = Math.round(num(v))
        if (n < 0) throw badInput(undefined, v)
        return randomInt(n)
      }
      return r(x)
    },
  })
  def(['losujOdNowa', 'randomize'], {
    arity: 0, maxArity: 1, doc: 'Ustala ziarno generatora liczb losowych.',
    fn: async (ctx, seed) => { seedRandom(seed === undefined ? undefined : num(seed)) },
  })
  def(['jld', 'any'], { arity: 0, doc: 'Wartość „jak los da”.', fn: async () => 'jld' })

  def(['obróć', 'rotate'], {
    arity: 2, doc: 'Obraca wektor [x y] o kąt (zgodnie z ruchem wskazówek zegara, jak żółw).',
    fn: async (ctx, v, a) => {
      const [x, y] = vec2(v)
      const t = num(a) * RAD
      const c = Math.cos(t)
      const s = Math.sin(t)
      return [snap(x * c + y * s), snap(-x * s + y * c)]
    },
  })
  def(['kątWektorów', 'vectorAngle'], {
    arity: 2, doc: 'Kąt (w stopniach, 0–180) między wektorami.',
    fn: async (ctx, a, b) => {
      const [x1, y1] = vec2(a)
      const [x2, y2] = vec2(b)
      if (x1 === 0 && y1 === 0) throw badInput(undefined, a)
      if (x2 === 0 && y2 === 0) throw badInput(undefined, b)
      return snap(Math.atan2(Math.abs(x1 * y2 - y1 * x2), x1 * x2 + y1 * y2) / RAD)
    },
  })

  const int32 = (v) => {
    const n = num(v)
    if (!Number.isInteger(n)) throw badInput(undefined, v)
    return n | 0
  }
  def(['bitI', 'bitAnd'], { arity: 2, minArity: 1, maxArity: Infinity, doc: 'Bitowe AND.', fn: async (ctx, ...a) => a.map(int32).reduce((s, x) => s & x) })
  def(['bitLub', 'bitOr'], { arity: 2, minArity: 1, maxArity: Infinity, doc: 'Bitowe OR.', fn: async (ctx, ...a) => a.map(int32).reduce((s, x) => s | x) })
  def(['bitAlbo', 'bitXor'], { arity: 2, minArity: 1, maxArity: Infinity, doc: 'Bitowe XOR.', fn: async (ctx, ...a) => a.map(int32).reduce((s, x) => s ^ x) })
  def(['bitNie', 'bitNot'], { arity: 1, doc: 'Bitowe NOT.', fn: async (ctx, x) => ~int32(x) })

  def(['równe?', 'equal?'], {
    arity: 2, minArity: 2, maxArity: Infinity, doc: 'Czy dane są równe (jak =).',
    fn: async (ctx, ...a) => fromBool(a.every((x, i) => i === 0 || equalValues(a[0], x))),
  })
  def(['większe?', 'greater?'], { arity: 2, doc: 'Czy a > b.', fn: async (ctx, a, b) => compare(ctx, '>', a, b) })
  def(['mniejsze?', 'less?'], { arity: 2, doc: 'Czy a < b.', fn: async (ctx, a, b) => compare(ctx, '<', a, b) })
  def(['maks', 'max'], {
    arity: 2, minArity: 1, maxArity: Infinity, ...ext, doc: 'Największa liczba (rozszerzenie).',
    fn: async (ctx, ...a) => Math.max(...numberList(a)),
  })
  def(['min'], {
    arity: 2, minArity: 1, maxArity: Infinity, ...ext, doc: 'Najmniejsza liczba (rozszerzenie).',
    fn: async (ctx, ...a) => Math.min(...numberList(a)),
  })

  // ---- §9 logic (no short-circuit, except that list inputs are evaluated lazily)
  def(['i', 'and'], {
    arity: 2, minArity: 0, maxArity: Infinity, doc: 'Koniunkcja.',
    fn: async (ctx, ...a) => {
      let r = true
      for (const v of a) {
        if (Array.isArray(v) && !r) continue // lazy list input: not needed
        if (!(await logical(ctx, v, 'i'))) r = false
      }
      return fromBool(r)
    },
  })
  def(['lub', 'or'], {
    arity: 2, minArity: 0, maxArity: Infinity, doc: 'Alternatywa.',
    fn: async (ctx, ...a) => {
      let r = false
      for (const v of a) {
        if (Array.isArray(v) && r) continue
        if (await logical(ctx, v, 'lub')) r = true
      }
      return fromBool(r)
    },
  })
  def(['albo', 'xor'], {
    arity: 2, minArity: 0, maxArity: Infinity, doc: 'Alternatywa wykluczająca.',
    fn: async (ctx, ...a) => {
      let r = false
      for (const v of a) if (await logical(ctx, v, 'albo')) r = !r
      return fromBool(r)
    },
  })
  def(['nie', 'not'], { arity: 1, doc: 'Negacja.', fn: async (ctx, v) => fromBool(!(await logical(ctx, v, 'nie'))) })
  def(['prawda', 'true'], { arity: 0, doc: 'Słowo prawda.', fn: async () => TRUE })
  def(['fałsz', 'false'], { arity: 0, doc: 'Słowo fałsz.', fn: async () => FALSE })
}

