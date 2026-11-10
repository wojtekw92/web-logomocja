// World: pages, turtles, objects, scheduler hooks, rendering, events. Owner: graphics.
// See docs/ARCHITEKTURA.md and PRIMITYWY.md §4, §12, §13, §17.3–4, §17.12.
import { LogoObject, normName } from '../core/values.js'
import { LogoError, AbortSignal } from '../core/errors.js'
import { resolveColor, colorToLogo, WHITE } from './colors.js'
import { Turtle, parseRangeStyle } from './turtle.js'
import { HeadlessSurface, pixelToLogo } from './surface.js'
import { shapeRadius } from './shapes.js'

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

// Macrotask scheduling that does not suffer the 4 ms setTimeout clamp.
let macrotask
if (typeof setImmediate === 'function') {
  macrotask = (fn) => setImmediate(fn)
} else if (typeof MessageChannel === 'function') {
  const ch = new MessageChannel()
  const queue = []
  ch.port1.onmessage = () => { const f = queue.shift(); if (f) f() }
  macrotask = (fn) => { queue.push(fn); ch.port2.postMessage(0) }
} else {
  macrotask = (fn) => setTimeout(fn, 0)
}
const unrefTimer = (t) => { if (t && typeof t.unref === 'function') t.unref(); return t }

/** Pixels per animation frame for speed 1..10 (index = speed). */
export const SPEED_STEP_PX = [Infinity, 1, 2, 3, 4, 6, 9, 13, 20, 32, 50]

/** Page (strona) — a LogoObject with drawing-surface settings. */
export class Page extends LogoObject {
  constructor({ name = 's1', width = 796, height = 499, parent = null } = {}) {
    super({ name, className: 'Strona', parent })
    this.width = width
    this.height = height
    this.background = WHITE
    this.wrapMode = 'sklej' // 'sklej' | 'okno' | 'płot' | 'odbij'
  }
  getSetting(name) {
    switch (normName(name)) {
      case 'koltła': case 'bgcolour': case 'bgcolor': case 'bg': return colorToLogo(this.background)
      case 'rozmiar': case 'size': return [this.width, this.height]
      case 'nazwa': case 'name': return this.name
      case 'stylzakresu': case 'rangestyle': return this.wrapMode
      default: return undefined
    }
  }
  /** Page settings for `nowy`/`ustaw`/`ustalStan`; returns false when `name` is not a setting. */
  setSetting(name, v) {
    const w = this.world
    switch (normName(name)) {
      case 'koltła': case 'bgcolour': case 'bgcolor': case 'bg':
        if (w && w.page === this) w.setBackground(v)
        else this.background = resolveColor(v, 'ustalKolTła')
        return true
      case 'rozmiar': case 'size': {
        if (!Array.isArray(v) || v.length !== 2) throw new LogoError(`rozmiar nie lubi ${v} jako danej`)
        const [a, b] = v.map(Number)
        if (!Number.isFinite(a) || !Number.isFinite(b)) throw new LogoError(`rozmiar nie lubi [${v.join(' ')}] jako danej`)
        if (w && w.page === this) w.resize(a, b)
        else { this.width = Math.max(1, Math.round(a)); this.height = Math.max(1, Math.round(b)) }
        return true
      }
      case 'stylzakresu': case 'rangestyle': {
        const st = parseRangeStyle(String(v))
        if (!st) throw new LogoError(`stylZakresu nie lubi ${v} jako danej`)
        this.wrapMode = st
        return true
      }
      default: return false
    }
  }
}

export class World {
  /**
   * @param {{surface?: object, width?: number, height?: number}} opts
   */
  constructor({ surface, width = 796, height = 499 } = {}) {
    this.surface = surface || new HeadlessSurface({ width, height })
    if (this.surface.width !== width || this.surface.height !== height) {
      // surface size wins if it was created explicitly with another size
      width = this.surface.width; height = this.surface.height
    }
    // primitive classes (prims/objects.js may add more / attach procedures)
    this.classes = new Map()
    this.turtleClass = new LogoObject({ name: 'Żółw', className: 'Żółw' })
    this.pageClass = new LogoObject({ name: 'Strona', className: 'Strona' })
    this.classes.set(normName('Żółw'), this.turtleClass)
    this.classes.set(normName('Strona'), this.pageClass)

    this.objects = new Map()      // normName -> LogoObject (pages, turtles, buttons, …)
    this.turtles = []
    this.activeTurtles = []
    this.pages = []
    this.page = this._createPage('s1', width, height)

    /** 0 = instant (max speed, identical to original). 1..10 = animated, 1 slowest, 10 fastest. */
    this.speed = 0
    /** ms to wait per animation frame when speed > 0 (tests may set 0). */
    this.frameDelay = 16
    /** at max speed, yield to the macrotask queue at most every `yieldInterval` ms. */
    this.yieldInterval = 16
    /** `płot` (fence): false = stop silently at the edge (§2.7); true = also throw LogoError. */
    this.fenceError = false

    this.timers = []     // placeholder registry for prims/objects.js (co, poCzasie)
    this.processes = []  // placeholder registry for prims/objects.js (bezKońca, równolegle)

    /** Installed by prims: (eventName, data) => any. data: {target, x?, y?, button?, key?} */
    this.eventHandler = null
    /** Optional hook called at every yield/frame; may throw (e.g. AbortSignal). */
    this.abortCheck = null
    this._abort = false
    this._lastYield = now()

    this.mouse = { x: 0, y: 0, buttons: 0 }
    this.keys = { buffer: [], last: '' }

    this._renderCbs = new Set()
    this._renderScheduled = false
    this.lastObjectName = ''

    const t = this.createTurtle()
    this.activeTurtles = [t]
    this.surface.setBackground?.(this.page.background)
    this.surface.clear(this.page.background)
  }

  // ---------- objects ----------
  _createPage(name, width, height) {
    const p = new Page({ name, width, height, parent: this.pageClass })
    Object.defineProperty(p, 'world', { value: this, enumerable: false, configurable: true, writable: true })
    this.pages.push(p)
    this.registerObject(p)
    return p
  }

  registerObject(obj) {
    const k = normName(obj.name)
    if (!k) throw new LogoError('Obiekt bez nazwy')
    this.objects.set(k, obj)
    this.lastObjectName = obj.name
    return obj
  }

  unregisterObject(obj) {
    const k = normName(typeof obj === 'string' ? obj : obj.name)
    const o = this.objects.get(k)
    this.objects.delete(k)
    if (o instanceof Turtle) {
      this.turtles = this.turtles.filter((t) => t !== o)
      this.activeTurtles = this.activeTurtles.filter((t) => t !== o)
      this.requestRender()
    }
    return o
  }

  /** Object by name (case-insensitive), or undefined. Accepts a LogoObject (returned as is). */
  getObject(name) {
    if (name instanceof LogoObject) return name
    return this.objects.get(normName(name))
  }

  /** Smallest unused `<prefix><n>` (n ≥ 1), e.g. ż1, ż2, … */
  nextName(prefix) {
    for (let n = 1; ; n++) if (!this.objects.has(normName(prefix + n))) return prefix + n
  }

  /**
   * Create a turtle on the current page with default state (§17.4). Not activated.
   * @param {string} [name] defaults to the next free ż<n>
   * @param {{parent?: LogoObject}} [opts] parent class/prototype (default: Żółw class)
   */
  createTurtle(name, { parent } = {}) {
    const nm = name || this.nextName('ż')
    if (this.objects.has(normName(nm))) throw new LogoError(`Obiekt ${nm} już istnieje`)
    const t = new Turtle({ world: this, name: nm, page: this.page, parent: parent || this.turtleClass })
    t.zOrder = this.turtles.length
    this.turtles.push(t)
    this.registerObject(t)
    this.requestRender()
    return t
  }

  removeTurtle(t) {
    const tt = typeof t === 'string' ? this.getObject(t) : t
    if (!(tt instanceof Turtle)) throw new LogoError(`Nie ma obiektu ${t}`)
    this.unregisterObject(tt)
  }

  /** Turtles living on a page (default: current). */
  turtlesOf(page = this.page) { return this.turtles.filter((t) => t.page === page) }

  // ---------- page ----------
  get wrapMode() { return this.page.wrapMode }
  set wrapMode(m) {
    const s = parseRangeStyle(m)
    if (!s) throw new LogoError(`ustalStylZakresu nie lubi ${m} jako danej`)
    this.page.wrapMode = s
  }

  /** zmaż — fill the page with the background; turtles stay. */
  clean() {
    this.surface.clear(this.page.background)
    this.requestRender()
  }

  /** czyść — clean + every turtle of the page returns to its homeState (no drawing); fires gdyCzyść. */
  clearScreen() {
    this.clean()
    for (const t of this.turtlesOf()) t.home()
    return this.dispatchEvent('gdyCzyść', { target: this.page })
  }

  /** ustalKolTła — set background and clear the page; turtles untouched. */
  setBackground(c) {
    this.page.background = resolveColor(c, 'ustalKolTła')
    this.surface.setBackground?.(this.page.background)
    this.clean()
  }

  /** ustalRozmiar — resize page (clears it). */
  resize(w, h) {
    this.page.width = Math.max(1, Math.round(w)); this.page.height = Math.max(1, Math.round(h))
    this.surface.resize(this.page.width, this.page.height)
    this.surface.clear(this.page.background)
    this.requestRender()
  }

  /**
   * odnowa — remove every turtle but ż1, reset ż1 to its default state (own procedures kept),
   * restore white background and `sklej`, clear the page, make ż1 the only active turtle.
   * Non-turtle objects (buttons, sliders…) are kept.
   */
  reset() {
    let first = this.getObject('ż1')
    for (const t of [...this.turtles]) if (t !== first) this.unregisterObject(t)
    if (!(first instanceof Turtle)) first = this.createTurtle('ż1')
    first.page = this.page
    first.resetState()
    this.page.background = WHITE
    this.page.wrapMode = 'sklej'
    this.surface.setBackground?.(WHITE)
    this.surface.clear(WHITE)
    this.activeTurtles = [first]
    this.clearAbort()
    this.requestRender()
    return first
  }

  // ---------- scheduling ----------
  /** Request an abort: the next yield()/frame() throws AbortSignal. */
  abort() { this._abort = true }
  clearAbort() { this._abort = false }
  get aborting() { return this._abort }

  checkAbort() {
    if (this._abort) throw new AbortSignal()
    if (this.abortCheck) this.abortCheck()
  }

  /**
   * Cooperative yield. Cheap: only every `yieldInterval` ms of wall time does it actually go to
   * the macrotask queue (setImmediate in Node, MessageChannel in browsers). Always checks abort.
   */
  async yield() {
    this.checkAbort()
    const t = now()
    if (t - this._lastYield < this.yieldInterval) return
    await new Promise((r) => macrotask(r))
    this._lastYield = now()
    this.checkAbort()
  }

  /** Wait one animation frame (speed > 0). */
  async frame() {
    this.checkAbort()
    if (this.frameDelay > 0) await new Promise((r) => setTimeout(r, this.frameDelay))
    else await new Promise((r) => macrotask(r))
    this._lastYield = now()
    this.checkAbort()
  }

  /** Pixels moved per frame at the current speed (Infinity at speed 0). */
  stepPixels() {
    const s = Math.max(0, Math.min(10, Math.round(this.speed)))
    return SPEED_STEP_PX[s]
  }
  /** Degrees turned per frame at the current speed. */
  stepDegrees() { return this.stepPixels() * 3 }

  // ---------- rendering ----------
  /** Subscribe to render notifications (throttled to one per animation frame). Returns unsubscribe. */
  onRender(cb) {
    this._renderCbs.add(cb)
    return () => this._renderCbs.delete(cb)
  }

  requestRender() {
    if (this._renderScheduled) return
    this._renderScheduled = true
    const run = () => { this._renderScheduled = false; this.renderNow() }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
    else unrefTimer(setTimeout(run, 16))
  }

  /** Draw turtles on the overlay and notify subscribers immediately. */
  renderNow() {
    const visible = this.turtlesOf().filter((t) => t.visible).sort((a, b) => a.zOrder - b.zOrder)
    this.surface.drawTurtles?.(visible)
    for (const cb of this._renderCbs) {
      try { cb(this) } catch (e) { /* UI errors must not break the program */ console.error(e) }
    }
  }

  // ---------- events / input ----------
  /** Forward an event to the handler installed by prims (world.eventHandler). */
  /**
   * Called by createLogomocja once the interpreter exists. Modules that need the pair (events,
   * processes: prims/objects.js) register a callback in `World.attachHooks`.
   */
  attachInterpreter(interp) {
    this.interp = interp
    for (const hook of World.attachHooks) hook(this, interp)
  }

  dispatchEvent(name, data = {}) {
    if (typeof this.eventHandler === 'function') return this.eventHandler(name, data)
    return undefined
  }

  /** Topmost visible turtle whose shape covers logo point (x,y), or undefined. */
  turtleAt(x, y) {
    const list = this.turtlesOf().filter((t) => t.visible).sort((a, b) => b.zOrder - a.zOrder)
    return list.find((t) => Math.hypot(t.x - x, t.y - y) <= shapeRadius(t.currentShape, t.shapeScale))
  }

  /**
   * Pointer input from the UI, in logo coordinates.
   * type: 'down'|'up'|'move'|'click'|'dblclick'; button: 0 left, 2 right.
   * Dispatches gdyLewyWciśnięty/gdyPrawyWciśnięty/gdyLewyPuszczony/gdyPrawyPuszczony/gdyRuchMyszy/
   * gdyKlik/gdyDwuklik with data {target, x, y, button}; target = turtle under pointer or the page.
   */
  pointer(type, x, y, button = 0) {
    this.mouse.x = x; this.mouse.y = y
    if (type === 'down') this.mouse.buttons |= 1 << button
    if (type === 'up') this.mouse.buttons &= ~(1 << button)
    const name = {
      down: button === 2 ? 'gdyPrawyWciśnięty' : 'gdyLewyWciśnięty',
      up: button === 2 ? 'gdyPrawyPuszczony' : 'gdyLewyPuszczony',
      move: 'gdyRuchMyszy',
      click: 'gdyKlik',
      dblclick: 'gdyDwuklik',
    }[type]
    if (!name) return undefined
    const target = this.turtleAt(x, y) || this.page
    return this.dispatchEvent(name, { target, x, y, button })
  }

  /** Pixel position on the page (CSS px from top-left) → logo coordinates. */
  pixelToLogo(px, py) { return pixelToLogo(px, py, this.page.width, this.page.height) }

  /** Keyboard input: buffers the key and dispatches gdyKlawisz with {target: null, key}. */
  key(key) {
    this.keys.buffer.push(key)
    if (this.keys.buffer.length > 256) this.keys.buffer.shift()
    this.keys.last = key
    return this.dispatchEvent('gdyKlawisz', { target: null, key })
  }
}

/** Callbacks `(world, interp) => void` run by World#attachInterpreter. */
World.attachHooks = []
