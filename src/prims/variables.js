// Primitives module: variables — PRIMITYWY.md §5 (Zmienne, właściwości).
// Owner: prims-control. See docs/ARCHITEKTURA.md and docs/API_NOTES.md.
import { LogoError } from '../core/errors.js'
import { normName, toNumber, badInput, equalValues, fromBool } from '../core/values.js'
import { defFromList } from '../core/parser.js'
import { stateOf, wordArg, explicitSelf } from './control.js'

const varName = (v) => wordArg(v).replace(/^"/, '')

/** Set an object variable/setting: setting first, then existing var (own or class), else own var. */
async function setObjectVar(ctx, obj, name, value) {
  const k = normName(name)
  if ((k === 'postać' || k === 'shape') && Array.isArray(value) && value.length && obj?.isTurtle !== false &&
      typeof obj?.setShape === 'function' && ctx.interp.registry?.lookup('ustalPostać')) {
    // a drawing list / animation needs prims/turtle.js (Turtle#setShape accepts only ready shapes)
    await ctx.interp.callProcedure('ustalPostać', [value], ctx.interp.objectCtx(ctx, obj))
    return
  }
  if (obj && typeof obj.setSetting === 'function') {
    const r = await obj.setSetting(name, value)
    if (r === true) return
  }
  if (obj && obj.vars instanceof Map) {
    const r = obj.findVar?.(name)
    ;(r && r.found ? r.owner : obj).vars.set(normName(name), value)
    return
  }
  ctx.interp.setVar(name, value, ctx)
}

/**
 * Create the setter `ustalNazwa` as an own procedure of obj (miejWłasną/miejWspólną). The getter
 * `nazwa` needs no procedure: name resolution step 5 (variable of self) already answers it.
 */
function defineAccessors(ctx, obj, name) {
  const interp = ctx.interp
  const setter = 'ustal' + name.charAt(0).toLocaleUpperCase('pl') + name.slice(1)
  if (interp.registry.lookup(setter) || obj.procs.has(normName(setter))) return
  interp.defineProcedure(defFromList(setter, [['wartość.nowa'], ['ustaw', `"${name}`, ':wartość.nowa']]), {
    object: obj,
  })
}

function plist(ctx, name) {
  return stateOf(ctx.interp).plists.get(normName(wordArg(name)))
}

export function register(registry) {
  const def = (names, spec) => registry.define(names, spec)

  def(['przypisz', 'przyp', 'make'], {
    arity: 2,
    doc: 'przypisz "x wartość — ustawia zmienną (lokalną, obiektu, albo globalną).',
    fn: async (ctx, name, value) => {
      ctx.interp.setVar(varName(name), value, ctx)
    },
  })

  def(['niech', 'let'], {
    arity: 2,
    minArity: 1,
    maxArity: Infinity,
    listStopsArgs: true,
    doc: 'niech "a 5 — zmienna lokalna. Też (niech "a 1 "b 2) i (niech [a 1 b 2]).',
    fn: async (ctx, ...args) => {
      let pairs = args
      if (args.length === 1) {
        if (!Array.isArray(args[0])) throw new LogoError(`Za mało danych dla niech`)
        pairs = args[0]
      }
      if (pairs.length % 2 !== 0) throw badInput(undefined, pairs[pairs.length - 1])
      for (let i = 0; i < pairs.length; i += 2) ctx.interp.makeLocal(varName(pairs[i]), ctx, pairs[i + 1])
    },
  })

  def(['lokalna', 'local'], {
    arity: 1,
    minArity: 1,
    maxArity: Infinity,
    doc: 'lokalna "x albo lokalna [x y] — deklaruje zmienne lokalne.',
    fn: async (ctx, ...args) => {
      for (const a of args) {
        const names = Array.isArray(a) ? a : [a]
        for (const n of names) ctx.interp.makeLocal(varName(n).replace(/^:/, ''), ctx, undefined)
      }
    },
  })

  def(['nazwij', 'name'], {
    arity: 2,
    doc: 'nazwij wartość "x — jak przypisz, z odwróconą kolejnością.',
    fn: async (ctx, value, name) => {
      ctx.interp.setVar(varName(name), value, ctx)
    },
  })

  def(['wartość', 'thing', 'get'], {
    arity: 1,
    doc: 'wartość "x — to samo co :x.',
    fn: async (ctx, name) => ctx.interp.getVar(varName(name), ctx),
  })

  const bump = (sign) => async (ctx, name, by = 1) => {
    const n = varName(name)
    const interp = ctx.interp
    const cur = toNumber(interp.getVar(n, ctx))
    interp.setVar(n, cur + sign * toNumber(by), ctx)
  }

  def(['zwiększ', 'inc'], {
    arity: 1,
    minArity: 1,
    maxArity: 2,
    doc: 'zwiększ "x — dodaje 1; (zwiększ "x n) dodaje n.',
    fn: bump(1),
  })

  def(['zmniejsz', 'dec'], {
    arity: 1,
    minArity: 1,
    maxArity: 2,
    doc: 'zmniejsz "x — odejmuje 1; (zmniejsz "x n) odejmuje n.',
    fn: bump(-1),
  })

  def(['nazwa?', 'name?'], {
    arity: 1,
    doc: 'nazwa? "x — czy zmienna istnieje.',
    fn: async (ctx, name) => {
      if (Array.isArray(name)) return fromBool(false)
      return fromBool(ctx.interp.hasVar(varName(name).replace(/^:/, ''), ctx))
    },
  })

  def(['usuń', 'erase', 'er'], {
    arity: 1,
    doc: 'usuń "nazwa albo usuń [n1 n2] — usuwa procedury; usuń ":x usuwa zmienną.',
    fn: async (ctx, what) => {
      const interp = ctx.interp
      const items = Array.isArray(what) ? what : [what]
      const self = explicitSelf(ctx)
      for (const it of items) {
        const n = wordArg(it)
        if (n[0] === ':') {
          const v = n.slice(1)
          if (!interp.eraseVar(v, ctx) && self) self.vars.delete(normName(v))
          continue
        }
        const name = n.replace(/^"/, '')
        if (self && self.procs.has(normName(name))) interp.eraseProcedure(name, self)
        else if (interp.procedures.has(normName(name))) interp.eraseProcedure(name)
        else if (interp.registry.lookup(name)) throw new LogoError(`${name} jest procedurą pierwotną`)
      }
    },
  })

  def(['usuńWszystko', 'erAll', 'eraseAll'], {
    arity: 0,
    doc: 'usuńWszystko — usuwa wszystkie procedury, zmienne i listy właściwości użytkownika.',
    fn: async (ctx) => {
      ctx.interp.eraseAll()
      stateOf(ctx.interp).plists.clear()
    },
  })

  def(['miejWłasną', 'haveOwn'], {
    arity: 2,
    doc: 'miejWłasną "nazwa wartość — zmienna własna obiektu (+ funkcja nazwa i polecenie ustalNazwa).',
    fn: async (ctx, name, value) => {
      const n = varName(name)
      const obj = ctx.self
      if (!obj || !(obj.vars instanceof Map)) {
        ctx.interp.globals.set(normName(n), value)
        return
      }
      obj.vars.set(normName(n), value)
      if (obj.procs instanceof Map) defineAccessors(ctx, obj, n)
    },
  })

  def(['miejWspólną', 'haveCommon'], {
    arity: 2,
    doc: 'miejWspólną "nazwa wartość — zmienna wspólna klasy obiektu.',
    fn: async (ctx, name, value) => {
      const n = varName(name)
      const self = ctx.self
      if (!self || !(self.vars instanceof Map)) {
        ctx.interp.globals.set(normName(n), value)
        return
      }
      const cls = self.isClass ? self : self.parent && self.parent.vars instanceof Map ? self.parent : self
      cls.vars.set(normName(n), value)
      if (cls.procs instanceof Map) defineAccessors(ctx, cls, n)
    },
  })

  def(['ustaw', 'set'], {
    arity: 2,
    doc: 'ustaw "nazwa wartość — ustawia ustawienie lub zmienną obiektu.',
    fn: async (ctx, name, value) => {
      await setObjectVar(ctx, ctx.self, varName(name), value)
    },
  })

  // ---------------------------------------------------------------- property lists

  def(['ustalWłaściwość', 'pProp'], {
    arity: 3,
    doc: 'ustalWłaściwość "lista "klucz wartość.',
    fn: async (ctx, name, key, value) => {
      const st = stateOf(ctx.interp)
      const k = normName(wordArg(name))
      let pl = st.plists.get(k)
      if (!pl) st.plists.set(k, (pl = { name: wordArg(name), pairs: [] }))
      const p = pl.pairs.find((x) => equalValues(x[0], key))
      if (p) p[1] = value
      else pl.pairs.push([key, value])
    },
  })

  def(['właściwość', 'gProp'], {
    arity: 2,
    doc: 'właściwość "lista "klucz — wartość albo [].',
    fn: async (ctx, name, key) => {
      const p = plist(ctx, name)?.pairs.find((x) => equalValues(x[0], key))
      return p ? p[1] : []
    },
  })

  def(['usuńWłaściwość', 'remProp'], {
    arity: 2,
    doc: 'usuńWłaściwość "lista "klucz.',
    fn: async (ctx, name, key) => {
      const pl = plist(ctx, name)
      if (!pl) return
      pl.pairs = pl.pairs.filter((x) => !equalValues(x[0], key))
      if (!pl.pairs.length) stateOf(ctx.interp).plists.delete(normName(wordArg(name)))
    },
  })

  def(['listaWłaściwości', 'pList'], {
    arity: 1,
    doc: 'listaWłaściwości "lista — [klucz wartość …].',
    fn: async (ctx, name) => {
      const pl = plist(ctx, name)
      return pl ? pl.pairs.flat() : []
    },
  })

  def(['ustalListęWłaściwości', 'setPlist'], {
    arity: 2,
    doc: 'ustalListęWłaściwości "lista [klucz wartość …] — zastępuje całą listę.',
    fn: async (ctx, name, list) => {
      if (!Array.isArray(list) || list.length % 2) throw badInput(undefined, list)
      const st = stateOf(ctx.interp)
      const k = normName(wordArg(name))
      if (!list.length) {
        st.plists.delete(k)
        return
      }
      const pairs = []
      for (let i = 0; i < list.length; i += 2) {
        const p = pairs.find((x) => equalValues(x[0], list[i]))
        if (p) p[1] = list[i + 1]
        else pairs.push([list[i], list[i + 1]])
      }
      st.plists.set(k, { name: wordArg(name), pairs })
    },
  })

  def(['wszystkieWłaściwości', 'props'], {
    arity: 0,
    doc: 'wszystkieWłaściwości — nazwy list właściwości.',
    fn: async (ctx) => [...stateOf(ctx.interp).plists.values()].filter((p) => p.pairs.length).map((p) => p.name),
  })
}

