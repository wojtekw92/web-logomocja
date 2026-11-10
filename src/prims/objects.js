// Primitives module: Imagine objects & classes (PRIMITYWY.md §12), events and parallel processes
// (§13), interface elements — buttons, sliders, text boxes (§14). Owner: prims-objects.
// See docs/ARCHITEKTURA.md, docs/API_NOTES.md and docs/WIDGETS.md.
//
// ============================================================================================
// CONTRACT FOR THE UI (mirrored in docs/WIDGETS.md — keep both identical)
//
// Widget model (DOM-free). `world.widgets` is an array of Widget objects (LogoObject subclasses,
// also registered in `world.objects` under their names). Fields the renderer reads:
//   kind      'button' | 'slider' | 'textbox' | 'pane'
//   name      e.g. 'prz1', 'suw1', 'pt1', 'p1'
//   x, y      LOGO coordinates of the TOP-LEFT corner (origin = page centre, +y up)
//   width, height   in px
//   visible   boolean
//   backgroundCss   CSS colour string or null (default look); `background` holds the Logo value
//                   (snapshot() exposes the CSS string as `background`)
//   caption   (button) text on the button
//   value, min, max, vertical   (slider) numbers / boolean
//   text      (textbox) text, '\n' separates lines
//   page      name of the page the widget lives on ('s1')
// `widget.snapshot()` returns exactly these fields as a plain object.
// After every change the module calls `world.notifyWidgets?.(world)` (UI may install it),
// increments `world.widgetsVersion` and calls `world.requestRender()` (so `world.onRender`
// subscribers are notified too).
//
// Button bar (ustalPrzyciski): `world.buttonBar = {visible, buttons: [{caption, list}]}`.
//
// Events the UI sends with `world.dispatchEvent(name, data)` (names are case-insensitive; English
// Imagine names work too):
//   'gdyWciśnięty'  {target}         button pressed (target = widget name or object)
//   'gdyPuszczony'  {target}         button released
//   'gdyZmieniasz'  {target, value}  slider is being dragged (value stored, then handler runs)
//   'gdyPoZmianie'  {target, value}  slider released / text box edited (value = number or text)
//   'przyciskPaska' {index}          button no. `index` (0-based) of the button bar clicked
//   'klik'|'click'        {x, y, button}   pointer click on the page (logo coords; button 0/2)
//   'dwuklik'|'dblclick'  {x, y, button}
//   'wciśnięcie'|'down'   {x, y, button}   pointer pressed
//   'puszczenie'|'up'     {x, y, button}   pointer released
//   'ruch'|'move'         {x, y}           pointer moved
//   'klawisz'|'key'       {key}            key pressed (KeyboardEvent.key)
//   'wznów'|'resume'      {}               resume after wstrzymajWszystko
// The short pointer/key names go through world.pointer()/world.key() (which update world.mouse /
// world.keys and dispatch the canonical events). The canonical ones (`gdyKlik {target,x,y,button}`,
// `gdyKlawisz {target:null,key}`, `gdyCzyść {target}` …) may also be dispatched directly.
// Pointer events go to the topmost visible turtle under the pointer that has the handler (hit-test
// by shape radius, world.turtleAt), otherwise to the page. Every handler runs as a separate process
// (interp.spawnProcess) with self = receiving object (turtles: also who = [turtle]). Frozen objects
// (zamroźMnie) receive nothing. dispatchEvent returns the array of started processes.
// ============================================================================================

import { Interpreter, isTurtle, HINT_UNUSED } from '../core/interpreter.js'
import { random as sharedRandom } from '../core/values.js'
import {
  LogoObject, normName, formatValue, toNumber, toBool, fromBool, TRUE, FALSE, isNumeric, badInput,
} from '../core/values.js'
import { LogoError, AbortSignal } from '../core/errors.js'
import { readList } from '../core/lexer.js'
import { World, Page } from '../graphics/world.js'
import { Turtle } from '../graphics/turtle.js'
import { resolveColor } from '../graphics/colors.js'
import { shapeRadius } from '../graphics/shapes.js'

const INCOMPATIBLE = 'Obiekty są niezgodne'
const isAny = (v) => typeof v === 'string' && (normName(v) === 'jld' || normName(v) === 'any')
const rndInt = (a, b) => a + Math.floor(sharedRandom() * (b - a + 1))

// ------------------------------------------------------------------ event names (§13.3)

export const EVENTS = [
  ['gdyKlik', 'onClick'],
  ['gdyDwuklik', 'onDoubleClick'],
  ['gdyLewyWciśnięty', 'onLeftDown'],
  ['gdyLewyPuszczony', 'onLeftUp'],
  ['gdyPrawyWciśnięty', 'onRightDown'],
  ['gdyPrawyPuszczony', 'onRightUp'],
  ['gdyRuchMyszy', 'onMouseMove'],
  ['gdyMyszWchodzi', 'onMouseEnter'],
  ['gdyMyszWychodzi', 'onMouseLeave'],
  ['gdyCiągnięty', 'onDrag'],
  ['gdyZderzenie', 'onCollide'],
  ['gdyUtworzony', 'onCreate'],
  ['gdyWczytany', 'onLoad'],
  ['gdyCzyść', 'onClean'],
  ['gdyPokazanaStrona', 'onShowPage'],
  ['gdyWciśnięty', 'onPush'],
  ['gdyPuszczony', 'onRelease'],
  ['gdyZmieniasz', 'onChange'],
  ['gdyPoZmianie', 'onChanged'],
  ['gdyKlawisz', 'onKeyDown'],
]
const EVENT_KEY = new Map() // any name (normName) -> canonical key (normName of PL name)
const EVENT_DISPLAY = new Map() // canonical key -> PL display name
for (const [pl, en] of EVENTS) {
  const k = normName(pl)
  EVENT_KEY.set(k, k)
  EVENT_KEY.set(normName(en), k)
  EVENT_DISPLAY.set(k, pl)
}
/** Canonical event key for a PL/EN event name, or undefined. */
export function eventKey(name) {
  if (typeof name !== 'string') return undefined
  return EVENT_KEY.get(normName(name))
}
const POINTER_EVENTS = new Set(
  ['gdyKlik', 'gdyDwuklik', 'gdyLewyWciśnięty', 'gdyLewyPuszczony', 'gdyPrawyWciśnięty', 'gdyPrawyPuszczony',
    'gdyRuchMyszy'].map(normName),
)
/** Events whose handler is skipped while the previous run for the same object is still going. */
const SKIP_IF_RUNNING = new Set(['gdyRuchMyszy', 'gdyZmieniasz', 'gdyCiągnięty', 'gdyZderzenie'].map(normName))

// UI short names -> world.pointer type
const POINTER_SHORT = new Map([
  ['klik', 'click'], ['click', 'click'],
  ['dwuklik', 'dblclick'], ['dblclick', 'dblclick'],
  ['wciśnięcie', 'down'], ['down', 'down'], ['mousedown', 'down'],
  ['puszczenie', 'up'], ['up', 'up'], ['mouseup', 'up'],
  ['ruch', 'move'], ['move', 'move'], ['mousemove', 'move'],
])

// ------------------------------------------------------------------ primitive classes (§12)

const PRIMITIVE_CLASSES = [
  // [PL name, EN alias, kind, name prefix]
  ['Główne', 'Main', 'main', 'obiekt'],
  ['OknoGłówne', 'MainWindow', 'mainwindow', 'okno'],
  ['Strona', 'Page', 'page', 's'],
  ['Plansza', 'Pane', 'pane', 'p'],
  ['Żółw', 'Turtle', 'turtle', 'ż'],
  ['PoleTekstowe', 'TextBox', 'textbox', 'pt'],
  ['Suwak', 'Slider', 'slider', 'suw'],
  ['Przycisk', 'Button', 'button', 'prz'],
]
const CLASS_ALIAS = new Map() // normName(EN or PL) -> normName(PL)
for (const [pl, en] of PRIMITIVE_CLASSES) {
  CLASS_ALIAS.set(normName(pl), normName(pl))
  CLASS_ALIAS.set(normName(en), normName(pl))
}

const WIDGET_DEFAULTS = {
  button: { width: 80, height: 25 },
  slider: { width: 150, height: 24 },
  textbox: { width: 150, height: 60 },
  pane: { width: 200, height: 150 },
}

// ------------------------------------------------------------------ Widget model (§14)

export class Widget extends LogoObject {
  constructor({ world, kind, name, parent = null, className = '' }) {
    super({ name, className, parent })
    this.world = world
    this.kind = kind
    this.page = world?.page ?? null
    const d = WIDGET_DEFAULTS[kind] ?? { width: 100, height: 30 }
    this.width = d.width
    this.height = d.height
    this.x = 0
    this.y = 0
    this.visible = true
    this.background = null   // logo colour value as given, or null
    this.backgroundCss = null
    this.caption = kind === 'button' ? name : ''
    this.min = 0
    this.max = 100
    this.value = 0
    this.vertical = false
    this.text = ''
  }

  changed() { notifyWidgets(this.world) }

  /** `suw1'min` etc. read the setting, not the primitive (core lookupCall, §14 vs §17.5). */
  get addressedSettingsFirst() { return true }

  setValue(v) {
    if (this.kind === 'slider') {
      const n = toNumber(v, 'ustalZawartość')
      this.value = Math.min(this.max, Math.max(this.min, n))
    } else {
      this.text = textOf(v)
    }
    this.changed()
  }

  getValue() {
    if (this.kind === 'slider') return this.value
    return this.text
  }

  /** text box: append text (used by piszDoPola and io.js `piszDo`). */
  appendText(chunk) {
    this.text += textOf(chunk)
    this.changed()
  }

  /** Slider used as a word gives its value (§14, §17.5 step 5). Others: no value. */
  logoValue() {
    return this.kind === 'slider' ? this.value : undefined
  }

  getSetting(name) {
    switch (normName(name)) {
      case 'poz': case 'pos': return [this.x, this.y]
      case 'pozx': case 'xcor': return this.x
      case 'pozy': case 'ycor': return this.y
      case 'rozmiar': case 'size': return [this.width, this.height]
      case 'widoczny': case 'widoczny?': case 'shown': case 'shown?': return fromBool(this.visible)
      case 'koltła': case 'bgcolour': case 'bgcolor': case 'bg': return this.background ?? []
      case 'nazwa': case 'name': return this.name
      case 'napis': case 'caption': return this.kind === 'button' ? this.caption : undefined
      case 'min': return this.kind === 'slider' ? this.min : undefined
      case 'maks': case 'max': return this.kind === 'slider' ? this.max : undefined
      case 'pionowy': case 'vertical': return this.kind === 'slider' ? fromBool(this.vertical) : undefined
      case 'wartość': case 'value': case 'zawartość': case 'contents':
        return this.kind === 'slider' || this.kind === 'textbox' ? this.getValue() : undefined
      default: return undefined
    }
  }

  /** Returns true when `name` is a widget setting. */
  setSetting(name, v) {
    const pair = (who) => {
      if (!Array.isArray(v) || v.length !== 2) throw badInput(who, v)
      return [toNumber(v[0], who), toNumber(v[1], who)]
    }
    switch (normName(name)) {
      case 'poz': case 'pos': [this.x, this.y] = pair('poz'); break
      case 'pozx': case 'xcor': this.x = toNumber(v, 'pozx'); break
      case 'pozy': case 'ycor': this.y = toNumber(v, 'pozy'); break
      case 'rozmiar': case 'size': {
        const [w, h] = pair('rozmiar')
        this.width = Math.max(1, Math.round(w)); this.height = Math.max(1, Math.round(h))
        break
      }
      case 'widoczny': case 'widoczny?': case 'shown': case 'shown?': this.visible = toBool(v, 'widoczny'); break
      case 'koltła': case 'bgcolour': case 'bgcolor': case 'bg':
        if (Array.isArray(v) && v.length === 0) { this.background = null; this.backgroundCss = null } else {
          this.backgroundCss = resolveColor(v, 'ustalKolTła').css
          this.background = v
        }
        break
      case 'napis': case 'caption':
        if (this.kind !== 'button') return false
        this.caption = textOf(v); break
      case 'min':
        if (this.kind !== 'slider') return false
        this.min = toNumber(v, 'ustalMin'); if (this.value < this.min) this.value = this.min; break
      case 'maks': case 'max':
        if (this.kind !== 'slider') return false
        this.max = toNumber(v, 'ustalMaks'); if (this.value > this.max) this.value = this.max; break
      case 'pionowy': case 'vertical':
        if (this.kind !== 'slider') return false
        this.vertical = toBool(v, 'pionowy'); break
      case 'wartość': case 'value': case 'zawartość': case 'contents':
        if (this.kind !== 'slider' && this.kind !== 'textbox') return false
        this.setValue(v); return true
      default: return false
    }
    this.changed()
    return true
  }

  snapshot() {
    return {
      kind: this.kind, name: this.name, x: this.x, y: this.y, width: this.width, height: this.height,
      visible: this.visible, background: this.backgroundCss, caption: this.caption, value: this.value,
      min: this.min, max: this.max, vertical: this.vertical, text: this.text, page: this.page?.name ?? 's1',
    }
  }
}

function textOf(v) {
  if (v === undefined || v === null) return ''
  return formatValue(v, { top: true }).replace(/¶/g, '\n').replace(/\r\n/g, '\n')
}

function notifyWidgets(world) {
  if (!world) return
  world.widgetsVersion = (world.widgetsVersion ?? 0) + 1
  try { world.notifyWidgets?.(world) } catch (e) { console.error(e) }
  world.requestRender?.()
}

// ------------------------------------------------------------------ world setup

/** Per-world state of this module (hover / drag tracking, pause flag). */
function st(world) {
  return world._objState
}

/** Idempotent: primitive classes, widgets, main window, event handler, pause/collision hooks. */
export function setupWorld(world, interp) {
  if (!world) return
  if (interp && !world.interp) world.interp = interp
  if (world._objState) return
  world._objState = { hover: null, drag: null, running: new Map(), colliding: new Map() }
  // primitive classes
  for (const [pl, , kind, prefix] of PRIMITIVE_CLASSES) {
    const k = normName(pl)
    let c = world.classes.get(k)
    if (!c) {
      c = new LogoObject({ name: pl, className: pl })
      world.classes.set(k, c)
    }
    c.primitiveKind = kind
    c.namePrefix = prefix
    c.isClass = true
    c.isPrimitiveClass = true
  }
  world.widgets ??= []
  world.widgetsVersion ??= 0
  world.buttonBar ??= { visible: false, buttons: [] }
  world.paused = false
  if (!world.mainWindow) {
    const mw = new LogoObject({ name: 'oknoGłówne', className: 'OknoGłówne', parent: world.classes.get(normName('OknoGłówne')) })
    mw.isMainWindow = true
    world.mainWindow = mw
  }
  world.eventHandler = (name, data) => handleEvent(world, name, data)
  world.resumeAll = () => { world.paused = false }
  // pause gate for wstrzymajWszystko (every yield/frame waits while paused; Stop clears it)
  const wrap = (fnName) => {
    const orig = world[fnName]
    if (typeof orig !== 'function' || orig._objPaused) return
    const w = async function (...a) {
      await orig.apply(world, a)
      while (world.paused) {
        if (world.aborting) { world.paused = false; throw new AbortSignal() }
        await new Promise((r) => setTimeout(r, 20))
      }
    }
    w._objPaused = true
    world[fnName] = w
  }
  wrap('yield')
  wrap('frame')
  // Stop (interp.abort -> world.abort) also ends a pause
  if (typeof world.abort === 'function' && !world.abort._objPaused) {
    const origAbort = world.abort
    const a = function (...args) { world.paused = false; return origAbort.apply(world, args) }
    a._objPaused = true
    world.abort = a
  }
  // collision detection for `czuły` turtles (gdyZderzenie)
  world.onRender?.(() => checkCollisions(world))
}

function ensure(ctx) {
  const world = ctx.world ?? ctx.interp?.world
  if (world && !world._objState) setupWorld(world, ctx.interp)
  return world
}

// createLogomocja() calls world.attachInterpreter(interp) when it exists: install early so that
// UI events work before any objects primitive ran. (Guarded; graphics may define its own.)
if (Array.isArray(World.attachHooks)) {
  World.attachHooks.push((world, interp) => setupWorld(world, interp))
} else if (typeof World.prototype.attachInterpreter !== 'function') {
  World.prototype.attachInterpreter = function (interp) { setupWorld(this, interp) }
}

// ------------------------------------------------------------------ interpreter hooks (import time)

// 1. Object lookup also finds classes (`Żółw'ustalZdarzenie …`, `nowy "Ptaszek`).
{
  const P = Interpreter.prototype
  if (!P.findObject._objClasses) {
    const orig = P.findObject
    const patched = function (name, ctx, parent = null) {
      const o = orig.call(this, name, ctx, parent)
      if (o || parent) return o
      if (typeof name !== 'string' && typeof name !== 'number') return o
      const cls = this.world?.classes
      if (!cls) return o
      const k = normName(name)
      return cls.get(CLASS_ALIAS.get(k) ?? k) ?? null
    }
    patched._objClasses = true
    P.findObject = patched
  }
}

// 2. P/F primitives (`nowy`, `nowyObiekt`, `klonuj`): their value may be ignored when they are used
//    as a command. The core has no such notion, so `_exec` is wrapped: a leftover value that was
//    produced by a primitive with `discardable: true` (and is exactly what that primitive returned
//    in this ctx) is dropped instead of raising `Nie wiem co zrobić z …`.
//    Becomes a no-op if the core implements it and sets `Interpreter.prototype.supportsDiscardable`.
const DISCARD = new WeakMap() // ctx -> value returned by the last discardable primitive
{
  const P = Interpreter.prototype
  if (!P._exec._objDiscard && !P.supportsDiscardable) {
    const orig = P._exec
    const patched = async function (s, ctx) {
      for (;;) {
        try {
          const v = await orig.call(this, s, ctx)
          if (v !== undefined && consumeDiscard(this, s, ctx, v)) return undefined
          return v
        } catch (e) {
          if (e instanceof LogoError && e.hint === HINT_UNUSED && s.i < s.toks.length && consumeDiscard(this, s, ctx, e.value)) {
            continue // the previous instruction's value is dropped; go on with the next one
          }
          throw e
        }
      }
    }
    patched._objDiscard = true
    P._exec = patched
  }
}
function consumeDiscard(interp, s, ctx, v) {
  if (!ctx || !DISCARD.has(ctx) || DISCARD.get(ctx) !== v) return false
  const spec = s.producer ? interp.registry?.lookup?.(s.producer) : null
  if (!spec?.discardable) return false
  DISCARD.delete(ctx)
  return true
}

// ------------------------------------------------------------------ object helpers

const nameOf = (o) => (o instanceof LogoObject ? o.name : formatValue(o))

/** Resolve an object reference (object, name, `s3'ż3` path). Throws `Nie ma obiektu X`. */
export function resolveObject(ctx, x) {
  if (x instanceof LogoObject) return x
  if (Array.isArray(x)) throw badInput(undefined, x)
  const interp = ctx.interp
  const s = String(x)
  if (s.includes("'") && s.indexOf("'") > 0) {
    let obj = null
    for (const part of s.split("'")) {
      const o = interp.findObject(part, ctx, obj)
      if (!o) throw new LogoError(`Nie ma obiektu ${part}`)
      obj = o
    }
    return obj
  }
  const w = ctx.world
  if (w?.mainWindow && normName(s) === normName(w.mainWindow.name)) return w.mainWindow
  const o = interp.findObject(s, ctx)
  if (!o) throw new LogoError(`Nie ma obiektu ${s}`)
  return o
}

/** A word, a list of names/objects, or the word `wszystkie` → array of objects. */
function resolveMany(ctx, x) {
  if (typeof x === 'string' && ['wszystkie', 'all', 'allturtles'].includes(normName(x))) return ctx.world.turtlesOf()
  const items = Array.isArray(x) ? x : [x]
  return items.map((i) => resolveObject(ctx, i))
}

/** Class (primitive or user) by name; does not return plain instances. */
function findClass(world, name) {
  if (name instanceof LogoObject) return name.isClass ? name : null
  const k = normName(name)
  return world.classes.get(CLASS_ALIAS.get(k) ?? k) ?? null
}

/** Primitive class at the root of obj's chain. */
function primitiveClassOf(obj) {
  for (let o = obj; o; o = o.parent) if (o.isPrimitiveClass) return o
  if (obj instanceof Turtle) return obj.world?.classes?.get(normName('Żółw'))
  return null
}
function kindOf(world, obj) {
  if (obj instanceof Turtle) return 'turtle'
  if (obj instanceof Page) return 'page'
  if (obj instanceof Widget) return obj.kind
  return primitiveClassOf(obj)?.primitiveKind ?? 'main'
}

function whoList(ctx) {
  const l = ctx.who ?? ctx.process?.who ?? ctx.world.activeTurtles
  return Array.isArray(l) ? l : l ? [l] : []
}
const whoValue = (list) => (list.length === 1 ? nameOf(list[0]) : list.map(nameOf))

/** Chain used for events: object, behaviours, parents (same as methods). */
function eventChain(interp, obj) {
  return interp?.procChain ? interp.procChain(obj) : (() => { const a = []; for (let o = obj; o; o = o.parent) a.push(o); return a })()
}
function findEventIn(interp, obj, key) {
  for (const o of eventChain(interp, obj)) {
    const l = o.events?.get?.(key)
    if (l !== undefined) return l
  }
  return undefined
}

function asRunlist(v) {
  if (Array.isArray(v)) return v
  if (v === undefined || v === null || v === '') return []
  return readList(formatValue(v))
}

function requireEvent(name, who) {
  const k = eventKey(name)
  if (!k) throw badInput(who, name)
  return k
}

function allObjects(world) {
  const out = new Set(world.objects.values())
  for (const t of world.turtles) out.add(t)
  return [...out]
}

/** Is `obj` derived (parent chain or behaviours) from `cls`? */
function derivesFrom(interp, obj, cls) {
  if (!obj || !cls || obj === cls) return false
  return eventChain(interp, obj).includes(cls)
}

// ------------------------------------------------------------------ settings lists

/**
 * Parse `[klucz wartość klucz wartość …]`. Values: a list (literal), `(wyrażenie)` (evaluated),
 * `:zmienna`, a number, or a word (literal, e.g. `pod`, `jld`).
 */
export async function parseSettings(ctx, list, who) {
  if (!Array.isArray(list)) throw badInput(who, list)
  const out = []
  let i = 0
  while (i < list.length) {
    const key = list[i++]
    if (Array.isArray(key) || key === '(' || key === ')') throw badInput(who, key)
    if (i >= list.length) throw new LogoError(`Za mało danych dla ${who}`)
    let v = list[i++]
    if (typeof v === 'string' && v[0] === '(') {
      // `(2 + 2)`: inside a list literal parens stay glued to words (`(2`, `+`, `2)`), so take
      // items until the parens balance and evaluate them as an expression
      const parenDepth = (w) => (typeof w === 'string' ? (w.match(/\(/g)?.length ?? 0) - (w.match(/\)/g)?.length ?? 0) : 0)
      const seg = [v]
      let depth = parenDepth(v)
      while (depth > 0 && i < list.length) {
        const t = list[i++]
        seg.push(t)
        depth += parenDepth(t)
      }
      if (depth > 0) throw new LogoError('Brakuje )')
      v = await ctx.interp.evalList(seg, ctx, who)
    } else if (typeof v === 'string' && v.length > 1 && v[0] === ':') {
      v = ctx.interp.getVar(v.slice(1), ctx)
    } else if (typeof v === 'string' && v.length > 1 && v[0] === '"') {
      v = v.slice(1)
    } else if (typeof v === 'string' && isNumeric(v)) {
      v = toNumber(v)
    }
    out.push([String(key), v])
  }
  return out
}

/** Pairs from a flat argument list `"klucz wartość …` (nowyObiekt). */
function pairsOf(args, who) {
  if (args.length % 2) throw new LogoError(`Za mało danych dla ${who}`)
  const out = []
  for (let i = 0; i < args.length; i += 2) out.push([formatValue(args[i]), args[i + 1]])
  return out
}

function randomPoint(world) {
  const p = world.page
  return [rndInt(-Math.floor(p.width / 2), Math.floor(p.width / 2)), rndInt(-Math.floor(p.height / 2), Math.floor(p.height / 2))]
}

/** §1.6: `jld` in a turtle setting. */
function resolveJld(world, k, v) {
  if (isAny(v)) {
    switch (k) {
      case 'kierunek': case 'heading': return rndInt(0, 359)
      case 'poz': case 'pos': return randomPoint(world)
      case 'pozx': case 'xcor': return randomPoint(world)[0]
      case 'pozy': case 'ycor': return randomPoint(world)[1]
      case 'grubość': case 'penwidth': case 'pw': return rndInt(1, 20)
      default: return v
    }
  }
  if ((k === 'poz' || k === 'pos') && Array.isArray(v) && v.some(isAny)) {
    const r = randomPoint(world)
    return v.map((e, i) => (isAny(e) ? r[i] : e))
  }
  return v
}

function renameObject(world, obj, newName) {
  const nm = formatValue(newName)
  if (!nm) throw badInput('nazwa', newName)
  if (normName(nm) === normName(obj.name)) { obj.name = nm; return }
  if (world.objects.has(normName(nm)) || world.classes.has(normName(nm))) throw new LogoError(`Obiekt ${nm} już istnieje`)
  if (world.objects.get(normName(obj.name)) === obj) world.objects.delete(normName(obj.name))
  obj.name = nm
  if (!obj.isClass) world.objects.set(normName(nm), obj)
  if (obj instanceof Widget) obj.changed()
  world.requestRender?.()
}

/** Apply one setting (or own variable / event) to an object. */
export async function applySetting(ctx, obj, key, value) {
  const world = ctx.world
  const k = normName(key)
  const ev = eventKey(k)
  if (ev) { obj.events.set(ev, asRunlist(value)); return }
  if (k === 'nazwa' || k === 'name') { renameObject(world, obj, value); return }
  if (k === 'czuły' || k === 'sensitive') { obj.sensitive = toBool(value, 'czuły'); return }
  if (k === 'zamrożony' || k === 'frozen') { obj.frozen = toBool(value, 'zamrożony'); return }
  if (obj instanceof Turtle) {
    const v = resolveJld(world, k, value)
    if ((k === 'postać' || k === 'shape') && Array.isArray(v) && v.length && ctx.interp.registry?.lookup('ustalPostać')) {
      await ctx.interp.callProcedure('ustalPostać', [v], ctx.interp.objectCtx(ctx, obj))
      return
    }
    if (obj.setSetting(k, v)) return
  } else if (obj instanceof Page) {
    if (k === 'koltła' || k === 'bgcolour' || k === 'bgcolor' || k === 'bg') {
      if (obj === world.page) world.setBackground(value)
      else obj.background = resolveColor(value, 'ustalKolTła')
      return
    }
    if (k === 'rozmiar' || k === 'size') {
      if (!Array.isArray(value) || value.length !== 2) throw badInput('rozmiar', value)
      if (obj === world.page) world.resize(toNumber(value[0], 'rozmiar'), toNumber(value[1], 'rozmiar'))
      else { obj.width = toNumber(value[0], 'rozmiar'); obj.height = toNumber(value[1], 'rozmiar') }
      return
    }
    if (k === 'stylzakresu' || k === 'rangestyle') { obj.wrapMode = value; return }
    if (typeof obj.setSetting === 'function' && obj.setSetting(k, value)) return
  } else if (typeof obj.setSetting === 'function') {
    if (obj.setSetting(k, value)) return
  }
  obj.vars.set(k, value)
}

async function applySettings(ctx, obj, pairs) {
  // the name first, so that later errors mention the right object
  for (const [k, v] of pairs) if (['nazwa', 'name'].includes(normName(k))) await applySetting(ctx, obj, k, v)
  for (const [k, v] of pairs) if (!['nazwa', 'name'].includes(normName(k))) await applySetting(ctx, obj, k, v)
}

// ------------------------------------------------------------------ creation

const TURTLE_STATE = ['x', 'y', 'heading', 'pen', 'penColor', 'penWidth', 'penPattern', 'fillColor', 'fillPattern',
  'visible', 'shape', 'shapeScale', 'shapeColor', 'frame', 'animation', 'ownRangeStyle', 'sensitive']
const WIDGET_STATE = ['x', 'y', 'width', 'height', 'visible', 'background', 'backgroundCss', 'caption', 'min', 'max',
  'value', 'vertical', 'text']

function copyState(from, to) {
  const keys = from instanceof Turtle ? TURTLE_STATE : from instanceof Widget ? WIDGET_STATE : []
  for (const k of keys) {
    if (!(k in from)) continue
    const v = from[k]
    to[k] = Array.isArray(v) ? [...v] : v && typeof v === 'object' && k !== 'shape' && !('css' in v) ? { ...v } : v
  }
  if (from instanceof Turtle && to instanceof Turtle) {
    to.homeState = { ...from.homeState }
    to.range = from.range ? [...from.range] : null
    to.font = { ...from.font }
  }
}

/** Defaults stored by nowaKlasa along the chain, root first. */
function classDefaults(parent) {
  const chain = []
  for (let o = parent; o; o = o.parent) chain.unshift(o)
  const out = []
  for (const c of chain) if (c.isClass && c.defaults) out.push(...c.defaults)
  return out
}

/** Create an instance of `parent` (class or prototype instance), apply settings; returns the object. */
async function createInstance(ctx, parent, pairs, who) {
  const world = ctx.world
  const prim = primitiveClassOf(parent)
  if (!prim) throw badInput(who, nameOf(parent))
  const kind = prim.primitiveKind
  const nameKey = pairs.find(([k]) => ['nazwa', 'name'].includes(normName(k)))
  let name = nameKey ? formatValue(nameKey[1]) : world.nextName(prim.namePrefix)
  if (!name) throw badInput(who, nameKey?.[1])
  if (world.objects.has(normName(name)) || world.classes.has(normName(name))) throw new LogoError(`Obiekt ${name} już istnieje`)
  const isProto = !parent.isClass
  let obj
  switch (kind) {
    case 'turtle':
      obj = world.createTurtle(name, { parent })
      if (isProto && parent instanceof Turtle) copyState(parent, obj)
      break
    case 'page':
      obj = new Page({ name, width: world.page.width, height: world.page.height, parent })
      world.pages.push(obj)
      world.registerObject(obj)
      break
    case 'button': case 'slider': case 'textbox': case 'pane': {
      obj = new Widget({ world, kind, name, parent, className: parent.isClass ? parent.name : parent.className })
      if (isProto && parent instanceof Widget) copyState(parent, obj)
      else placeWidget(world, obj)
      world.widgets.push(obj)
      world.registerObject(obj)
      break
    }
    default:
      obj = new LogoObject({ name, className: parent.isClass ? parent.name : parent.className, parent })
      world.registerObject(obj)
  }
  const rest = pairs.filter(([k]) => !['nazwa', 'name'].includes(normName(k)))
  await applySettings(ctx, obj, [...classDefaults(parent), ...rest])
  world.lastObjectName = obj.name
  if (obj instanceof Widget) obj.changed()
  fireEvent(world, obj, normName('gdyUtworzony'), {})
  return obj
}

/** Cascade new widgets from the top-left corner of the page. */
function placeWidget(world, w) {
  const n = world.widgets.filter((o) => o.kind === w.kind).length
  const p = world.page
  w.x = -p.width / 2 + 10 + (n % 8) * 20
  w.y = p.height / 2 - 10 - (n % 8) * (w.height + 10)
}

async function newObject(ctx, parentName, pairs, who) {
  const world = ensure(ctx)
  const parent = findClass(world, parentName) ?? resolveObject(ctx, parentName)
  const obj = await createInstance(ctx, parent, pairs, who)
  return obj.name
}

// ------------------------------------------------------------------ removal

function removeObject(ctx, obj, who) {
  const world = ctx.world
  if (obj.isMainWindow || obj === world.page) throw badInput(who, obj.name)
  if (obj.isPrimitiveClass) throw badInput(who, obj.name)
  if (obj.isClass) {
    world.classes.delete(normName(obj.name))
    return
  }
  if (obj instanceof Turtle) world.removeTurtle(obj)
  else {
    world.unregisterObject(obj)
    if (obj instanceof Widget) {
      world.widgets.splice(world.widgets.indexOf(obj), 1)
      notifyWidgets(world)
    }
    if (obj instanceof Page) world.pages = world.pages.filter((p) => p !== obj)
  }
  const s = st(world)
  if (s) {
    if (s.hover === obj) s.hover = null
    if (s.drag === obj) s.drag = null
    s.colliding.delete(obj)
  }
}

function descendants(ctx, cls) {
  const world = ctx.world
  const all = [...allObjects(world), ...world.classes.values()]
  return all.filter((o) => o !== cls && derivesFrom(ctx.interp, o, cls))
}

// ------------------------------------------------------------------ processes (§13.1)

async function waitWhilePaused(world, interp, pctx) {
  while (world?.paused) await interp.sleep(20, pctx)
}

/**
 * Start a process. mode: 'once' | 'forever' | 'every' | 'after'.
 * The process gets its own `kto` (copy of the spawner's), stored in proc.who.
 */
export function launch(ctx, list, { mode = 'once', ms = 0, name, self, who } = {}) {
  const interp = ctx.interp
  const world = ctx.world
  const runlist = asRunlist(list)
  const whoSnap = who !== undefined ? who : [...whoList(ctx)]
  const opts = {
    who: whoSnap,
    body: async (pctx, proc) => {
      pctx.who = undefined // `kto` of the process lives in proc.who (słuchaj changes it)
      proc.who = whoSnap
      if (mode === 'after') {
        await interp.sleep(ms, pctx)
        await waitWhilePaused(world, interp, pctx)
        await interp.execList(runlist, pctx)
        return
      }
      for (;;) {
        await waitWhilePaused(world, interp, pctx)
        await interp.execList(runlist, pctx)
        if (mode === 'once') return
        if (mode === 'every') await interp.sleep(ms, pctx)
        else await interp.maybeYield(pctx)
      }
    },
  }
  if (name !== undefined) opts.name = formatValue(name)
  if (self !== undefined) opts.self = self
  return interp.spawnProcess(runlist, ctx, opts)
}

function processesNamed(interp, x) {
  const names = new Set((Array.isArray(x) ? x : [x]).map((n) => normName(formatValue(n))))
  return [...interp.processes].filter((p) => names.has(normName(p.name)))
}

// ------------------------------------------------------------------ events (§13.2, §13.3)

/** Run object's handler for event `key` as a process. Returns the process or null. */
export function fireEvent(world, obj, key, data = {}) {
  const interp = world?.interp
  if (!interp || !obj || obj.frozen) return null
  const list = findEventIn(interp, obj, key)
  if (list === undefined || (Array.isArray(list) && !list.length)) return null
  const s = st(world)
  if (s && SKIP_IF_RUNNING.has(key)) {
    const prev = s.running.get(obj)?.get(key)
    if (prev && !prev.done) return null
  }
  const whoSnap = isTurtle(obj) ? [obj] : undefined
  const opts = {
    name: `${obj.name}'${EVENT_DISPLAY.get(key) ?? key}`,
    self: obj,
    body: async (pctx, proc) => {
      pctx.who = undefined
      proc.who = whoSnap
      await waitWhilePaused(world, interp, pctx)
      await interp.execList(asRunlist(list), pctx)
    },
  }
  if (whoSnap) opts.who = whoSnap
  const proc = interp.spawnProcess(asRunlist(list), null, opts)
  proc.event = { key, data, target: obj }
  if (s) {
    if (!s.running.has(obj)) s.running.set(obj, new Map())
    s.running.get(obj).set(key, proc)
  }
  return proc
}

function targetOf(world, t) {
  if (t === undefined || t === null) return null
  if (t instanceof LogoObject) return t
  const k = normName(t)
  if (world.mainWindow && k === normName(world.mainWindow.name)) return world.mainWindow
  return world.objects.get(k) ?? world.classes.get(k) ?? null
}

/** world.eventHandler — see the contract at the top of this file. */
export function handleEvent(world, name, data = {}) {
  data = data ?? {}
  const n = normName(String(name))
  const started = []
  const fire = (obj, key) => { const p = fireEvent(world, obj, key, data); if (p) started.push(p); return p }

  // UI short names
  if (POINTER_SHORT.has(n)) {
    const r = world.pointer(POINTER_SHORT.get(n), Number(data.x) || 0, Number(data.y) || 0, Number(data.button) || 0)
    return Array.isArray(r) ? r : started
  }
  if (n === 'klawisz' || n === 'key') {
    const r = world.key(data.key)
    return Array.isArray(r) ? r : started
  }
  if (n === 'wznów' || n === 'resume' || n === 'wznówwszystko' || n === 'resumeall') { world.paused = false; return started }
  if (n === 'przyciskpaska' || n === 'buttonbar') {
    const b = world.buttonBar?.buttons?.[Number(data.index)]
    if (b && world.interp) {
      const p = world.interp.spawnProcess(asRunlist(b.list), null, { name: `przycisk:${b.caption}` })
      started.push(p)
    }
    return started
  }

  const key = eventKey(name)
  if (!key) return started
  const s = st(world)

  if (POINTER_EVENTS.has(key)) {
    const page = world.page
    let target = targetOf(world, data.target)
    if (target === null) target = world.turtleAt?.(Number(data.x) || 0, Number(data.y) || 0) ?? page
    // drag / hover tracking
    if (s && target instanceof Turtle) {
      if (key === normName('gdyLewyWciśnięty') || key === normName('gdyPrawyWciśnięty')) s.drag = target
    }
    if (s && (key === normName('gdyLewyPuszczony') || key === normName('gdyPrawyPuszczony'))) s.drag = null
    if (s && key === normName('gdyRuchMyszy')) {
      const over = target instanceof Turtle ? target : null
      if (over !== s.hover) {
        if (s.hover) fire(s.hover, normName('gdyMyszWychodzi'))
        if (over) fire(over, normName('gdyMyszWchodzi'))
        s.hover = over
      }
      if (s.drag && (world.mouse?.buttons ?? 0) !== 0) fire(s.drag, normName('gdyCiągnięty'))
    }
    // the turtle under the pointer if it has a handler, else the page
    if (target !== page && !target.frozen && findEventIn(world.interp, target, key) !== undefined) fire(target, key)
    else if (target !== page && target instanceof Widget) { /* widgets: UI handles */ }
    else fire(page, key)
    return started
  }

  if (key === normName('gdyKlawisz')) {
    const target = targetOf(world, data.target)
    if (target) { fire(target, key); return started }
    for (const o of [world.mainWindow, world.page, ...world.turtles]) if (o) fire(o, key)
    return started
  }

  // widget events from the UI
  const target = targetOf(world, data.target)
  if (target instanceof Widget && 'value' in data && data.value !== undefined &&
      (key === normName('gdyZmieniasz') || key === normName('gdyPoZmianie'))) {
    try { target.setValue(data.value) } catch { /* bad value from UI: ignore */ }
  }
  if (target) fire(target, key)
  else if (key === normName('gdyCzyść') || key === normName('gdyPokazanaStrona') || key === normName('gdyWczytany')) fire(world.page, key)
  return started
}

/** gdyZderzenie for turtles with `czuły prawda`; called on every render. */
export function checkCollisions(world) {
  const s = st(world)
  if (!s) return
  const sens = world.turtles.filter((t) => t.sensitive)
  if (!sens.length) return
  for (const t of sens) {
    const prev = s.colliding.get(t) ?? new Set()
    const now = new Set()
    if (t.visible) {
      const r1 = shapeRadius(t.currentShape, t.shapeScale)
      for (const o of world.turtles) {
        if (o === t || !o.visible || o.page !== t.page) continue
        const r2 = shapeRadius(o.currentShape, o.shapeScale)
        if (Math.hypot(t.x - o.x, t.y - o.y) < r1 + r2) now.add(o)
      }
    }
    for (const o of now) if (!prev.has(o)) fireEvent(world, t, normName('gdyZderzenie'), { other: o })
    s.colliding.set(t, now)
  }
}

// ------------------------------------------------------------------ registration

export function register(registry) {
  const def = (names, spec) => {
    const fn = spec.fn
    registry.define(names, {
      ...spec,
      fn: async (ctx, ...args) => {
        ensure(ctx)
        const v = await fn(ctx, ...args)
        if (spec.discardable && v !== undefined) DISCARD.set(ctx, v)
        return v
      },
    })
  }
  const self = (ctx) => ctx.self ?? ctx.world.mainWindow
  const widgetSelf = (ctx, who, kinds) => {
    const s = ctx._self ?? ctx.self
    if (!(s instanceof Widget) || (kinds && !kinds.includes(s.kind))) {
      throw new LogoError(`${who} nie lubi ${s ? s.name : '"'} jako danej`, { hint: INCOMPATIBLE })
    }
    return s
  }

  // ---------------------------------------------------------------- §12.1 wiele żółwi
  def(['słuchaj', 'tell', 'setWho', 'ustalKto'], {
    arity: 1,
    doc: 'Ustala aktywne żółwie: nazwa, lista nazw albo wszystkie.',
    fn: async (ctx, x) => {
      const objs = resolveMany(ctx, x)
      if (objs.some((o) => !(o instanceof Turtle))) {
        throw new LogoError(`słuchaj nie lubi ${formatValue(Array.isArray(x) ? x : x)} jako danej`, { hint: INCOMPATIBLE })
      }
      if (ctx.who !== undefined) ctx.who = objs
      else if (ctx.process) ctx.process.who = objs
      else ctx.world.activeTurtles = objs
    },
  })
  def(['kto', 'who'], {
    arity: 0,
    doc: 'Aktywne żółwie bieżącego procesu (słowo, gdy jeden).',
    fn: async (ctx) => whoValue(whoList(ctx)),
  })
  const askFn = (sequential) => async (ctx, targets, list) => {
    const objs = resolveMany(ctx, targets)
    const run = (o) => ctx.interp.runList(list, ctx.interp.objectCtx(ctx, o))
    if (sequential) {
      let first
      for (let i = 0; i < objs.length; i++) {
        const v = await run(objs[i])
        if (i === 0) first = v
      }
      return first
    }
    const vals = await Promise.all(objs.map(run))
    return vals[0]
  }
  def(['proszę', 'ask'], { arity: 2, doc: 'Podane obiekty wykonują listę równolegle.', fn: askFn(false) })
  def(['proszęKażdego', 'askEach'], {
    arity: 2,
    doc: 'Podane obiekty wykonują listę po kolei.',
    fn: async (ctx, t, l) => { await askFn(true)(ctx, t, l) },
  })
  def(['każdy', 'each'], {
    arity: 1,
    doc: 'Aktywne żółwie po kolei wykonują listę.',
    fn: async (ctx, list) => {
      for (const t of [...whoList(ctx)]) await ctx.interp.execList(list, ctx.interp.objectCtx(ctx, t))
    },
  })
  def(['wszystkie', 'all', 'allTurtles'], {
    arity: 0,
    doc: 'Żółwie strony.',
    fn: async (ctx) => {
      const s = ctx._self
      const page = s instanceof Page ? s : ctx.world.page
      return ctx.world.turtlesOf(page).map(nameOf)
    },
  })
  def(['wszystkieZ', 'allOf'], {
    arity: 1,
    doc: 'Wszystkie jednostki danej klasy.',
    fn: async (ctx, c) => {
      const cls = findClass(ctx.world, c) ?? resolveObject(ctx, c)
      return allObjects(ctx.world).filter((o) => derivesFrom(ctx.interp, o, cls)).map(nameOf)
    },
  })
  def(['ktoNaStronie', 'pageWho'], {
    arity: 0,
    doc: 'kto z punktu widzenia strony.',
    fn: async (ctx) => {
      const s = ctx._self
      const page = s instanceof Page ? s : ctx.world.page
      return whoValue(ctx.world.activeTurtles.filter((t) => t.page === page))
    },
  })

  // ---------------------------------------------------------------- §12.2 tworzenie i usuwanie
  def(['nowy', 'new'], {
    arity: 2,
    discardable: true,
    doc: 'nowy "Żółw [ustawienia] — tworzy jednostkę klasy albo prototypu; zwraca jej nazwę.',
    fn: async (ctx, parent, settings) => newObject(ctx, parent, await parseSettings(ctx, settings, 'nowy'), 'nowy'),
  })
  def(['nowyObiekt', 'newObject'], {
    arity: 1,
    minArity: 1,
    maxArity: Infinity,
    discardable: true,
    doc: '(nowyObiekt "Żółw "ustawienie wartość …)',
    fn: async (ctx, parent, ...rest) => newObject(ctx, parent, pairsOf(rest, 'nowyObiekt'), 'nowyObiekt'),
  })
  def(['nowaKlasa', 'newClass'], {
    arity: 3,
    doc: 'nowaKlasa "Żółw "Ptaszek [ustawienia]',
    fn: async (ctx, parentName, name, settings) => {
      const world = ctx.world
      const parent = findClass(world, parentName) ?? resolveObject(ctx, parentName)
      const nm = formatValue(name)
      if (!nm || Array.isArray(name)) throw badInput('nowaKlasa', name)
      if (world.classes.has(normName(nm)) || world.objects.has(normName(nm)) || CLASS_ALIAS.has(normName(nm))) {
        throw new LogoError(`Obiekt ${nm} już istnieje`)
      }
      const cls = new LogoObject({ name: nm, className: nm, parent })
      cls.isClass = true
      cls.defaults = []
      for (const [k, v] of await parseSettings(ctx, settings, 'nowaKlasa')) {
        const ev = eventKey(k)
        if (ev) cls.events.set(ev, asRunlist(v))
        else cls.defaults.push([k, v])
      }
      world.classes.set(normName(nm), cls)
    },
  })
  def(['klonuj', 'clone'], {
    arity: 1,
    minArity: 1,
    maxArity: 2,
    discardable: true,
    doc: 'Kopia obiektu z jego zmiennymi i procedurami.',
    fn: async (ctx, x, settings) => {
      const world = ctx.world
      const src = resolveObject(ctx, x)
      if (src.isClass || src.isMainWindow || src instanceof Page) throw badInput('klonuj', src.name)
      const pairs = settings === undefined ? [] : await parseSettings(ctx, settings, 'klonuj')
      const prim = primitiveClassOf(src)
      const nameKey = pairs.find(([k]) => ['nazwa', 'name'].includes(normName(k)))
      const name = nameKey ? formatValue(nameKey[1]) : world.nextName(prim?.namePrefix ?? 'obiekt')
      if (world.objects.has(normName(name))) throw new LogoError(`Obiekt ${name} już istnieje`)
      let obj
      if (src instanceof Turtle) {
        obj = world.createTurtle(name, { parent: src.parent })
        obj.page = src.page
      } else if (src instanceof Widget) {
        obj = new Widget({ world, kind: src.kind, name, parent: src.parent, className: src.className })
        world.widgets.push(obj)
        world.registerObject(obj)
      } else {
        obj = new LogoObject({ name, className: src.className, parent: src.parent })
        world.registerObject(obj)
      }
      copyState(src, obj)
      for (const [k, v] of src.vars) obj.vars.set(k, Array.isArray(v) ? [...v] : v)
      for (const [k, v] of src.procs) obj.procs.set(k, v)
      for (const [k, v] of src.events) obj.events.set(k, v)
      if (src.behaviours) obj.behaviours = [...src.behaviours]
      await applySettings(ctx, obj, pairs.filter(([k]) => !['nazwa', 'name'].includes(normName(k))))
      world.lastObjectName = obj.name
      if (obj instanceof Widget) obj.changed()
      world.requestRender?.()
      fireEvent(world, obj, normName('gdyUtworzony'), {})
      return obj.name
    },
  })
  def(['usuńObiekt', 'eraseObject'], {
    arity: 1,
    doc: 'Usuwa obiekt albo listę obiektów.',
    fn: async (ctx, x) => {
      for (const o of resolveMany(ctx, x)) removeObject(ctx, o, 'usuńObiekt')
    },
  })
  def(['usuńCałkowicie', 'eraseComplete'], {
    arity: 1,
    doc: 'Usuwa klasę razem ze wszystkimi jej jednostkami.',
    fn: async (ctx, x) => {
      const cls = findClass(ctx.world, x) ?? resolveObject(ctx, x)
      if (cls.isPrimitiveClass) throw badInput('usuńCałkowicie', cls.name)
      const ds = descendants(ctx, cls)
      for (const o of ds.filter((d) => !d.isClass)) removeObject(ctx, o, 'usuńCałkowicie')
      for (const o of ds.filter((d) => d.isClass)) removeObject(ctx, o, 'usuńCałkowicie')
      removeObject(ctx, cls, 'usuńCałkowicie')
    },
  })
  def(['zniszcz', 'destroy'], {
    arity: 0,
    doc: 'Obiekt usuwa sam siebie.',
    fn: async (ctx) => removeObject(ctx, self(ctx), 'zniszcz'),
  })

  // ---------------------------------------------------------------- §12.3 introspekcja i zachowania
  def(['mojaNazwa', 'myName'], { arity: 0, doc: 'Nazwa obiektu, który wykonuje kod.', fn: async (ctx) => self(ctx).name })
  const pageName = (ctx) => {
    const s = self(ctx)
    if (s instanceof Page) return s.name
    return (s.page ?? ctx.world.page).name
  }
  def(['mojaStrona', 'myPage'], { arity: 0, doc: 'Strona obiektu.', fn: async (ctx) => pageName(ctx) })
  def(['mojeMiejsce', 'myPlace'], { arity: 0, doc: 'Strona albo plansza obiektu.', fn: async (ctx) => pageName(ctx) })
  def(['mójRodzic', 'myParent'], {
    arity: 0,
    doc: 'Klasa lub prototyp obiektu.',
    fn: async (ctx) => self(ctx).parent?.name ?? [],
  })
  def(['ostatniObiekt', 'lastObject', 'lastName'], {
    arity: 0,
    doc: 'Nazwa ostatnio utworzonego obiektu.',
    fn: async (ctx) => ctx.world.lastObjectName ?? '',
  })
  def(['adresat', 'receiver'], {
    arity: 0,
    doc: 'Bieżący adresat procesu (domyślnie okno główne).',
    fn: async (ctx) => (ctx._self ?? ctx.world.mainWindow).name,
  })
  def(['klasa?', 'class?'], {
    arity: 1,
    doc: 'Czy słowo jest nazwą klasy.',
    fn: async (ctx, x) => fromBool(!!findClass(ctx.world, x)),
  })
  def(['jest?', 'is?', 'e?'], {
    arity: 1,
    minArity: 1,
    maxArity: 2,
    doc: '(jest? klasa obiekt) — czy obiekt (domyślnie self) pochodzi od klasy.',
    fn: async (ctx, c, o) => {
      const cls = findClass(ctx.world, c) ?? ctx.interp.findObject(c, ctx)
      if (!cls) return FALSE
      const obj = o === undefined ? self(ctx) : resolveObject(ctx, o)
      return fromBool(derivesFrom(ctx.interp, obj, cls))
    },
  })
  def(['obiekt?', 'object?'], {
    arity: 1,
    doc: 'Czy słowo jest nazwą obiektu.',
    fn: async (ctx, x) => {
      if (x instanceof LogoObject) return TRUE
      if (Array.isArray(x)) return FALSE
      try { resolveObject(ctx, x); return TRUE } catch { return FALSE }
    },
  })
  def(['obiekty', 'objects'], {
    arity: 0,
    doc: 'Nazwy wszystkich obiektów.',
    fn: async (ctx) => allObjects(ctx.world).map(nameOf),
  })
  def(['nazwy', 'names'], {
    arity: 0,
    doc: 'Zmienne obiektu self (z klasami) albo globalne.',
    fn: async (ctx) => {
      const s = ctx.self
      if (!s) return [...ctx.interp.globals.keys()]
      const out = new Set()
      for (const o of eventChain(ctx.interp, s)) for (const k of o.vars.keys()) out.add(k)
      return [...out]
    },
  })
  def(['zmienne', 'variables'], {
    arity: 0,
    doc: 'Zmienne własne obiektu.',
    fn: async (ctx) => [...self(ctx).vars.keys()],
  })
  def(['potomkowie', 'descendants'], {
    arity: 1,
    doc: 'Podklasy i jednostki obiektu.',
    fn: async (ctx, x) => {
      const o = findClass(ctx.world, x) ?? resolveObject(ctx, x)
      return descendants(ctx, o).map(nameOf)
    },
  })
  def(['dodajZachowanie', 'addBehaviour', 'addBehavior'], {
    arity: 1,
    doc: 'Dołącza obiekt jako zachowanie (dodatkowego rodzica).',
    fn: async (ctx, x) => {
      const s = self(ctx)
      const b = findClass(ctx.world, x) ?? resolveObject(ctx, x)
      if (b === s || derivesFrom(ctx.interp, b, s)) throw badInput('dodajZachowanie', nameOf(b))
      s.behaviours = [...(s.behaviours ?? []).filter((o) => o !== b), b]
    },
  })
  def(['usuńZachowanie', 'removeBehaviour', 'removeBehavior'], {
    arity: 1,
    doc: 'Odłącza zachowanie.',
    fn: async (ctx, x) => {
      const s = self(ctx)
      const b = findClass(ctx.world, x) ?? resolveObject(ctx, x)
      s.behaviours = (s.behaviours ?? []).filter((o) => o !== b)
    },
  })
  def(['mojeZachowania', 'myBehaviours', 'myBehaviors'], {
    arity: 0,
    doc: 'Lista zachowań.',
    fn: async (ctx) => (self(ctx).behaviours ?? []).map(nameOf),
  })
  def(['ustalStan', 'setState'], {
    arity: 1,
    doc: 'Ustawia wiele ustawień naraz z listy par.',
    fn: async (ctx, list) => applySettings(ctx, self(ctx), await parseSettings(ctx, list, 'ustalStan')),
  })
  def(['zamroźMnie', 'freezeMe'], { arity: 0, doc: 'Obiekt przestaje reagować na zdarzenia.', fn: async (ctx) => { self(ctx).frozen = true } })
  def(['odmroźMnie', 'unFreezeMe'], { arity: 0, doc: 'Obiekt znów reaguje na zdarzenia.', fn: async (ctx) => { self(ctx).frozen = false } })
  def(['zamrożony?', 'isFrozen?'], { arity: 0, doc: 'Czy obiekt jest zamrożony.', fn: async (ctx) => fromBool(!!self(ctx).frozen) })

  // ---------------------------------------------------------------- §13.1 procesy
  def(['bezKońca', 'forever'], {
    arity: 1,
    minArity: 1,
    maxArity: 2,
    doc: 'Nowy proces, który bez końca wykonuje listę.',
    fn: async (ctx, list, name) => { launch(ctx, list, { mode: 'forever', name }) },
  })
  def(['co', 'every'], {
    arity: 2,
    minArity: 2,
    maxArity: 3,
    doc: 'co N [lista] — nowy proces wykonujący listę co N ms.',
    fn: async (ctx, ms, list, name) => {
      const n = toNumber(ms)
      launch(ctx, list, { mode: 'every', ms: Math.max(0, n), name })
    },
  })
  def(['równolegle', 'launch'], {
    arity: 1,
    minArity: 1,
    maxArity: 2,
    doc: 'Uruchamia listę jako nowy proces równoległy.',
    fn: async (ctx, list, name) => { launch(ctx, list, { mode: 'once', name }) },
  })
  def(['poCzasie', 'after'], {
    arity: 2,
    minArity: 2,
    maxArity: 3,
    doc: 'poCzasie N [lista] — po N ms wykonuje listę w nowym procesie.',
    fn: async (ctx, ms, list, name) => {
      const n = toNumber(ms)
      launch(ctx, list, { mode: 'after', ms: Math.max(0, n), name })
    },
  })
  def(['anuluj', 'cancel'], {
    arity: 1,
    doc: 'Zatrzymuje proces o podanej nazwie (albo listę procesów).',
    fn: async (ctx, x) => {
      const ps = processesNamed(ctx.interp, x)
      const mine = ps.includes(ctx.process)
      for (const p of ps) p.cancel()
      if (mine) throw new AbortSignal()
    },
  })
  def(['skończony?', 'done?'], {
    arity: 1,
    doc: 'Czy proces się zakończył.',
    fn: async (ctx, x) => fromBool(processesNamed(ctx.interp, x).length === 0),
  })
  def(['wszystkieProcesy', 'allProcesses'], {
    arity: 0,
    doc: 'Nazwy żywych procesów.',
    fn: async (ctx) => [...ctx.interp.processes].filter((p) => !p.done && !p.cancelled).map((p) => p.name),
  })
  def(['zatrzymajMnie', 'stopMe'], {
    arity: 0,
    doc: 'Kończy bieżący proces.',
    fn: async (ctx) => {
      ctx.process?.cancel()
      throw new AbortSignal()
    },
  })
  def(['zatrzymajWszystko', 'stopAll'], {
    arity: 0,
    doc: 'Zatrzymuje wszystkie procesy (jak przycisk Zatrzymaj / F12).',
    fn: async (ctx) => {
      ctx.world.paused = false
      ctx.interp.abort()
      throw new AbortSignal()
    },
  })
  def(['wstrzymajWszystko', 'pauseAll'], {
    arity: 0,
    doc: 'Wstrzymuje wszystkie procesy.',
    fn: async (ctx) => { ctx.world.paused = true; notifyWidgets(ctx.world) },
  })
  def(['wznówWszystko', 'resumeAll'], {
    arity: 0,
    doc: 'Wznawia wstrzymane procesy.',
    fn: async (ctx) => { ctx.world.paused = false; notifyWidgets(ctx.world) },
  })

  // ---------------------------------------------------------------- §13.2 zdarzenia
  def(['ustalZdarzenie', 'setEvent'], {
    arity: 2,
    doc: 'ustalZdarzenie "gdyKlik [lista] — zdarzenie obiektu self.',
    fn: async (ctx, name, list) => {
      const k = requireEvent(name, 'ustalZdarzenie')
      self(ctx).events.set(k, asRunlist(list))
    },
  })
  def(['zdarzenie', 'event'], {
    arity: 1,
    doc: 'Lista instrukcji zdarzenia.',
    fn: async (ctx, name) => findEventIn(ctx.interp, self(ctx), requireEvent(name, 'zdarzenie')) ?? [],
  })
  def(['usuńZdarzenie', 'eraseEvent'], {
    arity: 1,
    doc: 'Usuwa zdarzenie.',
    fn: async (ctx, name) => { self(ctx).events.delete(requireEvent(name, 'usuńZdarzenie')) },
  })
  def(['uruchomZdarzenie', 'runEvent'], {
    arity: 1,
    doc: 'Uruchamia zdarzenie programowo (czeka na jego koniec).',
    fn: async (ctx, name) => {
      const s = self(ctx)
      const list = findEventIn(ctx.interp, s, requireEvent(name, 'uruchomZdarzenie'))
      if (list === undefined) return
      await ctx.interp.execList(asRunlist(list), ctx.interp.objectCtx(ctx, s))
    },
  })
  def(['zdarzenie?', 'event?'], {
    arity: 1,
    doc: 'Czy zdarzenie jest zdefiniowane (z dziedziczeniem).',
    fn: async (ctx, name) => fromBool(findEventIn(ctx.interp, self(ctx), requireEvent(name, 'zdarzenie?')) !== undefined),
  })
  def(['zdarzenia', 'events'], {
    arity: 0,
    doc: 'Nazwy zdarzeń obiektu.',
    fn: async (ctx) => [...self(ctx).events.keys()].map((k) => EVENT_DISPLAY.get(k) ?? k),
  })

  // ---------------------------------------------------------------- §14 elementy interfejsu
  def(['ustalZawartość', 'setContents', 'setValue'], {
    arity: 1,
    doc: 'Pole tekstowe: ustala tekst. Suwak: ustala wartość.',
    fn: async (ctx, v) => widgetSelf(ctx, 'ustalZawartość', ['textbox', 'slider']).setValue(v),
  })
  def(['zawartość', 'contents', 'value'], {
    arity: 0,
    doc: 'Pole tekstowe: tekst. Suwak: wartość.',
    fn: async (ctx) => widgetSelf(ctx, 'zawartość', ['textbox', 'slider']).getValue(),
  })
  def(['ustalNapis', 'setCaption'], {
    arity: 1,
    doc: 'Napis na przycisku.',
    fn: async (ctx, v) => { widgetSelf(ctx, 'ustalNapis', ['button']).setSetting('napis', v) },
  })
  def(['napis', 'caption'], {
    arity: 0,
    doc: 'Napis na przycisku.',
    fn: async (ctx) => widgetSelf(ctx, 'napis', ['button']).caption,
  })
  def(['ustalMin', 'setMin'], {
    arity: 1,
    doc: 'Minimum suwaka.',
    fn: async (ctx, v) => { widgetSelf(ctx, 'ustalMin', ['slider']).setSetting('min', v) },
  })
  def(['ustalMaks', 'setMax'], {
    arity: 1,
    doc: 'Maksimum suwaka.',
    fn: async (ctx, v) => { widgetSelf(ctx, 'ustalMaks', ['slider']).setSetting('maks', v) },
  })
  def(['piszDoPola', 'printToTextBox'], {
    arity: 2,
    doc: 'piszDoPola "pt1 tekst — dopisuje wiersz do pola tekstowego.',
    fn: async (ctx, box, text) => {
      const o = resolveObject(ctx, box)
      if (!(o instanceof Widget) || o.kind !== 'textbox') throw badInput('piszDoPola', nameOf(o))
      o.appendText((o.text && !o.text.endsWith('\n') ? '\n' : '') + textOf(text))
    },
  })
  def(['ustalPrzyciski', 'setButtons'], {
    arity: 1,
    doc: 'ustalPrzyciski [napis [instrukcje] …] — przyciski okna przycisków.',
    fn: async (ctx, list) => {
      if (!Array.isArray(list)) throw badInput('ustalPrzyciski', list)
      const buttons = []
      const flat = list.every((e) => Array.isArray(e) && e.length === 2 && !Array.isArray(e[0])) ? list.flat() : list
      for (let i = 0; i < flat.length; i += 2) {
        const cap = flat[i]
        const l = flat[i + 1]
        if (Array.isArray(cap) || l === undefined) throw badInput('ustalPrzyciski', list)
        buttons.push({ caption: formatValue(cap), list: asRunlist(l) })
      }
      ctx.world.buttonBar.buttons = buttons
      ctx.world.buttonBar.visible = true
      notifyWidgets(ctx.world)
    },
  })
  def(['pokażPrzyciski', 'showButtons'], {
    arity: 0,
    doc: 'Pokazuje okno przycisków.',
    fn: async (ctx) => { ctx.world.buttonBar.visible = true; notifyWidgets(ctx.world) },
  })
  def(['schowajPrzyciski', 'hideButtons'], {
    arity: 0,
    doc: 'Chowa okno przycisków.',
    fn: async (ctx) => { ctx.world.buttonBar.visible = false; notifyWidgets(ctx.world) },
  })
}
