// Turtle state + drawing. Owner: graphics. See docs/ARCHITEKTURA.md, PRIMITYWY.md §2, §17.4.
//
// All coordinates are Logo coordinates (origin page centre, +y up); headings are degrees,
// 0 = north, clockwise. Numeric inputs only — `jld`/lists are resolved by prims before calling.
// Methods that move/turn are async (they animate when world.speed > 0 and always end with
// `await world.yield()`); setters are sync.
import { LogoObject, normName, fromBool, toBool, toNumber } from '../core/values.js'
import { LogoError } from '../core/errors.js'
import { resolveColor, colorToLogo, BLACK } from './colors.js'
import { getShape, defaultShape } from './shapes.js'

const EPS = 1e-9
const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI

/** Round away float noise (6e-15 → 0) and normalise -0. */
export function snap(v) {
  const r = Math.round(v * 1e9) / 1e9
  return r === 0 ? 0 : r
}
/** Heading normalised to [0, 360). */
export function normHeading(h) {
  const r = snap(((h % 360) + 360) % 360)
  return r >= 360 ? 0 : r
}

// Pen state words (§2.3). Canonical internal values are the Polish words.
const PEN_WORDS = new Map([
  ['opu', 'opu'], ['opuść', 'opu'], ['pd', 'opu'], ['pendown', 'opu'],
  ['pod', 'pod'], ['podnieś', 'pod'], ['pu', 'pod'], ['penup', 'pod'],
  ['ścier', 'ścier'], ['ścieraj', 'ścier'], ['pe', 'ścier'], ['penerase', 'ścier'],
  ['odwr', 'odwr'], ['odwracaj', 'odwr'], ['px', 'odwr'], ['penreverse', 'odwr'],
])
export function parsePenWord(w) { return PEN_WORDS.get(normName(w)) }

// Range-style words (§2.7).
const STYLE_WORDS = new Map([
  ['sklej', 'sklej'], ['wrap', 'sklej'], ['okno', 'okno'], ['window', 'okno'],
  ['płot', 'płot'], ['fence', 'płot'], ['odbij', 'odbij'], ['bounce', 'odbij'],
])
export function parseRangeStyle(w) { return STYLE_WORDS.get(normName(w)) }

export const DEFAULT_FONT = Object.freeze({ name: 'System', size: 0, weight: 400, italic: 0, underline: 0, strike: 0, charset: 1 })

export class Turtle extends LogoObject {
  constructor({ world, name, page, parent = null } = {}) {
    super({ name, className: 'Żółw', parent })
    this.world = world
    this.page = page || world?.page || null
    this.resetState()
  }

  /** Default state per PRIMITYWY.md §17.4. Keeps own procedures/vars/events. */
  resetState() {
    this.homeState = { x: 0, y: 0, heading: 0 }
    this.x = 0
    this.y = 0
    this.heading = 0
    this.pen = 'opu'             // 'opu' | 'pod' | 'ścier' | 'odwr'
    this.penColor = BLACK
    this.penWidth = 1
    this.penPattern = 0
    this.fillColor = BLACK
    this.fillPattern = 0
    this.visible = true
    this.shape = null            // null = default green turtle (shapes.TURTLE_SHAPE)
    this.shapeScale = 1          // number or [sx, sy]
    this.shapeColor = null       // recolour, null = original
    this.frame = 0
    this.animation = true
    this.range = null            // null = whole page, else [x1 y1 x2 y2]
    this.ownRangeStyle = null    // null = inherit page.wrapMode
    this.font = { ...DEFAULT_FONT }
    this.zOrder = 0
  }

  // ---------- simple state ----------
  get penDown() { return this.pen !== 'pod' }
  set penDown(v) { this.pen = v ? 'opu' : 'pod' }
  get pos() { return [this.x, this.y] }

  get rangeStyle() { return this.ownRangeStyle || this.page?.wrapMode || this.world?.page?.wrapMode || 'sklej' }
  set rangeStyle(s) {
    const st = parseRangeStyle(s)
    if (!st) throw new LogoError(`ustalStylZakresu nie lubi ${s} jako danej`)
    this.ownRangeStyle = st
  }

  /** Movement rectangle [xmin, ymin, xmax, ymax]. */
  bounds() {
    if (this.range && this.range.length === 4) {
      const [a, b, c, d] = this.range.map(Number)
      return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]
    }
    const pg = this.page || this.world?.page || { width: 796, height: 499 }
    return [-pg.width / 2, -pg.height / 2, pg.width / 2, pg.height / 2]
  }

  get surface() { return this.world?.surface }
  /**
   * Run fn() with drawing clipped to the turtle range (§2.5 shapes, §2.7 `okno`). Without an own
   * range the page edge clips. Returns fn()'s result.
   */
  clipped(fn) {
    const s = this.surface
    if (!this.range || !s || typeof s.withClip !== 'function') return fn()
    return s.withClip(this.bounds(), fn)
  }
  get background() { return this.page?.background || this.world?.page?.background }
  _changed() { this.world?.requestRender() }

  penUp() { this.pen = 'pod'; this._changed() }
  penDownCmd() { this.pen = 'opu'; this._changed() }
  penErase() { this.pen = 'ścier' }
  penReverse() { this.pen = 'odwr' }
  setPen(word) {
    const p = parsePenWord(word)
    if (!p) throw new LogoError(`ustalPisak nie lubi ${word} jako danej`)
    this.pen = p
  }
  /** §17.11: pen colour also sets the fill colour. */
  setPenColor(c) { this.penColor = resolveColor(c, 'ustalKolPis'); this.fillColor = this.penColor; this._changed() }
  setFillColor(c) { this.fillColor = resolveColor(c, 'ustalKolMal') }
  /** Width < 1 becomes 1; no upper limit. */
  setPenWidth(w) { const n = toNumber(w, 'ustalGrubość'); this.penWidth = n < 1 ? 1 : n }
  setPenPattern(p) { this.penPattern = Math.max(0, Math.min(6, Math.round(toNumber(p, 'ustalWzórPis')))) }
  setFillPattern(p) { this.fillPattern = Math.max(0, Math.min(7, Math.round(toNumber(p, 'ustalWzórMal')))) }
  show() { this.visible = true; this._changed() }
  hide() { this.visible = false; this._changed() }
  setVisible(b) { this.visible = !!b; this._changed() }
  setHomeState(x, y, heading) { this.homeState = { x: snap(x), y: snap(y), heading: normHeading(heading) } }
  setRange(r) { this.range = r && r.length === 4 ? r.map((v) => toNumber(v, 'ustalZakres')) : null }

  /**
   * Set the shape. Accepts: null/[]/'' (default turtle), a built-in shape name, or a Shape object
   * (shapes.js createVectorShape/createImageShape/shapeFromOps…).
   */
  setShape(s) {
    if (s === null || s === undefined || s === '' || (Array.isArray(s) && s.length === 0)) this.shape = null
    else if (typeof s === 'string') {
      const sh = getShape(s)
      if (!sh) throw new LogoError(`ustalPostać nie lubi ${s} jako danej`)
      this.shape = sh === defaultShape() ? null : sh
    } else if (typeof s === 'object' && s.frames) this.shape = s
    else throw new LogoError('ustalPostać nie lubi tej danej')
    this.frame = 0
    this._changed()
  }
  get currentShape() { return this.shape || defaultShape() }

  // ---------- geometry queries ----------
  /** Heading from the turtle to (x,y), in [0,360). */
  towards(x, y) {
    const dx = x - this.x, dy = y - this.y
    if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) return this.heading
    return normHeading(deg(Math.atan2(dx, dy)))
  }
  distance(x, y) { return snap(Math.hypot(x - this.x, y - this.y)) }

  /** Colour of the drawing layer under the turtle ({r,g,b,css}); colorToLogo for the Logo value. */
  colorUnder() { return this.surface.getPixel(this.x, this.y) }

  // ---------- movement ----------
  lineStyle() {
    return {
      color: this.penColor,
      width: this.penWidth,
      mode: this.pen === 'ścier' ? 'erase' : this.pen === 'odwr' ? 'reverse' : 'paint',
      background: this.background,
      pattern: this.penPattern,
    }
  }

  /**
   * Plan a move by (dx,dy) under the current range style.
   * @returns {{segments: number[][], x:number, y:number, heading:number}} segments [x1,y1,x2,y2]
   *          (segments of length 0 are kept so `np 0` draws a point).
   */
  planMove(dx, dy, { bounceHeading = true } = {}) {
    const style = this.rangeStyle
    let x = this.x, y = this.y, heading = this.heading
    const segs = []
    if (style === 'okno' || (Math.abs(dx) < EPS && Math.abs(dy) < EPS)) {
      segs.push([x, y, x + dx, y + dy])
      return { segments: segs, x: x + dx, y: y + dy, heading }
    }
    const [xmin, ymin, xmax, ymax] = this.bounds()
    let rx = dx, ry = dy
    for (let iter = 0; iter < 100000; iter++) {
      const tx = x + rx, ty = y + ry
      if (tx >= xmin - EPS && tx <= xmax + EPS && ty >= ymin - EPS && ty <= ymax + EPS) {
        segs.push([x, y, tx, ty]); x = tx; y = ty
        break
      }
      const tX = rx > 0 ? (xmax - x) / rx : rx < 0 ? (xmin - x) / rx : Infinity
      const tY = ry > 0 ? (ymax - y) / ry : ry < 0 ? (ymin - y) / ry : Infinity
      const t = Math.max(0, Math.min(tX, tY))
      const ex = x + rx * t, ey = y + ry * t
      if (t > EPS || !segs.length) segs.push([x, y, ex, ey])
      const hitX = tX <= t + EPS, hitY = tY <= t + EPS
      if (style === 'płot') {
        x = ex; y = ey
        return { segments: segs, x, y, heading: normHeading(heading), fenceHit: true }
      }
      rx *= 1 - t; ry *= 1 - t
      if (style === 'odbij') {
        x = ex; y = ey
        if (hitX) { rx = -rx; if (bounceHeading) heading = -heading }
        if (hitY) { ry = -ry; if (bounceHeading) heading = 180 - heading }
      } else { // sklej
        x = hitX ? (rx > 0 ? xmin : xmax) : ex
        y = hitY ? (ry > 0 ? ymin : ymax) : ey
      }
      if (Math.hypot(rx, ry) < EPS) break
    }
    return { segments: segs, x, y, heading: normHeading(heading) }
  }

  /** Move by a vector, drawing per pen state and animating per world.speed. */
  async moveBy(dx, dy, opts) {
    const plan = this.planMove(dx, dy, opts)
    const draw = this.pen !== 'pod'
    const style = draw ? this.lineStyle() : null
    const world = this.world
    const animate = world && world.speed > 0
    if (!animate) {
      if (draw) this.clipped(() => { for (const s of plan.segments) this.surface.line(s[0], s[1], s[2], s[3], style) })
    } else {
      const step = world.stepPixels()
      let travelled = 0
      for (const [x1, y1, x2, y2] of plan.segments) {
        const len = Math.hypot(x2 - x1, y2 - y1)
        const n = Math.max(1, Math.ceil(len / step))
        const chunked = draw && style.mode !== 'reverse'
        let px = x1, py = y1
        for (let i = 1; i <= n; i++) {
          const nx = x1 + ((x2 - x1) * i) / n, ny = y1 + ((y2 - y1) * i) / n
          if (chunked) this.clipped(() => this.surface.line(px, py, nx, ny, { ...style, dashOffset: travelled }))
          travelled += Math.hypot(nx - px, ny - py)
          px = nx; py = ny
          this.x = px; this.y = py
          world.requestRender()
          if (i < n || len > 0) await world.frame()
        }
        if (draw && !chunked) this.clipped(() => this.surface.line(x1, y1, x2, y2, style))
      }
    }
    this.x = snap(plan.x); this.y = snap(plan.y); this.heading = plan.heading
    this._changed()
    if (plan.fenceHit && world?.fenceError) throw new LogoError(`${this.name}: żółw poza zakresem`)
    if (world) await world.yield()
  }

  async forward(d) {
    const n = toNumber(d, 'naprzód')
    const a = rad(this.heading)
    await this.moveBy(n * Math.sin(a), n * Math.cos(a))
  }
  async back(d) { await this.forward(-toNumber(d, 'wstecz')) }

  async right(a) {
    const n = toNumber(a, 'prawo')
    const world = this.world
    if (world && world.speed > 0 && this.visible && Math.abs(n) > 0) {
      const step = world.stepDegrees()
      const k = Math.max(1, Math.ceil(Math.abs(n) / step))
      const start = this.heading
      for (let i = 1; i < k; i++) {
        this.heading = normHeading(start + (n * i) / k)
        world.requestRender()
        await world.frame()
      }
      this.heading = normHeading(start + n)
    } else this.heading = normHeading(this.heading + n)
    this._changed()
    if (world) await world.yield()
  }
  async left(a) { await this.right(-toNumber(a, 'lewo')) }

  setHeading(h) { this.heading = normHeading(toNumber(h, 'ustalKierunek')); this._changed() }

  /** Move to (x,y) drawing a line (pen permitting). Heading unchanged. */
  async setPos(x, y) {
    await this.moveBy(toNumber(x, 'ustalPoz') - this.x, toNumber(y, 'ustalPoz') - this.y, { bounceHeading: false })
  }
  async setX(x) { await this.setPos(x, this.y) }
  async setY(y) { await this.setPos(this.x, y) }
  async setXY(x, y) { await this.setPos(x, y) }

  /** Back to homeState without drawing; screen not cleared. */
  home() {
    this.x = this.homeState.x; this.y = this.homeState.y; this.heading = this.homeState.heading
    this._changed()
  }
  /** Jump without drawing (used by setAPos, objects' `poz` setting, etc.). */
  jumpTo(x, y) { this.x = snap(x); this.y = snap(y); this._changed() }

  // ---------- painting / shapes (centred on turtle, rotated by heading) ----------
  /** Flood fill at the turtle position with fill colour, limited to the turtle range. */
  fill() {
    const n = this.surface.fill(this.x, this.y, this.fillColor, { bounds: this.range ? this.bounds() : undefined })
    this._changed()
    return n
  }

  _shapeStyle() {
    const ls = this.lineStyle()
    return { ...ls, rotation: this.heading }
  }

  /** okrąg — circle outline of given DIAMETER in pen colour (§17.10). Respects pen-up. */
  circle(diameter) {
    if (this.pen === 'pod') return
    const r = Math.abs(toNumber(diameter, 'okrąg')) / 2
    this.clipped(() => this.surface.ellipse(this.x, this.y, r, r, this._shapeStyle()))
    this._changed()
  }
  /** koło — disc of given DIAMETER filled with fill colour, outline in pen colour. Respects pen-up. */
  filledCircle(diameter) {
    if (this.pen === 'pod') return
    const r = Math.abs(toNumber(diameter, 'koło')) / 2
    const st = this._shapeStyle()
    this.clipped(() => this.surface.ellipse(this.x, this.y, r, r, {
      ...st,
      fillColor: this.pen === 'ścier' ? this.background : this.fillColor,
      color: this.pen === 'ścier' ? this.background : this.penColor,
    }))
    this._changed()
  }
  /** kropka — full disc of DIAMETER d in pen colour. */
  point(diameter) {
    if (this.pen === 'pod') return
    const r = Math.abs(toNumber(diameter, 'kropka')) / 2
    const c = this.pen === 'ścier' ? this.background : this.penColor
    this.clipped(() => this.surface.ellipse(this.x, this.y, r, r, { rotation: this.heading, fillColor: c, color: c, width: 1 }))
    this._changed()
  }
  /** pkt — point at the turtle in pen colour/width, even with the pen up. */
  dot() {
    const st = this.lineStyle()
    if (st.mode === 'reverse') st.mode = 'paint'
    this.clipped(() => this.surface.line(this.x, this.y, this.x, this.y, st))
    this._changed()
  }
  /**
   * elipsa / elipsaZamalowana. a = half-axis across the heading, b = along the heading;
   * start/end = arc angles relative to the heading (degrees, clockwise).
   */
  ellipse(a, b, { start = 0, end = 360, filled = false } = {}) {
    if (this.pen === 'pod') return // like okrąg/koło: nothing with the pen up (API_NOTES)
    const st = this._shapeStyle()
    this.clipped(() => this.surface.ellipse(this.x, this.y, Math.abs(a), Math.abs(b), {
      ...st, start, end,
      fillColor: filled ? (this.pen === 'ścier' ? this.background : this.fillColor) : undefined,
      color: st.color,
    }))
    this._changed()
  }
  /** Arc of radius r and `angle` degrees, centred on the turtle, starting at its heading, clockwise. */
  arc(angle, radius) {
    if (this.pen === 'pod') return
    this.clipped(() => this.surface.arc(this.x, this.y, Math.abs(radius), this.heading, this.heading + angle, this.lineStyle()))
    this._changed()
  }
  /** Filled polygon (logo points), fill colour; outline only if `outline`. */
  polygon(points, { outline = false } = {}) {
    this.clipped(() => this.surface.polygon(points, {
      fillColor: this.fillColor,
      ...(outline ? { color: this.penColor, width: this.penWidth } : {}),
    }))
    this._changed()
  }

  // ---------- text ----------
  textStyle() {
    const f = this.font
    return {
      font: f.name === 'System' ? 'sans-serif' : f.name,
      size: f.size > 0 ? f.size : 13,
      bold: f.weight >= 600,
      italic: !!f.italic,
      underline: !!f.underline,
      strike: !!f.strike,
      color: this.pen === 'ścier' ? this.background : this.penColor,
      heading: this.heading,
    }
  }
  /** napisz — text at the turtle, baseline perpendicular to heading. Drawn regardless of pen-up. */
  label(text) {
    this.clipped(() => this.surface.text(this.x, this.y, String(text), this.textStyle()))
    this._changed()
  }
  /** napisz2 — like label, then the turtle jumps to the end of the text (no drawing). */
  label2(text) {
    this.label(text)
    const { width } = this.textSize(text)
    const a = rad(this.heading + 90)
    this.jumpTo(this.x + width * Math.sin(a), this.y + width * Math.cos(a))
  }
  /** [szer wys] of text in the current font. */
  textSize(text) { return this.surface.measureText(String(text), this.textStyle()) }

  // ---------- stamping ----------
  stamp() {
    this.clipped(() => this.surface.stamp(this.currentShape, this.x, this.y, {
      heading: this.heading, scale: this.shapeScale, frame: this.frame, color: this.shapeColor || undefined,
    }))
    this._changed()
  }

  // ---------- settings (Imagine object settings, §12) ----------
  /**
   * Read a setting by Polish or English name. Returns the Logo value, or undefined if `name`
   * is not a turtle setting.
   */
  getSetting(name) {
    switch (normName(name)) {
      case 'poz': case 'pos': return [this.x, this.y]
      case 'pozx': case 'xcor': return this.x
      case 'pozy': case 'ycor': return this.y
      case 'kierunek': case 'heading': return this.heading
      case 'pisak': case 'pen': return this.pen
      case 'kolpis': case 'pc': case 'pencolour': case 'pencolor': return colorToLogo(this.penColor)
      case 'kolmal': case 'fc': case 'fillcolour': case 'fillcolor': return colorToLogo(this.fillColor)
      case 'grubość': case 'penwidth': case 'pw': return this.penWidth
      case 'wzórpis': case 'penpattern': case 'pp': return this.penPattern
      case 'wzórmal': case 'fillpattern': case 'fp': return this.fillPattern
      case 'widoczny': case 'widoczny?': case 'shown': case 'shown?': return fromBool(this.visible)
      case 'postać': case 'shape': return this.shape ? this.shape.name : []
      case 'nazwa': case 'name': return this.name
      case 'stylzakresu': case 'rangestyle': return this.rangeStyle
      case 'zakres': case 'range': return this.range ? [...this.range] : []
      case 'stanpoczątkowy': case 'homestate': return [[this.homeState.x, this.homeState.y], this.homeState.heading]
      case 'skalapostaci': case 'shapescale': return Array.isArray(this.shapeScale) ? [...this.shapeScale] : this.shapeScale
      case 'klatka': case 'frame': return this.frame
      default: return undefined
    }
  }

  /**
   * Set a setting by Polish/English name (as used in `nowy "Żółw [...]` lists and `ustaw`).
   * Returns true if `name` is a turtle setting. Position settings jump without drawing.
   * In settings lists `pw` means pen width (§12).
   */
  setSetting(name, v) {
    const num = (who) => toNumber(v, who)
    switch (normName(name)) {
      case 'poz': case 'pos': if (!Array.isArray(v) || v.length !== 2) throw new LogoError(`poz nie lubi ${v} jako danej`)
        this.jumpTo(toNumber(v[0], 'poz'), toNumber(v[1], 'poz')); return true
      case 'pozx': case 'xcor': this.jumpTo(num('pozx'), this.y); return true
      case 'pozy': case 'ycor': this.jumpTo(this.x, num('pozy')); return true
      case 'kierunek': case 'heading': this.setHeading(v); return true
      case 'pisak': case 'pen': this.setPen(v); return true
      case 'kolpis': case 'pc': case 'pencolour': case 'pencolor': this.setPenColor(v); return true
      case 'kolmal': case 'fc': case 'fillcolour': case 'fillcolor': this.setFillColor(v); return true
      case 'grubość': case 'penwidth': case 'pw': this.setPenWidth(v); return true
      case 'wzórpis': case 'penpattern': case 'pp': this.setPenPattern(v); return true
      case 'wzórmal': case 'fillpattern': case 'fp': this.setFillPattern(v); return true
      case 'widoczny': case 'widoczny?': case 'shown': case 'shown?': this.setVisible(toBool(v, 'widoczny')); return true
      case 'postać': case 'shape': this.setShape(v); return true
      case 'stylzakresu': case 'rangestyle': this.rangeStyle = v; return true
      case 'zakres': case 'range': this.setRange(Array.isArray(v) ? v : null); return true
      case 'stanpoczątkowy': case 'homestate': {
        const [[hx, hy], hh] = v
        this.setHomeState(toNumber(hx), toNumber(hy), toNumber(hh)); return true
      }
      case 'skalapostaci': case 'shapescale':
        this.shapeScale = Array.isArray(v) ? v.map((q) => toNumber(q)) : num('skalaPostaci'); this._changed(); return true
      case 'klatka': case 'frame': this.frame = Math.round(num('klatka')); this._changed(); return true
      default: return false
    }
  }
}

