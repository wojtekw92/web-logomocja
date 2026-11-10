// Primitives module: control — PRIMITYWY.md §6 (Sterowanie) and §7 (Procedury).
// Owner: prims-control. See docs/ARCHITEKTURA.md and docs/API_NOTES.md.
//
// Conventions used here:
// - Loop counter (`numpow`/`repcount`) lives in ctx field `repcount` (copied by interp.childCtx,
//   so a procedure called from a loop body sees the enclosing loop's counter). Outside any loop
//   `numpow` gives -1 (as UCBLogo; Logomocja behaviour unverified).
// - Wrong-input errors are thrown with badInput(undefined, v): the interpreter rewrites them to
//   `<name as typed> nie lubi X jako danej`.
// - Per-interpreter state for this family of modules (control/variables/io) is kept in
//   `stateOf(interp)` (WeakMap), because interpreter.js is owned by core.
import { LogoError, StopSignal, OutputSignal, AbortSignal, ThrowSignal, isSignal } from '../core/errors.js'
import { random as sharedRandom } from '../core/values.js'
import {
  normName,
  toNumber,
  toBool,
  isNumeric,
  badInput,
  equalValues,
  formatValue,
  fromBool,
  LogoObject,
} from '../core/values.js'
import { runparse, readList } from '../core/lexer.js'
import { defToList } from '../core/parser.js'

// ------------------------------------------------------------------ shared helpers (exported)

const STATE = new WeakMap()

/** Per-interpreter mutable state shared by control.js, variables.js and io.js. */
export function stateOf(interp) {
  let s = STATE.get(interp)
  if (!s) {
    s = {
      plists: new Map(),       // normName(list) -> {name, pairs: [[key, value], ...]}
      lastCaught: null,        // LogoError caught by `złap "błąd` (for `błąd`)
      topTest: undefined,      // `test` result at top level (each command line has a fresh root ctx)
      pending: '',             // `wpisz` text waiting for the end of the line (io without write/type)
      printTo: null,           // `piszDo` redirection: {kind, target, buffer}
      timerStart: now(),       // `zegar`
      files: new Map(),        // in-memory fallback for ładujTekst/zapiszTekst
    }
    STATE.set(interp, s)
  }
  return s
}

export function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
}

/** A name input (word or number) -> string; anything else -> `X nie lubi Y jako danej`. */
export function wordArg(v) {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return formatValue(v)
  throw badInput(undefined, v)
}

/** A list (or a word, read as a list) for runlists. */
export function listArg(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string' || typeof v === 'number') return v
  throw badInput(undefined, v)
}

/** Number input accepting `jld`/`any` (random 0..99 like core infix). */
export function numArg(v) {
  if (typeof v === 'string') {
    const k = normName(v)
    if (k === 'jld' || k === 'any') return Math.floor(sharedRandom() * 100)
  }
  return toNumber(v)
}

/** Condition input: a word/number via toBool, a list `[wyrażenie]` evaluated lazily. */
export async function condArg(ctx, v, who) {
  if (Array.isArray(v)) v = await ctx.interp.evalList(v, ctx, who)
  return toBool(v)
}

/** Evaluate every expression of a list, e.g. `[1 :n - 1 2]` -> [1, n-1, 2]. */
export async function evalEach(ctx, list, who) {
  if (!Array.isArray(list)) list = readList(String(list))
  if (list.every((x) => typeof x === 'number')) return list
  const interp = ctx.interp
  const s = { toks: runparse(list), i: 0, producer: null, tail: false, instrStart: 0 }
  const out = []
  while (s.i < s.toks.length) {
    s.instrStart = s.i
    s.producer = null
    const v = await interp.evalExpr(s, ctx, 1, who)
    if (v === undefined) throw interp.noOutput(s.producer, who)
    out.push(v)
  }
  return out
}

/** Object that the code addressed explicitly (`ż1'…`, `proszę`, event self), or null. */
export function explicitSelf(ctx) {
  const s = ctx._self
  return s && typeof s === 'object' && s.procs instanceof Map ? s : null
}

const isTag = (tag, ...names) => typeof tag === 'string' && names.includes(normName(tag))

// ------------------------------------------------------------------ register

export function register(registry) {
  const def = (names, spec) => registry.define(names, spec)

  // ---------------------------------------------------------------- §6 loops

  def(['powtórz', 'repeat'], {
    arity: 2,
    doc: 'powtórz n [lista] — wykonuje listę n razy (ułamek zaokrąglany).',
    fn: async (ctx, n, list) => {
      const count = Math.round(numArg(n))
      listArg(list)
      if (!(count >= 1)) return
      const c = ctx.interp.childCtx(ctx)
      for (let k = 1; k <= count; k++) {
        c.repcount = k
        await ctx.interp.execList(list, c)
      }
    },
  })

  def(['numpow', 'npw', 'repcount', 'repc'], {
    arity: 0,
    doc: 'numpow — numer bieżącego powtórzenia (od 1) najbliższej pętli.',
    fn: async (ctx) => (typeof ctx.repcount === 'number' ? ctx.repcount : -1),
  })

  def(['dopóki', 'while'], {
    arity: 2,
    doc: 'dopóki [warunek] [lista] — warunek sprawdzany przed każdym obrotem.',
    fn: async (ctx, cond, list) => {
      listArg(list)
      const interp = ctx.interp
      const c = interp.childCtx(ctx)
      for (let k = 1; ; k++) {
        c.repcount = k
        if (!(await condArg(c, cond, 'dopóki'))) return
        await interp.execList(list, c)
      }
    },
  })

  def(['czekajAż', 'waitUntil'], {
    arity: 1,
    doc: 'czekajAż [warunek] — czeka, aż warunek będzie prawdą.',
    fn: async (ctx, cond) => {
      const interp = ctx.interp
      for (;;) {
        if (await condArg(ctx, cond, 'czekajAż')) return
        await interp.sleep(16, ctx)
      }
    },
  })

  def(['dla', 'for'], {
    arity: 3,
    doc: 'dla "x [od do krok?] [lista] — pętla licznikowa, koniec włączony.',
    fn: async (ctx, name, ctl, list) => {
      const vname = wordArg(name).replace(/^[:"]/, '')
      if (!Array.isArray(ctl)) throw badInput(undefined, ctl)
      listArg(list)
      const vals = await evalEach(ctx, ctl, 'dla')
      if (vals.length < 2 || vals.length > 3) throw badInput(undefined, ctl)
      const from = numArg(vals[0])
      const to = numArg(vals[1])
      let step = vals.length === 3 ? numArg(vals[2]) : from <= to ? 1 : -1
      const interp = ctx.interp
      const c = interp.childCtx(ctx, { newFrame: true })
      const key = normName(vname)
      if (step === 0 || from === to) {
        c.scope.vars.set(key, from)
        c.repcount = 1
        await interp.execList(list, c)
        return
      }
      const eps = Math.abs(step) * 1e-9
      for (let k = 0; ; k++) {
        const v = cleanNum(from + k * step)
        if (step > 0 ? v > to + eps : v < to - eps) return
        c.scope.vars.set(key, v)
        c.repcount = k + 1
        await interp.execList(list, c)
      }
    },
  })

  def(['dlaKażdego', 'forEach'], {
    arity: 3,
    doc: 'dlaKażdego "s słowoLubLista [lista] — przebiega znaki słowa albo elementy listy.',
    fn: async (ctx, name, items, list) => {
      const vname = wordArg(name).replace(/^[:"]/, '')
      listArg(list)
      let seq
      if (Array.isArray(items)) seq = items
      else if (typeof items === 'string' || typeof items === 'number') seq = Array.from(formatValue(items))
      else throw badInput(undefined, items)
      const interp = ctx.interp
      const c = interp.childCtx(ctx, { newFrame: true })
      const key = normName(vname)
      for (let k = 0; k < seq.length; k++) {
        c.scope.vars.set(key, seq[k])
        c.repcount = k + 1
        await interp.execList(list, c)
      }
    },
  })

  def(['pętla', 'loop'], {
    arity: 1,
    doc: 'pętla [lista] — nieskończona pętla w bieżącym procesie.',
    fn: async (ctx, list) => {
      listArg(list)
      const interp = ctx.interp
      const c = interp.childCtx(ctx)
      for (let k = 1; ; k++) {
        c.repcount = k
        await interp.execList(list, c)
        if ((k & 255) === 0) await interp.maybeYield(c)
      }
    },
  })

  // ---------------------------------------------------------------- §6 conditionals

  def(['jeśli', 'if'], {
    arity: 2,
    minArity: 2,
    maxArity: 3,
    extraListArg: true,
    tailList: true,
    doc: 'jeśli warunek [lista] [inaczej?] — trzecia dana, gdy jest literałem listy.',
    fn: async (ctx, cond, yes, no) => {
      listArg(yes)
      if (no !== undefined) listArg(no)
      if (await condArg(ctx, cond, 'jeśli')) return ctx.interp.runList(yes, ctx)
      if (no !== undefined) return ctx.interp.runList(no, ctx)
      return undefined
    },
  })

  def(['jeżeli', 'ifElse'], {
    arity: 3,
    tailList: true,
    doc: 'jeżeli warunek [lista1] [lista2].',
    fn: async (ctx, cond, yes, no) => {
      listArg(yes)
      listArg(no)
      return ctx.interp.runList((await condArg(ctx, cond, 'jeżeli')) ? yes : no, ctx)
    },
  })

  def(['test'], {
    arity: 1,
    doc: 'test warunek — zapamiętuje wynik dla jeśliTak/jeśliNie.',
    fn: async (ctx, cond) => {
      const b = await condArg(ctx, cond, 'test')
      const frame = ctx.interp.procFrame(ctx)
      frame.testResult = b
      if (frame.top) stateOf(ctx.interp).topTest = b
    },
  })

  const lastTest = (ctx) => {
    const frame = ctx.interp.procFrame(ctx)
    if (frame.testResult !== undefined) return frame.testResult
    if (frame.top) return stateOf(ctx.interp).topTest
    return undefined
  }

  def(['jeśliTak', 'ifTrue', 'ift'], {
    arity: 1,
    tailList: true,
    doc: 'jeśliTak [lista] — gdy ostatni test dał prawda.',
    fn: async (ctx, list) => {
      listArg(list)
      if (lastTest(ctx) === true) return ctx.interp.runList(list, ctx)
    },
  })

  def(['jeśliNie', 'ifFalse', 'iff'], {
    arity: 1,
    tailList: true,
    doc: 'jeśliNie [lista] — gdy ostatni test dał fałsz.',
    fn: async (ctx, list) => {
      listArg(list)
      if (lastTest(ctx) === false) return ctx.interp.runList(list, ctx)
    },
  })

  def(['wybierz', 'case'], {
    arity: 2,
    doc: 'wybierz wartość [sel1 [lista] sel2 sel3 [lista] … [inaczej]].',
    fn: async (ctx, value, clauses) => {
      if (!Array.isArray(clauses)) throw badInput(undefined, clauses)
      let sels = []
      for (const item of clauses) {
        if (!Array.isArray(item)) {
          sels.push(item)
          continue
        }
        const isDefault =
          sels.length === 0 || sels.some((s) => isTag(s, 'inaczej', 'else', 'otherwise'))
        const hit = isDefault || sels.some((s) => equalValues(stripQuote(s), value))
        sels = []
        if (hit) return ctx.interp.runList(item, ctx)
      }
      return undefined
    },
  })

  // ---------------------------------------------------------------- §6 running, stopping

  def(['uruchom', 'run'], {
    arity: 1,
    tailList: true,
    doc: 'uruchom [lista] — wykonuje listę instrukcji albo wylicza wyrażenie.',
    fn: async (ctx, list) => ctx.interp.runList(listArg(list), ctx),
  })

  def(['czekaj', 'wait'], {
    arity: 1,
    doc: 'czekaj n — wstrzymuje bieżący proces na n milisekund.',
    fn: async (ctx, ms) => {
      const n = numArg(ms)
      if (n < 0) throw badInput(undefined, ms)
      await ctx.interp.sleep(n, ctx)
    },
  })

  def(['wynik', 'wy', 'output', 'op'], {
    arity: 1,
    doc: 'wynik wartość — kończy funkcję użytkownika z wartością.',
    fn: async (ctx, v) => {
      throw new OutputSignal(v)
    },
  })

  def(['stop'], {
    arity: 0,
    doc: 'stop — kończy bieżącą procedurę (poza procedurą: bieżący proces).',
    fn: async () => {
      throw new StopSignal()
    },
  })

  def(['złap', 'catch'], {
    arity: 2,
    doc: 'złap "znacznik [lista] — "błąd łapie błędy.',
    fn: async (ctx, tag, list) => {
      const t = wordArg(tag)
      listArg(list)
      const interp = ctx.interp
      const catchesErrors = isTag(t, 'błąd', 'error')
      const catchesAll = isTag(t, 'prawda', 'true')
      try {
        return await interp.runList(list, ctx)
      } catch (e) {
        if (e instanceof ThrowSignal) {
          if (catchesAll || equalValues(e.tag, t)) return e.value
          throw e
        }
        if (isSignal(e)) throw e // stop, wynik, Stop button
        if (catchesErrors) {
          const err = e instanceof LogoError ? e : interp.toTopLevelError(e)
          if (err instanceof AbortSignal) throw err
          stateOf(interp).lastCaught = err
          return undefined
        }
        throw e
      }
    },
  })

  def(['rzuć', 'throw'], {
    arity: 1,
    minArity: 1,
    maxArity: 2,
    doc: 'rzuć "znacznik (wartość?) — przerywa do pasującego złap.',
    fn: async (ctx, tag, value) => {
      const t = wordArg(tag)
      if (isTag(t, 'błąd', 'error')) {
        throw new LogoError(value === undefined ? 'błąd' : formatValue(value, { top: true }), {
          code: 100,
          value,
        })
      }
      throw new ThrowSignal(t, value)
    },
  })

  def(['zgłośBłąd', 'throwError', 'makeError'], {
    arity: 1,
    minArity: 1,
    maxArity: 2,
    doc: 'zgłośBłąd tekst — błąd użytkownika o numerze 100. (zgłośBłąd tekst numer) zmienia numer.',
    fn: async (ctx, a, b) => {
      let text = a
      let code = 100
      if (b !== undefined) {
        if (isNumeric(a) && !isNumeric(b)) {
          code = toNumber(a)
          text = b
        } else if (isNumeric(b)) code = toNumber(b)
      }
      throw new LogoError(formatValue(text, { top: true }), { code, value: text })
    },
  })

  def(['błąd', 'error'], {
    arity: 0,
    doc: 'błąd — ostatni złapany błąd: [numer komunikat procedura wiersz pierwotna wartość].',
    fn: async (ctx) => {
      const e = stateOf(ctx.interp).lastCaught
      if (!e) return []
      return [
        e.code ?? 0,
        String(e.message ?? ''),
        e.procedure ?? '',
        e.line ?? '',
        e.primitive ?? '',
        e.value === undefined ? '' : e.value instanceof LogoObject ? e.value.name : e.value,
      ]
    },
  })

  def(['zignoruj', 'ignore'], {
    arity: 1,
    doc: 'zignoruj wartość — pomija wartość.',
    fn: async () => undefined,
  })

  def(['poziomGłówny', 'topLevel'], {
    arity: 0,
    doc: 'poziomGłówny — przerywa wszystko i wraca do wiersza poleceń.',
    fn: async (ctx) => {
      ctx.interp.abort({ silent: true })
      throw new AbortSignal('poziomGłówny')
    },
  })

  def(['zakończ', 'bye'], {
    arity: 0,
    doc: 'zakończ — w przeglądarce działa jak zatrzymajWszystko.',
    fn: async (ctx) => {
      ctx.interp.abort({ silent: true })
      throw new AbortSignal('zakończ')
    },
  })

  // ---------------------------------------------------------------- §7 procedures

  def(['definiuj', 'define'], {
    arity: 2,
    doc: 'definiuj "nazwa [[:a :b] [wiersz1] [wiersz2]] albo definiuj "nazwa |oto …¶…¶już|.',
    fn: async (ctx, name, body) => {
      const n = wordArg(name)
      const interp = ctx.interp
      const object = explicitSelf(ctx) ?? undefined
      if (Array.isArray(body)) {
        interp.defineFromList(n, body, { object })
        return
      }
      if (typeof body === 'string') {
        const text = body.replace(/¶/g, '\n')
        if (/^\s*(oto|to)\s/i.test(text)) {
          interp.defineFromSource(text, { object })
          return
        }
        // a word with only the body lines
        interp.defineFromList(n, [[], ...text.split('\n').map((l) => readList(l)).filter((l) => l.length)], {
          object,
        })
        return
      }
      throw badInput(undefined, body)
    },
  })

  const findUserDef = (ctx, name) => {
    const key = normName(name)
    const self = explicitSelf(ctx)
    if (self) {
      const d = self.procs.get(key) ?? self.findProc?.(key)
      if (d) return d
    }
    return ctx.interp.procedures.get(key)
  }

  def(['tekst', 'text'], {
    arity: 1,
    doc: 'tekst "nazwa — lista definicji procedury: [[parametry] [wiersz] …].',
    fn: async (ctx, name) => {
      const d = findUserDef(ctx, wordArg(name))
      if (!d) throw badInput(undefined, name)
      return defToList(d)
    },
  })

  def(['redaguj', 'red', 'edit', 'ed'], {
    arity: 0,
    minArity: 0,
    maxArity: 1,
    extraQuotedArg: true,
    doc: 'redaguj — otwiera edytor procedur; (redaguj "nazwa) na danej procedurze.',
    fn: async (ctx, name) => {
      const io = ctx.interp.io
      const names = name === undefined ? [] : Array.isArray(name) ? name.map(wordArg) : [wordArg(name)]
      if (typeof io.edit === 'function') await io.edit(names.length <= 1 ? names[0] : names, ctx.interp)
    },
  })

  def(['zdefiniowana?', 'defined?'], {
    arity: 1,
    doc: 'zdefiniowana? "nazwa — czy istnieje procedura użytkownika.',
    fn: async (ctx, name) => fromBool(typeof name === 'string' || typeof name === 'number' ? !!findUserDef(ctx, wordArg(name)) : false),
  })

  def(['pierwotna?', 'primitive?'], {
    arity: 1,
    doc: 'pierwotna? "nazwa — czy słowo jest procedurą pierwotną.',
    fn: async (ctx, name) =>
      fromBool((typeof name === 'string' || typeof name === 'number') && !!ctx.interp.registry.lookup(wordArg(name))),
  })

  def(['procedury', 'procs'], {
    arity: 0,
    doc: 'procedury — nazwy procedur użytkownika (globalnych albo obiektu).',
    fn: async (ctx) => {
      const self = explicitSelf(ctx)
      const src = self && self.procs.size ? self.procs : ctx.interp.procedures
      return [...src.values()].map((d) => d.name)
    },
  })

  def(['zastosuj', 'apply'], {
    arity: 2,
    doc: 'zastosuj procedura [dane] — procedura to nazwa albo [[:a] wyrażenie].',
    fn: async (ctx, proc, args) => {
      if (!Array.isArray(args)) throw badInput(undefined, args)
      const interp = ctx.interp
      if (typeof proc === 'string' || typeof proc === 'number') {
        return interp.callProcedure(wordArg(proc), args, ctx)
      }
      if (!Array.isArray(proc) || !Array.isArray(proc[0])) throw badInput(undefined, proc)
      const params = proc[0].map((p) => wordArg(p).replace(/^[:"]/, ''))
      if (args.length < params.length) throw new LogoError(`Za mało danych dla ${formatValue(proc)}`)
      if (args.length > params.length) throw new LogoError(`Za dużo danych dla ${formatValue(proc)}`)
      const c = interp.childCtx(ctx, { newFrame: true })
      params.forEach((p, i) => c.scope.vars.set(normName(p), args[i]))
      const rest = proc.slice(1)
      if (rest.length && rest.every(Array.isArray)) {
        let v
        for (let i = 0; i < rest.length; i++) {
          v = await interp.runList(rest[i], c)
          if (v !== undefined && i < rest.length - 1) throw interp.unusedValue(v)
        }
        return v
      }
      return interp.runList(rest, c)
    },
  })

  def(['zwykle', 'usual'], {
    arity: 0,
    minArity: 0,
    maxArity: Infinity,
    doc: 'zwykle — w metodzie obiektu wywołuje odziedziczoną wersję (bez danych: z danymi bieżącej metody).',
    fn: async (ctx, ...args) => {
      const interp = ctx.interp
      if (!args.length) {
        // reuse the inputs of the running method
        let f = ctx.scope
        while (f && !f.isProcFrame) f = f.parent
        const d = f?.def
        if (d) {
          for (const p of d.params) args.push(f.vars.get(normName(p)))
          for (const o of d.optionalParams ?? []) args.push(f.vars.get(normName(o.name)))
          while (args.length && args[args.length - 1] === undefined) args.pop()
        }
      }
      return interp.callUsual(ctx, args)
    },
  })
}

function stripQuote(s) {
  return typeof s === 'string' && s[0] === '"' ? s.slice(1) : s
}

function cleanNum(v) {
  const r = Math.round(v * 1e9) / 1e9
  return Object.is(r, -0) ? 0 : r
}
