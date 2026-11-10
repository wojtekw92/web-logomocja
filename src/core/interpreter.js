// Evaluator for Logomocja. See docs/ARCHITEKTURA.md (Interpreter) and docs/PRIMITYWY.md.
//
// ============================================================================================
// API for primitives (everything is async; always `await`):
//
//   interp.run(source, {ctx?})            parse, define procedures, run body; errors go to
//                                         io.printError(text, err). Returns {ok, error?, definitions}.
//   interp.runList(list, ctx)             run a runlist (list | word | number); returns the value of
//                                         the LAST instruction or undefined. A value in the middle
//                                         -> `Nie wiem co zrobić z X`. Use for `uruchom`, `jeśli`.
//   interp.execList(list, ctx)            like runList but a final value is an error too
//                                         (`powtórz 3 [5]` -> `Nie wiem co zrobić z 5`). Use for loop bodies.
//   interp.evalList(list, ctx, who?)      like runList but REQUIRES a value (conditions, `[wyrażenie]`);
//                                         otherwise `X nie dał wyniku dla who`.
//   interp.callProcedure(name, args, ctx) call a user procedure / object method / primitive by name
//                                         (also `obj'name` and a def object) with evaluated args.
//   interp.callUsual(ctx, args)           `zwykle`/`usual`: next definition of ctx.procName up the
//                                         class/behaviour chain of ctx.self after ctx.procOwner,
//                                         then global user procedure, then primitive.
//   interp.getVar(name, ctx)              `:x` lookup: dynamic scope -> own vars of self -> class vars
//                                         -> globals (order = interp.varSteps). Throws `x nie ma wartości`.
//   interp.hasVar(name, ctx)              boolean, same order.
//   interp.setVar(name, value, ctx)       `przypisz`: existing local in the dynamic chain -> existing
//                                         var of self/its class -> global.
//   interp.makeLocal(name, ctx, value?)   `niech`/`lokalna`: variable in the nearest PROCEDURE frame
//                                         (loop frames are skipped); at top level -> global.
//   interp.eraseVar(name, ctx)
//   interp.childCtx(ctx, overrides)       copy of ctx with overrides. `{newFrame:true}` pushes a new
//                                         non-procedure variable frame (`dla` loop variable: set it with
//                                         `c.scope.vars.set(normName(name), v)`). NEVER build ctx by spread
//                                         if you need the lazy `self`/`turtle` defaults.
//   interp.rootCtx(extra?)                fresh top-level ctx.
//   interp.procFrame(ctx)                 per-procedure-invocation object (`test` result etc.).
//   interp.spawnProcess(list, ctx, {name, self, who, forever, every, body})
//                                         start a concurrent process; returns
//                                         {id, name, done, cancelled, error, promise, cancel()}.
//                                         `body: async (pctx, proc) => {...}` replaces the default loop.
//   interp.processes                      Set of live processes. interp.waitForProcesses().
//   interp.sleep(ms, ctx)                 abortable wait (rejects with AbortSignal on Stop/cancel).
//   interp.abort()                        Stop: aborts running code at the next instruction/await,
//                                         cancels all processes, wakes sleepers.
//   interp.abortSignal                    AbortSignal (DOM) of the current generation (for fetch, dialogs).
//   interp.checkAbort(ctx)                throws AbortSignal if Stop was pressed / process cancelled.
//   interp.defineProcedure(def, {object?}) define (global or as object's own method).
//   interp.defineFromSource(text, opts)   define every `oto ... już` in text; returns defs.
//   interp.defineFromList(name, list, opts) `definiuj "n [[:a] [line] ...]`.
//   interp.text(name) / interp.procedureSource(name) / interp.getProcedure(name)
//   interp.eraseProcedure(name), interp.eraseAll()
//   interp.procedures: Map<normName, def>, interp.globals: Map<normName, value>
//   interp.findObject(name, ctx, parent?) object lookup hook (override for pages/paths).
//   interp.procChain(obj)                 objects searched for methods: obj, its behaviours, parent...
//   interp.resolve(name, ctx)             -> {kind:'proc',def,owner} | {kind:'prim',spec} | {kind:'value',value} | null
//   interp.resolveSteps                   ordered array of {name, fn(key, ctx, self, name)} (configurable,
//                                         PRIMITYWY.md §17.5).
//   interp.formatError(err)               text printed for an error.
//
// ctx passed to primitives: { interp, world, scope, self, turtle, who, process, procName, procOwner,
//   frame, depth, gen }. `self` defaults (lazily) to the first active turtle, `turtle` is `self` when
//   self is a turtle, else the first active turtle. `who` (array) is set when a turtle is addressed
//   with apostrophe syntax (`ż1'np 50`); turtle commands should use
//   `ctx.who ?? ctx.process?.who ?? world.activeTurtles`.
//
// Primitive spec extras understood by the evaluator:
//   extraListArg: true   after the default inputs, consume ONE more input if the next token is a
//                        literal list `[...]` (PRIMITYWY.md §17.8; applied to `jeśli` automatically).
//   extraQuotedArg: true after the default inputs, consume ONE more input if the next token is a
//                        quoted word `"x` (`redaguj "kw`, `zapiszProjekt "gra` without parentheses).
//   listStopsArgs: true  when the first input evaluates to a list, no further inputs are taken
//                        (`niech [a 1 b 2]`).
//   discardable: true    P/F primitive (`nowy`, `klonuj`): when its value ends up unused as a
//                        command it is dropped instead of `Nie wiem co zrobić z …`.
//   tailList: true       the primitive runs a runlist with interp.runList as its LAST action and
//                        returns its value (`jeśli`, `jeżeli`, `uruchom`); in tail position of a
//                        procedure the last call in that list is tail-call optimised.
// ============================================================================================

import { LogoError, StopSignal, OutputSignal, AbortSignal, ThrowSignal, isSignal, formatError } from './errors.js'
import { normName, formatValue, toNumber, isNumeric, equalValues, fromBool, LogoObject, randomInt } from './values.js'
import { runparse, readList, T } from './lexer.js'
import { parse, defFromList, defToList, defToSource, parseParamSpec } from './parser.js'

export const HINT_UNKNOWN = 'Sprawdź pisownię. Może to nowe nieokreślone słowo'
export const HINT_UNUSED = 'Nie powiedziałeś co zrobić z wynikiem'

const PREC = { '=': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '<>': 1, '+': 2, '-': 2, '*': 3, '/': 3, '^': 4 }

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** Real event-loop yield without the 4 ms setTimeout clamp. */
function macrotask() {
  if (typeof setImmediate === 'function') return new Promise((r) => setImmediate(r))
  if (typeof MessageChannel === 'function') {
    return new Promise((r) => {
      const ch = new MessageChannel()
      ch.port1.onmessage = () => { ch.port1.close(); r() }
      ch.port2.postMessage(0)
    })
  }
  return new Promise((r) => setTimeout(r, 0))
}

// normName is called for every lookup; memoise it (toLocaleLowerCase is comparatively slow).
const keyCache = new Map()
function nkey(s) {
  if (typeof s !== 'string') return normName(s)
  let k = keyCache.get(s)
  if (k === undefined) {
    k = normName(s)
    if (keyCache.size > 20000) keyCache.clear()
    keyCache.set(s, k)
  }
  return k
}

export function isTurtle(o) {
  return !!o && (o.isTurtle === true || (typeof o === 'object' && typeof o.forward === 'function'))
}

class TailCall {
  constructor(def, args, owner, name) {
    this.def = def
    this.args = args
    this.owner = owner
    this.name = name
  }
}

/** Parenthesis nesting deeper than this is reported before running (the JS stack would overflow). */
const MAX_PAREN_DEPTH = 800
const parensChecked = new WeakSet()

/**
 * Static check of a token array, before any instruction of it runs: an unmatched `)` is reported
 * up front (like an unmatched `]`), and absurdly deep `(((…)))` nesting too.
 */
function checkParens(toks, interp) {
  if (parensChecked.has(toks)) return
  let depth = 0
  for (const t of toks) {
    if (t.t === T.LPAREN) {
      if (++depth > MAX_PAREN_DEPTH) throw interp.recursionError()
    } else if (t.t === T.RPAREN && --depth < 0) throw new LogoError('Nieoczekiwany )')
  }
  parensChecked.add(toks)
}

class Stream {
  constructor(toks) {
    this.toks = toks
    this.i = 0
    this.tail = false
    this.instrStart = 0
    this.producer = null
  }
}

/** Key for per-process bookkeeping (discardable values). */
const procKey = (ctx) => ctx?.process ?? MAIN_PROC
const MAIN_PROC = {}

const CTX_ACCESSORS = {
  self: {
    enumerable: true,
    configurable: true,
    get() {
      if (this._self !== undefined) return this._self
      return this.interp ? this.interp.defaultSelf(this) : null
    },
    set(v) { this._self = v },
  },
  turtle: {
    enumerable: true,
    configurable: true,
    get() {
      if (this._turtle !== undefined) return this._turtle
      const s = this.self
      if (isTurtle(s)) return s
      return this.interp ? this.interp.defaultTurtle(this) : null
    },
    set(v) { this._turtle = v },
  },
}

/** Execution context. `self`/`turtle` are lazy accessors (own, enumerable). */
export class Ctx {
  constructor(fields) {
    this.interp = null
    this.world = null
    this.scope = null
    this.process = null
    this.procName = null
    this.procOwner = null
    this.frame = null
    this.depth = 0
    this.gen = undefined
    this.who = undefined
    this.line = undefined
    this._self = undefined
    this._turtle = undefined
    Object.defineProperties(this, CTX_ACCESSORS)
    if (fields) for (const k of Object.keys(fields)) this[k] = fields[k]
  }
}

export class Interpreter {
  /**
   * @param {{registry, world?, io?: {print, printError, readLine, clearText}}} opts
   */
  constructor({ registry, world = null, io = {} } = {}) {
    this.registry = registry
    this.world = world
    this.io = io || {}
    /** @type {Map<string, object>} */
    this.procedures = new Map()
    /** @type {Map<string, any>} */
    this.globals = new Map()
    this.processes = new Set()
    this._procSeq = 0
    this.abortGen = 0
    this._ac = new AbortController()
    this.steps = 0
    this.yieldEvery = 1000        // check for an event-loop yield every N steps
    this.yieldIntervalMs = 16     // ...and really yield when this much time has passed
    this._lastYield = now()
    this.maxDepth = 10000         // `Za mało pamięci (za głęboka rekurencja)`
    this._activeRuns = 0
    this.lastError = null
    this._listeners = new Set()
    this.resolveSteps = this.defaultResolveSteps()
    this.varSteps = this.defaultVarSteps()
  }

  // ------------------------------------------------------------------ name resolution

  /** PRIMITYWY.md §17.5 order. Replace/reorder `interp.resolveSteps` to change it. */
  defaultResolveSteps() {
    return [
      {
        name: 'ownProc',
        fn(key, ctx, self) {
          const d = self?.procs?.get?.(key)
          return d ? { kind: 'proc', def: d, owner: self } : null
        },
      },
      {
        name: 'classProc',
        fn(key, ctx, self) {
          if (!self || typeof self !== 'object') return null
          const r = this.findProcFrom(self, key, self)
          return r ? { kind: 'proc', def: r.def, owner: r.owner } : null
        },
      },
      {
        name: 'userProc',
        fn(key) {
          const d = this.procedures.get(key)
          return d ? { kind: 'proc', def: d, owner: null } : null
        },
      },
      {
        name: 'primitive',
        fn(key) {
          const s = this.registry?.lookup?.(key)
          return s ? { kind: 'prim', spec: s } : null
        },
      },
      {
        name: 'selfVar',
        fn(key, ctx, self) {
          if (!self || typeof self.findVar !== 'function') return null
          const r = self.findVar(key)
          if (r && r.found && r.value !== undefined) return { kind: 'value', value: r.value }
          // §17.5 step 5: a setting of `self` (e.g. a slider's `pionowy`)
          const v = typeof self.getSetting === 'function' ? self.getSetting(key) : undefined
          return v === undefined ? null : { kind: 'value', value: v }
        },
      },
      {
        name: 'objectValue',
        fn(key, ctx) {
          const o = this.findObject(key, ctx)
          if (!o) return null
          const v = this.objectValue(o)
          return v === undefined ? null : { kind: 'value', value: v }
        },
      },
    ]
  }

  /** Variable lookup order for `:x` (PRIMITYWY.md §17.5). Each fn returns {found, value}. */
  defaultVarSteps() {
    return [
      {
        name: 'scope',
        fn(key, ctx) {
          for (let f = ctx.scope; f; f = f.parent) {
            if (f.vars && f.vars.has(key)) return { found: true, value: f.vars.get(key), frame: f }
          }
          return null
        },
      },
      {
        name: 'self',
        fn(key, ctx) {
          const self = ctx.self
          if (!self || typeof self.findVar !== 'function') return null
          const r = self.findVar(key)
          return r && r.found ? { found: true, value: r.value, owner: r.owner } : null
        },
      },
      {
        name: 'globals',
        fn(key) {
          return this.globals.has(key) ? { found: true, value: this.globals.get(key), global: true } : null
        },
      },
    ]
  }

  /** @returns {{kind:'proc',def,owner}|{kind:'prim',spec}|{kind:'value',value}|null} */
  resolve(name, ctx, self = ctx?.self) {
    const key = nkey(name)
    for (const step of this.resolveSteps) {
      const r = step.fn.call(this, key, ctx, self, name)
      if (r) return r
    }
    return null
  }

  /** Objects searched for methods, in order: obj, its behaviours (recursively), then parent chain. */
  procChain(obj) {
    const out = []
    const seen = new Set()
    const visit = (o) => {
      if (!o || typeof o !== 'object' || seen.has(o)) return
      seen.add(o)
      out.push(o)
      const bs = o.behaviours ?? o.behaviors
      if (bs) for (const b of bs) visit(typeof b === 'string' ? this.findObject(b) : b)
      visit(o.parent)
    }
    visit(obj)
    return out
  }

  /** First definition of `key` in obj's chain strictly AFTER `after` (an object in the chain). */
  findProcFrom(obj, key, after = null) {
    const chain = this.procChain(obj)
    let start = 0
    if (after) {
      const i = chain.indexOf(after)
      start = i < 0 ? 0 : i + 1
    }
    for (let i = start; i < chain.length; i++) {
      const d = chain[i].procs?.get?.(key)
      if (d) return { def: d, owner: chain[i] }
    }
    return null
  }

  /** Object lookup hook (prims-objects may replace it). */
  findObject(name, ctx, parent = null) {
    if (name instanceof LogoObject) return name
    if (name === undefined || name === null || Array.isArray(name)) return null
    const key = normName(name)
    if (parent) {
      const c = parent.children?.get?.(key) ?? parent.objects?.get?.(key)
      if (c) return c
    }
    const w = this.world
    if (!w) return null
    const o = w.objects?.get?.(key)
    if (o) return o
    if (Array.isArray(w.turtles)) return w.turtles.find((t) => t && normName(t.name) === key) ?? null
    return null
  }

  /** Value of an object used as a word (slider `suw1` -> its value). */
  objectValue(o) {
    if (o && typeof o.logoValue === 'function') return o.logoValue()
    return undefined
  }

  defaultTurtle(ctx) {
    let list = ctx?.who ?? ctx?.process?.who ?? this.world?.activeTurtles
    if (!list || (Array.isArray(list) && !list.length)) list = this.world?.turtles
    let t = Array.isArray(list) ? list[0] : list
    if (typeof t === 'string') t = this.findObject(t, ctx)
    return t ?? null
  }

  defaultSelf(ctx) {
    return this.defaultTurtle(ctx) ?? this.world?.mainWindow ?? null
  }

  // ------------------------------------------------------------------ contexts

  rootCtx(extra = {}) {
    return new Ctx({
      interp: this,
      world: this.world,
      scope: null,
      process: null,
      procName: null,
      depth: 0,
      gen: this.abortGen,
      frame: { top: true, isProcFrame: false },
      ...extra,
    })
  }

  childCtx(ctx, overrides = {}) {
    const c = new Ctx()
    if (ctx) {
      for (const k of Object.keys(ctx)) {
        if (k === 'self' || k === 'turtle') continue
        c[k] = ctx[k]
      }
      if (!(ctx instanceof Ctx)) {
        if (ctx.self !== undefined) c._self = ctx.self
        if (ctx.turtle !== undefined) c._turtle = ctx.turtle
      }
    }
    if (!c.interp) c.interp = this
    if (c.world === null || c.world === undefined) c.world = this.world
    if (overrides.newFrame) c.scope = { vars: new Map(), parent: c.scope, isProcFrame: false }
    for (const k of Object.keys(overrides)) if (k !== 'newFrame') c[k] = overrides[k]
    return c
  }

  /** Context in which `obj` executes (apostrophe syntax, `proszę`). */
  objectCtx(ctx, obj) {
    const t = isTurtle(obj)
    return this.childCtx(ctx, { self: obj, turtle: t ? obj : undefined, who: t ? [obj] : ctx?.who })
  }

  procFrame(ctx) {
    return ctx.frame ?? (ctx.frame = { top: true, isProcFrame: false })
  }

  // ------------------------------------------------------------------ abort / yield

  get abortSignal() {
    return this._ac.signal
  }

  get running() {
    return this._activeRuns > 0 || this.processes.size > 0
  }

  /** Stop. `{silent: true}` (poziomGłówny, zakończ): the interrupted run prints no `Zatrzymano!`. */
  abort({ silent = false } = {}) {
    this.abortGen++
    this._silentAbortGen = silent ? this.abortGen : undefined
    const ac = this._ac
    this._ac = new AbortController()
    ac.abort()
    for (const p of [...this.processes]) p.cancel()
    // wake turtle animations waiting in world.frame()/yield(); cleared by the next run()
    try {
      this.world?.abort?.()
    } catch {
      /* ignore */
    }
  }

  /** Clear the world's abort flag (set by abort()) before new top-level work starts. */
  _clearWorldAbort() {
    try {
      if (this.world?.aborting) this.world.clearAbort?.()
    } catch {
      /* ignore */
    }
  }

  checkAbort(ctx) {
    if (!ctx) return
    if ((ctx.gen !== undefined && ctx.gen !== this.abortGen) || ctx.process?.cancelled) throw new AbortSignal()
  }

  async yieldNow() {
    const w = this.world
    if (w && typeof w.yield === 'function') await w.yield()
    else await macrotask()
  }

  /**
   * Called every `yieldEvery` steps. With a world, `world.yield()` is called (it gates real
   * macrotask yields by time itself). Without one, yield when `yieldIntervalMs` has passed.
   */
  async maybeYield(ctx) {
    const w = this.world
    if (w && typeof w.yield === 'function') {
      await w.yield()
    } else {
      const t = now()
      if (t - this._lastYield >= this.yieldIntervalMs) {
        await macrotask()
        this._lastYield = now()
      } else {
        await null // unwind the JS stack
      }
    }
    this.checkAbort(ctx)
  }

  async tick(ctx) {
    this.checkAbort(ctx)
    if (++this.steps % this.yieldEvery === 0) await this.maybeYield(ctx)
  }

  /** Abortable sleep. */
  sleep(ms, ctx) {
    return new Promise((resolve, reject) => {
      try {
        this.checkAbort(ctx)
      } catch (e) {
        reject(e)
        return
      }
      const signals = [this._ac.signal]
      const ps = ctx?.process?._ac?.signal
      if (ps) signals.push(ps)
      let timer = null
      const cleanup = () => {
        if (timer !== null) clearTimeout(timer)
        for (const s of signals) s.removeEventListener('abort', onAbort)
      }
      const onAbort = () => {
        cleanup()
        reject(new AbortSignal())
      }
      for (const s of signals) s.addEventListener('abort', onAbort, { once: true })
      timer = setTimeout(() => {
        cleanup()
        resolve()
      }, Math.max(0, Number(ms) || 0))
    })
  }

  // ------------------------------------------------------------------ errors

  unknownProc(name) {
    return new LogoError(`Nie wiem jak wykonać ${name}`, { hint: HINT_UNKNOWN })
  }

  unusedValue(v) {
    return new LogoError(`Nie wiem co zrobić z ${formatValue(v)}`, { hint: HINT_UNUSED, value: v })
  }

  noOutput(producer, who) {
    if (producer && who) return new LogoError(`${producer} nie dał wyniku dla ${who}`)
    if (producer) return new LogoError(`${producer} nie dał wyniku`)
    return new LogoError(`Brak wyniku dla ${who}`)
  }

  recursionError(name) {
    // outside any procedure (deep nesting at top level) there is no name to report
    if (name === undefined || name === null || name === '?') return new LogoError('Za mało pamięci (za głęboka rekurencja)')
    return new LogoError(`Za mało pamięci (za głęboka rekurencja) w ${name}`, { procedure: name })
  }

  formatError(err) {
    return formatError(err)
  }

  /** Normalise anything thrown at top level into a LogoError (or AbortSignal). */
  toTopLevelError(e) {
    if (e instanceof AbortSignal) return e
    if (e instanceof LogoError) return e
    if (e instanceof OutputSignal) return new LogoError('wynik może wystąpić tylko wewnątrz funkcji')
    if (e instanceof ThrowSignal) return new LogoError(`Nie mogę znaleźć złap dla ${formatValue(e.tag)}`)
    if (e instanceof RangeError && /call stack/i.test(e.message)) return this.recursionError('?')
    const err = new LogoError(`Błąd wewnętrzny: ${e?.message ?? e}`)
    err.cause = e
    if (typeof console !== 'undefined') console.error(e)
    return err
  }

  reportError(err) {
    this.lastError = err
    const text = formatError(err)
    try {
      this.io.printError?.(text, err)
    } catch {
      /* ignore broken io */
    }
  }

  decoratePrimError(e, name) {
    if (isSignal(e)) return e
    if (e instanceof LogoError) {
      if (e.needsWho) {
        const shown = formatValue(e.value) === '' ? '"' : formatValue(e.value)
        e.message = `${name} nie lubi ${shown} jako danej`
        e.needsWho = false
      }
      if (!e.primitive) e.primitive = name
      return e
    }
    if (e instanceof RangeError && /call stack/i.test(e.message)) return e
    const err = new LogoError(`${name}: błąd wewnętrzny (${e?.message ?? e})`, { primitive: name })
    err.cause = e
    if (typeof console !== 'undefined') console.error(e)
    return err
  }

  // ------------------------------------------------------------------ running

  /** Parse and run a program (top level). Errors are printed with io.printError. */
  async run(source, { ctx = null } = {}) {
    let parsed
    try {
      parsed = parse(source)
    } catch (e) {
      const err = this.toTopLevelError(e)
      this.reportError(err)
      return { ok: false, error: err }
    }
    this._clearWorldAbort()
    this._activeRuns++
    const rctx = ctx ?? this.rootCtx()
    let line
    const definitions = []
    try {
      for (const d of parsed.definitions) {
        line = d.line
        definitions.push(this.defineProcedure(d).name)
      }
      this._discard?.delete(procKey(rctx))
      for (const L of parsed.bodyLines) {
        line = L.line
        rctx.line = L.line
        const s = new Stream(runparse(L.items))
        const v = await this._exec(s, rctx)
        if (v !== undefined && !this.dropValue(v, rctx)) throw this.unusedValue(v)
      }
      return { ok: true, definitions }
    } catch (e) {
      if (e instanceof StopSignal) return { ok: true, definitions }
      const err = this.toTopLevelError(e)
      if (err instanceof LogoError && err.line === undefined && !err.procedure) err.line = line
      const silent = err instanceof AbortSignal && this._silentAbortGen !== undefined && this._silentAbortGen === this.abortGen
      if (!silent) this.reportError(err)
      return { ok: false, error: err, aborted: err instanceof AbortSignal, definitions }
    } finally {
      this._activeRuns--
    }
  }

  asList(x) {
    if (Array.isArray(x)) return x
    if (x === undefined || x === null) return []
    if (typeof x === 'number') return [x]
    return readList(String(x))
  }

  /** Run a runlist; returns the value of the last instruction (or undefined). */
  async runList(list, ctx) {
    ctx = ctx ?? this.rootCtx()
    // tail position of a procedure (set by invokeFromStream for `tailList` primitives)
    const tail = this._tailCtx === ctx
    if (tail) this._tailCtx = null
    await this.tick(ctx)
    const s = new Stream(runparse(this.asList(list)))
    s.tail = tail
    const v = await this._exec(s, ctx)
    return v
  }

  /** Run a runlist of commands: any leftover value is an error. */
  async execList(list, ctx) {
    const v = await this.runList(list, ctx)
    if (v !== undefined && !this.dropValue(v, ctx)) throw this.unusedValue(v)
  }

  /**
   * True (and forgets it) when `v` is exactly the value the last `discardable` primitive returned
   * in this process, i.e. `nowy "Żółw []` used as a command, also through `jeśli`/`uruchom`.
   */
  dropValue(v, ctx) {
    const m = this._discard
    if (!m || v === undefined) return false
    const k = procKey(ctx)
    if (!m.has(k) || m.get(k) !== v) return false
    m.delete(k)
    return true
  }

  /** Evaluate a list that must produce a value. */
  async evalList(list, ctx, who) {
    ctx = ctx ?? this.rootCtx()
    // a condition (`jeśli [..] [ruch]`) is never in tail position; the branch list still is
    const tail = this._tailCtx === ctx
    if (tail) this._tailCtx = null
    try {
      await this.tick(ctx)
      const l = this.asList(list)
      const s = new Stream(runparse(l))
      const v = await this._exec(s, ctx)
      if (v === undefined) throw this.noOutput(s.producer ?? formatValue(l), who)
      return v
    } finally {
      if (tail) this._tailCtx = ctx
    }
  }

  async _exec(s, ctx) {
    const toks = s.toks
    if (s.i === 0) checkParens(toks, this)
    let last
    while (s.i < toks.length) {
      if (last !== undefined && !this.dropValue(last, ctx)) throw this.unusedValue(last)
      this.checkAbort(ctx)
      s.instrStart = s.i
      s.producer = null
      if (toks[s.i].t === T.RPAREN) throw new LogoError('Nieoczekiwany )')
      last = await this.evalExpr(s, ctx, 1, null)
    }
    return last
  }

  // ------------------------------------------------------------------ expressions

  async evalExpr(s, ctx, minPrec, who) {
    let left = await this.evalUnary(s, ctx, who)
    for (;;) {
      const tok = s.toks[s.i]
      if (!tok || tok.t !== T.OP) return left
      const p = PREC[tok.v]
      if (p < minPrec) return left
      s.i++
      if (left === undefined) throw this.noOutput(s.producer, tok.v)
      const right = await this.evalExpr(s, ctx, tok.v === '^' ? p : p + 1, tok.v)
      if (right === undefined) throw this.noOutput(s.producer, tok.v)
      left = this.infix(tok.v, left, right)
      s.producer = null
    }
  }

  async evalUnary(s, ctx, who) {
    const tok = s.toks[s.i]
    if (!tok || tok.t === T.RPAREN) throw new LogoError(`Za mało danych dla ${who ?? '('}`)
    if (tok.t === T.NEG || (tok.t === T.OP && tok.v === '-')) {
      s.i++
      if (s.i >= s.toks.length || s.toks[s.i].t === T.RPAREN) throw new LogoError('Za mało danych dla -')
      const v = await this.evalUnary(s, ctx, '-')
      if (v === undefined) throw this.noOutput(s.producer, '-')
      s.producer = null
      return this.negate(v)
    }
    if (tok.t === T.OP) {
      s.i++
      throw new LogoError(`Za mało danych dla ${tok.v}`)
    }
    return this.evalOperand(s, ctx, who)
  }

  async evalOperand(s, ctx, who) {
    const tok = s.toks[s.i++]
    switch (tok.t) {
      case T.NUM:
      case T.QUOTE:
      case T.LIT:
      case T.LIST:
        return tok.v
      case T.VAR:
        // a bare `:` names nothing
        if (tok.v === '') throw new LogoError('Nie wiem jak wykonać :', { hint: HINT_UNKNOWN })
        return this.getVar(tok.v, ctx)
      case T.LPAREN:
        return this.evalParen(s, ctx, who)
      case T.WORD: {
        const headIndex = s.i - 1
        const info = this.lookupCall(tok.v, ctx)
        if (!info.target) throw this.unknownProc(tok.v)
        return this.invokeFromStream(info, s, ctx, false, headIndex)
      }
      default:
        throw new LogoError(`Nie wiem jak wykonać ${tok.v ?? tok.t}`, { hint: HINT_UNKNOWN })
    }
  }

  async evalParen(s, ctx, who) {
    const head = s.toks[s.i]
    let v
    let variadic = false
    if (head && head.t === T.WORD && !(s.toks[s.i + 1]?.t === T.OP)) {
      const info = this.lookupCall(head.v, ctx)
      if (info.target && info.target.kind !== 'value') {
        s.i++
        variadic = true
        v = await this.invokeFromStream(info, s, ctx, true, -1)
      }
    }
    if (!variadic) v = await this.evalExpr(s, ctx, 1, who)
    const close = s.toks[s.i]
    if (!close) throw new LogoError('Brakuje )')
    if (close.t !== T.RPAREN) {
      if (v !== undefined) throw this.unusedValue(v)
      throw new LogoError('Brakuje )')
    }
    s.i++
    return v
  }

  /** Resolve a (possibly apostrophe) name to {target, callCtx, name}. */
  lookupCall(name, ctx) {
    const ap = name.indexOf("'")
    if (ap <= 0 || ap === name.length - 1) return { target: this.resolve(name, ctx), callCtx: ctx, name }
    const parts = name.split("'")
    let obj = null
    for (let k = 0; k < parts.length - 1; k++) {
      const o = this.findObject(parts[k], ctx, obj)
      if (!o) throw new LogoError(`Nie ma obiektu ${parts[k]}`)
      obj = o
    }
    const member = parts[parts.length - 1]
    const callCtx = this.objectCtx(ctx, obj)
    let target = this.resolve(member, callCtx, obj)
    // An explicitly addressed UI object (`suw1'min`, `suw1'wartość`): its settings (§14) win over
    // primitives of the same name (math `min`/`maks`, `wartość`). Own methods still come first.
    if (obj.addressedSettingsFirst && (!target || target.kind === 'prim') && typeof obj.getSetting === 'function') {
      const v = obj.getSetting(member)
      if (v !== undefined) target = { kind: 'value', value: v }
    }
    return { target, callCtx, name: member, object: obj }
  }

  arityOf(target) {
    if (target.kind === 'prim') {
      const sp = target.spec
      return { def: sp.arity ?? 0, min: sp.minArity ?? sp.arity ?? 0, max: sp.maxArity ?? sp.arity ?? 0 }
    }
    const d = target.def
    return { def: d.defaultArity ?? d.params.length, min: d.minArity ?? d.params.length, max: d.maxArity ?? d.params.length }
  }

  async evalArg(s, ctx, who) {
    const tok = s.toks[s.i]
    if (!tok || tok.t === T.RPAREN) throw new LogoError(`Za mało danych dla ${who}`)
    const v = await this.evalExpr(s, ctx, 1, who)
    if (v === undefined) throw this.noOutput(s.producer, who)
    return v
  }

  async invokeFromStream(info, s, ctx, paren, headIndex) {
    const { target, callCtx, name } = info
    if (target.kind === 'value') {
      s.producer = name
      return target.value
    }
    const ar = this.arityOf(target)
    const args = []
    if (paren) {
      while (s.i < s.toks.length && s.toks[s.i].t !== T.RPAREN) {
        if (args.length >= ar.max) throw new LogoError(`Za dużo danych dla ${name}`)
        args.push(await this.evalArg(s, callCtx, name))
      }
      if (args.length < ar.min) throw new LogoError(`Za mało danych dla ${name}`)
    } else {
      const sp = target.kind === 'prim' ? target.spec : null
      // §1.3: `ż2'X args` ≡ `proszę "ż2 [X args]`, so the inputs are evaluated by the addressee too
      for (let k = 0; k < ar.def; k++) {
        args.push(await this.evalArg(s, callCtx, name))
        if (k === 0 && sp?.listStopsArgs && Array.isArray(args[0])) break
      }
      if (
        sp &&
        s.toks[s.i]?.t === T.LIST &&
        ((sp.extraListArg === true && args.length < ar.max) || nkey(sp.name) === 'jeśli')
      ) {
        args.push(s.toks[s.i++].v)
      } else if (sp?.extraQuotedArg && args.length < ar.max && s.toks[s.i]?.t === T.QUOTE) {
        args.push(s.toks[s.i++].v)
      }
      if (sp?.tailList && s.tail && headIndex === s.instrStart && s.i === s.toks.length && callCtx === ctx) {
        // `jeśli :n > 0 [ruch :n - 1]` as the last instruction: let runList see the tail position
        this._tailCtx = ctx
        try {
          const v = await this.callPrim(sp, args, ctx, name)
          s.producer = name
          return v
        } finally {
          if (this._tailCtx === ctx) this._tailCtx = null
        }
      }
      // proper tail call: `oto ruch ... ruch już`
      if (
        target.kind === 'proc' &&
        s.tail &&
        headIndex === s.instrStart &&
        s.i === s.toks.length &&
        callCtx === ctx
      ) {
        return new TailCall(target.def, args, target.owner, name)
      }
    }
    const v =
      target.kind === 'prim'
        ? await this.callPrim(target.spec, args, callCtx, name)
        : await this.invokeUser(target.def, args, callCtx, target.owner, name)
    s.producer = name
    return v
  }

  async callPrim(spec, args, ctx, name = spec.name) {
    this.checkAbort(ctx)
    if (++this.steps % this.yieldEvery === 0) await this.maybeYield(ctx)
    let v
    try {
      v = await spec.fn(ctx, ...args)
    } catch (e) {
      throw this.decoratePrimError(e, name)
    }
    if (spec.discardable && v !== undefined) (this._discard ??= new WeakMap()).set(procKey(ctx), v)
    return v
  }

  // ------------------------------------------------------------------ user procedures

  paramKeys(def) {
    if (!def._paramKeys) {
      const ks = new Set(def.params.map(normName))
      for (const o of def.optionalParams ?? []) ks.add(normName(o.name))
      if (def.restParam) ks.add(normName(def.restParam))
      Object.defineProperty(def, '_paramKeys', { value: ks, enumerable: false, configurable: true, writable: true })
    }
    return def._paramKeys
  }

  async bindFrame(def, args, parent, ctx) {
    const vars = new Map()
    const frame = { vars, parent, isProcFrame: true, procName: def.name, def, line: def.line }
    let k = 0
    for (const p of def.params) {
      vars.set(nkey(p), k < args.length ? args[k] : def.blankMissing ? '' : undefined)
      k++
    }
    for (const o of def.optionalParams ?? []) {
      const key = normName(o.name)
      if (k < args.length) vars.set(key, args[k])
      else if (def.blankMissing) vars.set(key, '')
      else {
        vars.set(key, undefined)
        const dctx = this.childCtx(ctx, { scope: frame, procName: def.name, frame })
        vars.set(key, await this.evalList(o.default, dctx, def.name))
      }
      k++
    }
    if (def.restParam) vars.set(normName(def.restParam), args.slice(k))
    return frame
  }

  /** Can the caller's frame be dropped on a tail call to `callee`? (all its vars are shadowed) */
  frameShadowed(frame, callee) {
    const keys = this.paramKeys(callee)
    for (const k of frame.vars.keys()) if (!keys.has(k)) return false
    return true
  }

  async invokeUser(def, args, ctx, owner = null, name = def.name) {
    let depth = (ctx.depth || 0) + 1
    if (depth > this.maxDepth) throw this.recursionError(def.name)
    this.checkAbort(ctx)
    if (++this.steps % this.yieldEvery === 0) await this.maybeYield(ctx)
    else if ((depth & 63) === 0) await null // keep the native stack shallow
    let frame = await this.bindFrame(def, args, ctx.scope, ctx)
    let pctx = this.childCtx(ctx, { scope: frame, procName: def.name, depth, procOwner: owner, frame })
    let mustBeCommand = false
    for (;;) {
      let result
      try {
        result = await this.runBody(def, pctx)
      } catch (e) {
        if (e instanceof OutputSignal) {
          if (mustBeCommand && e.value !== undefined) throw this.decorateProcError(this.unusedValue(e.value), def, frame)
          return e.value
        }
        if (e instanceof StopSignal) return undefined
        throw this.decorateProcError(e, def, frame)
      }
      if (!(result instanceof TailCall)) return result
      // trampoline
      const tc = result
      const keep = !this.frameShadowed(frame, tc.def)
      if (keep) {
        depth++
        if (depth > this.maxDepth) throw this.recursionError(tc.def.name)
      }
      this.checkAbort(ctx)
      if (++this.steps % this.yieldEvery === 0) await this.maybeYield(ctx)
      def = tc.def
      owner = tc.owner
      try {
        frame = await this.bindFrame(def, tc.args, keep ? frame : frame.parent, pctx)
      } catch (e) {
        throw this.decorateProcError(e, def, frame)
      }
      pctx = this.childCtx(ctx, { scope: frame, procName: def.name, depth, procOwner: owner, frame })
      mustBeCommand = true
    }
  }

  async runBody(def, pctx) {
    const lines = def.lines
    const frame = pctx.frame
    for (let li = 0; li < lines.length; li++) {
      frame.line = def.lineNumbers?.[li]
      frame.lineIndex = li
      const s = new Stream(runparse(lines[li]))
      s.tail = li === lines.length - 1
      const v = await this._exec(s, pctx)
      if (v instanceof TailCall) return v
      if (v !== undefined && !this.dropValue(v, pctx)) throw this.unusedValue(v)
    }
    return undefined
  }

  decorateProcError(e, def, frame) {
    if (isSignal(e)) return e
    let err = e
    if (e instanceof RangeError && /call stack/i.test(e.message)) err = this.recursionError(def.name)
    else if (!(e instanceof LogoError)) {
      err = new LogoError(`Błąd wewnętrzny: ${e?.message ?? e}`)
      err.cause = e
      if (typeof console !== 'undefined') console.error(e)
    }
    if (err.procedure === undefined) {
      err.procedure = def.name
      err.line = frame?.line
      err.procLine = frame?.lineIndex !== undefined ? frame.lineIndex + 1 : undefined
    }
    return err
  }

  /** Call by name with already evaluated args. `name` may be `obj'name` or a definition object. */
  async callProcedure(name, args = [], ctx = null) {
    ctx = ctx ?? this.rootCtx()
    if (name && typeof name === 'object' && !Array.isArray(name) && Array.isArray(name.lines)) {
      return this.invokeUser(this.normalizeDef(name), args, ctx, null, name.name)
    }
    const info = this.lookupCall(String(name), ctx)
    if (!info.target) throw this.unknownProc(String(name))
    return this.callTarget(info.target, args, info.callCtx, info.name)
  }

  async callTarget(target, args, ctx, name) {
    if (target.kind === 'value') {
      if (args.length) throw new LogoError(`Za dużo danych dla ${name}`)
      return target.value
    }
    const ar = this.arityOf(target)
    if (args.length < ar.min) throw new LogoError(`Za mało danych dla ${name}`)
    if (args.length > ar.max) throw new LogoError(`Za dużo danych dla ${name}`)
    return target.kind === 'prim'
      ? this.callPrim(target.spec, args, ctx, name)
      : this.invokeUser(target.def, args, ctx, target.owner, name)
  }

  /** `zwykle`/`usual`: run the inherited version of the current method. */
  async callUsual(ctx, args = []) {
    const name = ctx.procName
    if (!name) throw new LogoError('zwykle może wystąpić tylko wewnątrz procedury')
    const key = normName(name)
    const self = ctx.self
    let target = null
    if (self && ctx.procOwner) {
      const r = this.findProcFrom(self, key, ctx.procOwner)
      if (r) target = { kind: 'proc', def: r.def, owner: r.owner }
    }
    if (!target && ctx.procOwner) {
      const d = this.procedures.get(key)
      if (d) target = { kind: 'proc', def: d, owner: null }
    }
    if (!target) {
      const sp = this.registry?.lookup?.(key)
      if (sp) target = { kind: 'prim', spec: sp }
    }
    if (!target) throw this.unknownProc(name)
    return this.callTarget(target, args, ctx, name)
  }

  // ------------------------------------------------------------------ variables

  _lookupVar(name, ctx) {
    const key = nkey(name)
    const ap = key.indexOf("'")
    if (ap > 0 && ap < key.length - 1) {
      const parts = String(name).split("'")
      let obj = null
      for (let k = 0; k < parts.length - 1; k++) {
        obj = this.findObject(parts[k], ctx, obj)
        if (!obj) throw new LogoError(`Nie ma obiektu ${parts[k]}`)
      }
      const r = obj.findVar?.(parts[parts.length - 1])
      return r && r.found ? { found: true, value: r.value, owner: r.owner } : null
    }
    for (const step of this.varSteps) {
      const r = step.fn.call(this, key, ctx ?? {}, name)
      if (r) return r
    }
    return null
  }

  getVar(name, ctx) {
    const r = this._lookupVar(name, ctx)
    if (!r || r.value === undefined) throw new LogoError(`${name} nie ma wartości`)
    return r.value
  }

  hasVar(name, ctx) {
    const r = this._lookupVar(name, ctx)
    return !!r && r.value !== undefined
  }

  setVar(name, value, ctx) {
    const key = normName(name)
    const ap = key.indexOf("'")
    if (ap > 0 && ap < key.length - 1) {
      const parts = String(name).split("'")
      let obj = null
      for (let k = 0; k < parts.length - 1; k++) {
        obj = this.findObject(parts[k], ctx, obj)
        if (!obj) throw new LogoError(`Nie ma obiektu ${parts[k]}`)
      }
      const vk = normName(parts[parts.length - 1])
      const r = obj.findVar?.(vk)
      ;(r && r.found ? r.owner : obj).vars.set(vk, value)
      return
    }
    for (let f = ctx?.scope; f; f = f.parent) {
      if (f.vars && f.vars.has(key)) {
        f.vars.set(key, value)
        return
      }
    }
    const self = ctx?.self
    if (self && typeof self.findVar === 'function') {
      const r = self.findVar(key)
      if (r && r.found) {
        r.owner.vars.set(key, value)
        return
      }
    }
    this.globals.set(key, value)
  }

  makeLocal(name, ctx, value) {
    const key = normName(name)
    let f = ctx?.scope
    while (f && !f.isProcFrame) f = f.parent
    if (!f) {
      if (value !== undefined || !this.globals.has(key)) this.globals.set(key, value)
      return
    }
    f.vars.set(key, value)
  }

  eraseVar(name, ctx) {
    const key = normName(name)
    for (let f = ctx?.scope; f; f = f.parent) {
      if (f.vars && f.vars.has(key)) {
        f.vars.delete(key)
        return true
      }
    }
    return this.globals.delete(key)
  }

  // ------------------------------------------------------------------ infix arithmetic

  num(v, op) {
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      const k = normName(v)
      if (k === 'jld' || k === 'any') return randomInt(100)
    }
    return toNumber(v, op)
  }

  infix(op, a, b) {
    switch (op) {
      case '=':
        return fromBool(equalValues(a, b))
      case '<>':
        return fromBool(!equalValues(a, b))
      case '<':
      case '>':
      case '<=':
      case '>=': {
        let c
        if (isNumeric(a) && isNumeric(b)) c = toNumber(a) - toNumber(b)
        else if (!Array.isArray(a) && !Array.isArray(b) && typeof a !== 'object' && typeof b !== 'object' && !isNumeric(a) && !isNumeric(b)) {
          c = normName(formatValue(a)).localeCompare(normName(formatValue(b)), 'pl')
        } else c = this.num(a, op) - this.num(b, op)
        return fromBool(op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0)
      }
      default:
        return this.arith(op, a, b)
    }
  }

  arith(op, a, b) {
    const la = Array.isArray(a)
    const lb = Array.isArray(b)
    if (la || lb) {
      if (la && lb) {
        if (a.length !== b.length) throw new LogoError(`${op} nie lubi ${formatValue(b)} jako danej`)
        return a.map((x, i) => this.arith(op, x, b[i]))
      }
      return la ? a.map((x) => this.arith(op, x, b)) : b.map((y) => this.arith(op, a, y))
    }
    const x = this.num(a, op)
    const y = this.num(b, op)
    switch (op) {
      case '+':
        return x + y
      case '-':
        return x - y
      case '*':
        return x * y
      case '/':
        if (y === 0) throw new LogoError('Nie można dzielić przez zero')
        return x / y
      case '^':
        return Math.pow(x, y)
    }
    throw new LogoError(`Nie wiem jak wykonać ${op}`)
  }

  negate(v) {
    if (Array.isArray(v)) return v.map((x) => this.negate(x))
    return -this.num(v, '-')
  }

  // ------------------------------------------------------------------ definitions

  /** Fill missing fields of a definition (accepts parser defs and hand-made ones). */
  normalizeDef(def) {
    const d = def
    if (!d.name) throw new LogoError('Za mało danych dla oto')
    d.params = (d.params ?? []).map((p) => String(p).replace(/^:/, ''))
    d.optionalParams = d.optionalParams ?? []
    d.restParam = d.restParam ?? null
    if (!Array.isArray(d.lines)) d.lines = Array.isArray(d.body) ? [d.body] : []
    if (!Array.isArray(d.body)) d.body = d.lines.flat ? [].concat(...d.lines) : []
    if (!Array.isArray(d.lineNumbers)) d.lineNumbers = d.lines.map(() => undefined)
    if (d.minArity === undefined || d.maxArity === undefined || d.defaultArity === undefined) {
      const tmp = { params: [], optionalParams: [], restParam: null }
      const spec = [...d.params.map((p) => ':' + p)]
      for (const o of d.optionalParams) spec.push([':' + o.name, ...(o.default ?? [])])
      if (d.restParam) spec.push([':' + d.restParam])
      if (d.blankMissing && d.defaultArity !== undefined) spec.push([d.defaultArity])
      parseParamSpec(tmp, spec)
      d.defaultArity = d.defaultArity ?? tmp.defaultArity
      d.minArity = d.minArity ?? tmp.minArity
      d.maxArity = d.maxArity ?? tmp.maxArity
      d.blankMissing = d.blankMissing ?? tmp.blankMissing
    }
    if (d.sourceText === undefined || d.sourceText === '') d.sourceText = defToSource(d)
    if (d._paramKeys) delete d._paramKeys
    return d
  }

  /**
   * Define a procedure. `opts.object` makes it an own method of that object.
   * Throws `X jest procedurą pierwotną` when a global definition would shadow a primitive.
   */
  defineProcedure(def, opts = {}) {
    const d = this.normalizeDef(def)
    const key = normName(d.name)
    const obj = opts.object ?? null
    if (obj) {
      obj.procs.set(key, d)
    } else {
      const sp = this.registry?.lookup?.(key)
      // `rozszerzenie` primitives (not in Logomocja: potęga, maks, pi...) may be redefined by users
      if (sp && !sp.extension && !sp.redefinable) throw new LogoError(`${d.name} jest procedurą pierwotną`)
      this.procedures.set(key, d)
    }
    this._emit({ type: 'define', name: d.name, def: d, object: obj })
    return d
  }

  /** Define every `oto ... już` in `text` (editor "Zastosuj", `definiuj'X |oto ...|`). */
  defineFromSource(text, opts = {}) {
    const parsed = parse(String(text).replace(/¶/g, '\n'))
    return parsed.definitions.map((d) => this.defineProcedure(d, opts))
  }

  defineFromList(name, list, opts = {}) {
    return this.defineProcedure(defFromList(name, list), opts)
  }

  getProcedure(name, obj = null) {
    const key = normName(name)
    if (obj) return obj.procs?.get(key)
    return this.procedures.get(key)
  }

  /** `tekst`: [[params] [line1] ...] or undefined. */
  text(name, obj = null) {
    const d = this.getProcedure(name, obj)
    return d ? defToList(d) : undefined
  }

  procedureSource(name, obj = null) {
    const d = this.getProcedure(name, obj)
    return d ? d.sourceText || defToSource(d) : undefined
  }

  eraseProcedure(name, obj = null) {
    const key = normName(name)
    const ok = obj ? obj.procs.delete(key) : this.procedures.delete(key)
    if (ok) this._emit({ type: 'erase', name, object: obj })
    return ok
  }

  eraseAll() {
    this.procedures.clear()
    this.globals.clear()
    this._emit({ type: 'eraseAll' })
  }

  /** Subscribe to definition changes ({type:'define'|'erase'|'eraseAll', name, def}). Returns unsubscribe. */
  onChange(cb) {
    this._listeners.add(cb)
    return () => this._listeners.delete(cb)
  }

  _emit(ev) {
    for (const cb of this._listeners) {
      try {
        cb(ev)
      } catch {
        /* ignore */
      }
    }
  }

  // ------------------------------------------------------------------ processes

  /**
   * Start a concurrent process running `list`.
   * opts: {name, self, who, forever:boolean, every:ms, body: async (pctx, proc) => any, onDone}
   */
  spawnProcess(list, ctx = null, opts = {}) {
    if (ctx) this.checkAbort(ctx) // a stale (stopped) context must not start new processes
    const id = ++this._procSeq
    const base = ctx ?? this.rootCtx()
    const proc = {
      id,
      name: opts.name ?? `proces${id}`,
      done: false,
      cancelled: false,
      error: null,
      who: opts.who ?? base.process?.who,
      list,
      _ac: new AbortController(),
      promise: null,
      cancel() {
        if (proc.done || proc.cancelled) return
        proc.cancelled = true
        proc._ac.abort()
      },
    }
    const over = { process: proc, gen: this.abortGen }
    if (opts.self !== undefined) over.self = opts.self
    if (opts.who !== undefined) over.who = opts.who
    const pctx = this.childCtx(base, over)
    this._clearWorldAbort()
    this.processes.add(proc)
    proc.promise = (async () => {
      await null // let the spawner continue first
      try {
        if (typeof opts.body === 'function') await opts.body(pctx, proc)
        else if (opts.every !== undefined) {
          for (;;) {
            await this.execList(list, pctx)
            await this.sleep(opts.every, pctx)
          }
        } else if (opts.forever) {
          for (;;) {
            await this.execList(list, pctx)
            await this.maybeYield(pctx)
          }
        } else await this.execList(list, pctx)
      } catch (e) {
        if (!(e instanceof AbortSignal) && !(e instanceof StopSignal)) {
          const err = this.toTopLevelError(e)
          proc.error = err
          this.reportError(err)
        }
      } finally {
        proc.done = true
        this.processes.delete(proc)
        try {
          opts.onDone?.(proc)
        } catch {
          /* ignore */
        }
      }
    })()
    return proc
  }

  async waitForProcesses() {
    while (this.processes.size) await Promise.all([...this.processes].map((p) => p.promise))
  }
}

// `discardable` primitives are handled natively (prims/objects.js keeps a fallback wrapper that
// switches itself off when this flag is set).
Interpreter.prototype.supportsDiscardable = true
