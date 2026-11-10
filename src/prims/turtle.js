// Primitives module: turtle & graphics (PRIMITYWY.md §2), colours (§3), page / main window (§4).
// Owner: prims-turtle. See docs/ARCHITEKTURA.md and docs/API_NOTES.md.
//
// Conventions:
//   - commands act on every turtle of `ctx.who ?? ctx.process?.who ?? world.activeTurtles`
//     (in parallel, awaited with Promise.all); reporters use the first one.
//   - numeric inputs are converted with toNumber(v) WITHOUT `who`, so the interpreter rewrites the
//     error with the name the user actually typed (`ws nie lubi a jako danej`).
//   - `jld`/`any` is accepted where §1.6 gives a range.
//   - a turtle executing a drawing list in a temporary world records its vertices in `_trace`
//     (see traceList) — every moving primitive of this module pushes there.
import { normName, toNumber, toBool, fromBool, badInput, formatValue, LogoObject } from '../core/values.js'
import { random as sharedRandom } from '../core/values.js'
import { LogoError } from '../core/errors.js'
import { Turtle, snap, normHeading, parsePenWord, parseRangeStyle, DEFAULT_FONT } from '../graphics/turtle.js'
import { World, Page } from '../graphics/world.js'
import { HeadlessSurface } from '../graphics/surface.js'
import { resolveColor, colorToLogo, IMAGINE_COLOR_NAMES, BLACK, WHITE } from '../graphics/colors.js'
import {
  getShape, defaultShape, shapeFromOps, shapeFromCompact, compactToPoints, createImageShape,
  createAnimatedShape, shapeRadius,
} from '../graphics/shapes.js'

// ------------------------------------------------------------------ small helpers

const isAny = (v) => typeof v === 'string' && (normName(v) === 'jld' || normName(v) === 'any')
const rndInt = (a, b) => a + Math.floor(sharedRandom() * (b - a + 1))
const rad = (d) => (d * Math.PI) / 180
const isTurtleObj = (o) => o instanceof Turtle
const isEmptyList = (v) => Array.isArray(v) && v.length === 0

/** §1.6 ranges for `jld`. */
const JLD = {
  move: [1, 100],
  turn: [1, 90],
  width: [1, 20],
  heading: [0, 359],
}

/** Number input (jld → random in `range`, if given). Errors are rewritten by the interpreter. */
function num(v, range) {
  if (isAny(v)) {
    if (range) return rndInt(range[0], range[1])
    throw badInput(undefined, v)
  }
  if (Array.isArray(v)) throw badInput(undefined, v)
  return toNumber(v)
}

/** Colour input in any §3.1 form; error → `<typed name> nie lubi X jako danej`. */
function color(v) {
  try {
    return resolveColor(v)
  } catch (e) {
    throw badInput(undefined, v)
  }
}

function bool(v) { return toBool(v) }

function pageOf(ctx) {
  const s = ctx._self
  if (s instanceof Page) return s
  return ctx.world.page
}

/** Random point of the page (for `jld` positions). */
function randomPoint(world) {
  const p = world.page
  return [rndInt(-Math.floor(p.width / 2), Math.floor(p.width / 2)), rndInt(-Math.floor(p.height / 2), Math.floor(p.height / 2))]
}

function findObj(ctx, name) {
  if (name instanceof LogoObject) return name
  if (typeof name !== 'string' && typeof name !== 'number') return null
  return ctx.interp?.findObject?.(name, ctx) ?? ctx.world.getObject(name) ?? null
}

/** A turtle given by name/object, or an error. */
function turtleArg(ctx, v) {
  const o = findObj(ctx, v)
  if (!isTurtleObj(o)) throw badInput(undefined, v)
  return o
}

/** Active turtles of the context (array of Turtle). */
export function activeTurtles(ctx) {
  let list = ctx.who ?? ctx.process?.who ?? ctx.world?.activeTurtles ?? []
  if (!Array.isArray(list)) list = [list]
  const out = []
  for (const x of list) {
    const o = typeof x === 'string' ? findObj(ctx, x) : x
    if (isTurtleObj(o)) out.push(o)
  }
  return out
}

/** First active turtle (reporters). */
export function firstTurtle(ctx) {
  const t = activeTurtles(ctx)[0] ?? (isTurtleObj(ctx.turtle) ? ctx.turtle : null)
  if (!t) throw new LogoError('Nie ma aktywnego żółwia')
  return t
}

/** Run `fn(turtle)` for every active turtle in parallel. */
async function each(ctx, fn) {
  const ts = activeTurtles(ctx)
  if (ts.length === 1) { await fn(ts[0]); return }
  await Promise.all(ts.map((t) => fn(t)))
}

function traced(t) { if (t._trace) t._trace.push([t.x, t.y]) }

/** `[x y]`, a turtle name, or `jld` → [x, y]. */
function pointArg(ctx, v, { allowTurtle = false } = {}) {
  if (isAny(v)) return randomPoint(ctx.world)
  if (Array.isArray(v) && v.length === 2 && !Array.isArray(v[0])) {
    const rp = isAny(v[0]) || isAny(v[1]) ? randomPoint(ctx.world) : null
    return [isAny(v[0]) ? rp[0] : num(v[0]), isAny(v[1]) ? rp[1] : num(v[1])]
  }
  if (allowTurtle && !Array.isArray(v)) {
    const o = findObj(ctx, v)
    if (isTurtleObj(o)) return [o.x, o.y]
  }
  throw badInput(undefined, v)
}

/** Rectangle `[x1 y1 x2 y2]` or `[[x1 y1] [x2 y2]]` → [xmin, ymin, xmax, ymax]. */
function rectArg(v) {
  let a
  if (Array.isArray(v) && v.length === 4 && !v.some(Array.isArray)) a = v.map((q) => num(q))
  else if (Array.isArray(v) && v.length === 2 && Array.isArray(v[0]) && Array.isArray(v[1]) && v[0].length === 2 && v[1].length === 2) {
    a = [num(v[0][0]), num(v[0][1]), num(v[1][0]), num(v[1][1])]
  } else throw badInput(undefined, v)
  return [Math.min(a[0], a[2]), Math.min(a[1], a[3]), Math.max(a[0], a[2]), Math.max(a[1], a[3])]
}

/** List of points `[[x y] ...]`. */
function pointsArg(v) {
  if (!Array.isArray(v) || !v.every((p) => Array.isArray(p) && p.length === 2)) throw badInput(undefined, v)
  return v.map(([x, y]) => [num(x), num(y)])
}

/** Local point (turtle at origin facing north) → page coordinates for turtle state {x,y,heading}. */
function toWorld(st, [lx, ly]) {
  const a = rad(st.heading)
  return [snap(st.x + lx * Math.cos(a) + ly * Math.sin(a)), snap(st.y - lx * Math.sin(a) + ly * Math.cos(a))]
}

const roundPt = ([x, y]) => [snap(x), snap(y)]

// ------------------------------------------------------------------ drawing lists (§2.5)

/** Is `list` a list of drawing lists (animation frames)? */
function isListOfLists(v) { return Array.isArray(v) && v.length > 0 && v.every(Array.isArray) && compactToPoints(v) === null }

/**
 * Execute a drawing list with a temporary turtle in a temporary world (pixels off), starting at
 * [0 0] facing north with the pen settings of `src`.
 * @returns {{points: number[][], ops: object[]|null, compact: boolean, tmp: Turtle|null}}
 */
export async function traceList(list, ctx, src, { penDown = false } = {}) {
  if (Array.isArray(list)) {
    const pts = compactToPoints(list)
    if (pts) return { points: pts, ops: null, compact: true, tmp: null }
  }
  const surface = new HeadlessSurface({ pixels: false, width: src?.page?.width ?? 796, height: src?.page?.height ?? 499 })
  const w = new World({ surface })
  const tt = w.turtles[0]
  if (src) {
    tt.pen = src.pen; tt.penColor = src.penColor; tt.fillColor = src.fillColor
    tt.penWidth = src.penWidth; tt.penPattern = src.penPattern; tt.fillPattern = src.fillPattern
    tt.font = { ...src.font }
  }
  if (penDown) tt.pen = 'opu'
  tt.ownRangeStyle = 'okno'
  tt._trace = [[0, 0]]
  surface.ops.length = 0
  const c = ctx.interp.objectCtx(ctx, tt)
  await ctx.interp.runList(list, c)
  return { points: tt._trace.map(roundPt), ops: surface.ops, compact: false, tmp: tt }
}

/** Replay recorded surface ops onto `surface`, transformed by turtle state st {x,y,heading}. */
function replayOps(ops, surface, st, background, bounds) {
  const T = (x, y) => toWorld(st, [x, y])
  for (const o of ops) {
    switch (o.op) {
      case 'line': {
        const [a, b] = T(o.x1, o.y1), [c, d] = T(o.x2, o.y2)
        const { op, x1, y1, x2, y2, ...style } = o
        surface.line(a, b, c, d, { ...style, background })
        break
      }
      case 'polygon': {
        const { op, points, ...style } = o
        surface.polygon(points.map(([x, y]) => T(x, y)), style)
        break
      }
      case 'ellipse': {
        const { op, x, y, rx, ry, ...style } = o
        const [a, b] = T(x, y)
        surface.ellipse(a, b, rx, ry, { ...style, rotation: (style.rotation || 0) + st.heading, background })
        break
      }
      case 'fill': {
        const [a, b] = T(o.x, o.y)
        surface.fill(a, b, o.color, { bounds }) // flood fill is not covered by withClip
        break
      }
      case 'text': {
        const { op, x, y, str, ...style } = o
        const [a, b] = T(x, y)
        surface.text(a, b, str, { ...style, heading: (style.heading || 0) + st.heading })
        break
      }
      case 'stamp': {
        const { op, shape, x, y, ...style } = o
        const [a, b] = T(x, y)
        surface.stamp(shape, a, b, { ...style, heading: (style.heading || 0) + st.heading })
        break
      }
      case 'image': {
        const { op, img, x, y, ...style } = o
        const [a, b] = T(x, y)
        surface.image(img, a, b, style)
        break
      }
      default: break // clear / setBackground / resize are ignored
    }
  }
}

/** Draw a drawing list at turtle state `st` (no movement). */
async function drawList(ctx, t, list, st = t) {
  const r = await traceList(list, ctx, t)
  const surface = t.surface
  if (r.compact) {
    if (t.pen === 'pod') return
    const pts = r.points.map((p) => toWorld(st, p))
    const style = t.lineStyle()
    t.clipped(() => { for (let i = 0; i + 1 < pts.length; i++) surface.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], style) })
  } else t.clipped(() => replayOps(r.ops, surface, st, t.background, t.range ? t.bounds() : undefined))
  t._changed()
}

// ------------------------------------------------------------------ images

/** An image value (weźObraz, zrzutTła). Prints as `obraz[szer×wys]`. */
export class LogoImage {
  constructor({ width, height, source, data = null, name = '' }) {
    this.width = width; this.height = height; this.source = source; this.data = data; this.name = name
  }
  toString() { return this.name || `obraz[${this.width}×${this.height}]` }
}

function hasDom() { return typeof globalThis.document !== 'undefined' && typeof globalThis.document.createElement === 'function' }

/** Cut an image out of the drawing layer, logo rectangle [xmin ymin xmax ymax]. */
function grabImage(surface, [x1, y1, x2, y2]) {
  const w = Math.max(1, Math.round(x2 - x1)), h = Math.max(1, Math.round(y2 - y1))
  if (surface.canvas && hasDom()) {
    const [px, py] = surface.toPixel(x1, y2)
    const d = surface.dpr || 1
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    c.getContext('2d').drawImage(surface.canvas, Math.floor(px) * d, Math.floor(py) * d, w * d, h * d, 0, 0, w, h)
    return new LogoImage({ width: w, height: h, source: c })
  }
  const data = new Uint8ClampedArray(w * h * 4)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const c = surface.getPixel(x1 + i, y2 - j)
      const k = (j * w + i) * 4
      data[k] = c.r; data[k + 1] = c.g; data[k + 2] = c.b; data[k + 3] = 255
    }
  }
  let source = { width: w, height: h, data }
  if (hasDom()) {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    c.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0)
    source = c
  }
  return new LogoImage({ width: w, height: h, source, data })
}

/** Paste an image centred at (x,y). The headless surface also gets the pixels (tests). */
function putImage(surface, img, x, y, style = {}) {
  surface.image(img.source, x, y, { width: img.width, height: img.height, ...style })
  if (surface.data && img.data && !surface.canvas) {
    const x0 = x - img.width / 2, y0 = y + img.height / 2
    for (let j = 0; j < img.height; j++) {
      for (let i = 0; i < img.width; i++) {
        const k = (j * img.width + i) * 4
        const [px, py] = surface.toPixel(x0 + i, y0 - j)
        const X = Math.floor(px), Y = Math.floor(py)
        if (X < 0 || Y < 0 || X >= surface.width || Y >= surface.height) continue
        const q = (Y * surface.width + X) * 4
        surface.data[q] = img.data[k]; surface.data[q + 1] = img.data[k + 1]; surface.data[q + 2] = img.data[k + 2]; surface.data[q + 3] = 255
      }
    }
  }
}

/** Load an image file by URL (browser only). */
async function loadImageFile(name) {
  if (typeof globalThis.Image !== 'function') throw badInput(undefined, name)
  const img = new globalThis.Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = () => reject(new LogoError(`Nie mogę wczytać pliku ${name}`))
    img.src = String(name)
  })
  return img
}

const IMAGE_FILE_RE = /\.(lgf|png|gif|jpe?g|bmp|svg|webp)$/i

// ------------------------------------------------------------------ shapes (§2.8)

/** Convert any `ustalPostać` input to a Shape (or null = default turtle). Exported for prims-objects. */
export async function shapeFromValue(ctx, t, v) {
  if (v === undefined || v === null || v === '' || isEmptyList(v)) return null
  if (v instanceof LogoImage) return Object.assign(createImageShape(v.source, { width: v.width, height: v.height }), { _source: v })
  if (typeof v === 'object' && !Array.isArray(v) && v.frames) return v
  if (typeof v === 'string' || typeof v === 'number') {
    const s = getShape(String(v))
    if (s) return s === defaultShape() ? null : s
    if (IMAGE_FILE_RE.test(String(v))) {
      const img = await loadImageFile(v)
      return Object.assign(createImageShape(img, { name: String(v) }), { _source: v })
    }
    throw badInput(undefined, v)
  }
  if (isListOfLists(v)) {
    const shapes = []
    for (const f of v) {
      const s = await shapeFromValue(ctx, t, f)
      shapes.push(s ?? defaultShape())
    }
    return Object.assign(createAnimatedShape(shapes), { _source: v })
  }
  if (Array.isArray(v)) {
    const compact = shapeFromCompact(v, { color: t.penColor, width: t.penWidth })
    if (compact) return Object.assign(compact, { _source: v })
    const r = await traceList(v, ctx, t, { penDown: true })
    return Object.assign(shapeFromOps(r.ops, { name: 'lista' }), { _source: v })
  }
  throw badInput(undefined, v)
}

function shapeToValue(t) {
  if (!t.shape) return []
  return t.shape._source ?? t.shape.name
}

// ------------------------------------------------------------------ spline (krzywa)

/** Catmull-Rom spline through points (open), `seg` samples per segment. */
function spline(points, seg = 8) {
  if (points.length < 3) return points.map(roundPt)
  const P = [points[0], ...points, points[points.length - 1]]
  const out = [roundPt(points[0])]
  for (let i = 1; i + 2 < P.length; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]]
    for (let s = 1; s <= seg; s++) {
      const u = s / seg, u2 = u * u, u3 = u2 * u
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3)
      out.push([Math.round(f(p0[0], p1[0], p2[0], p3[0]) * 1000) / 1000, Math.round(f(p0[1], p1[1], p2[1], p3[1]) * 1000) / 1000])
    }
  }
  return out
}

/** Points input for obrys/rysujKrzywą: a list of points or a drawing list. */
async function pointsOrDrawing(ctx, t, v) {
  if (Array.isArray(v) && v.length && v.every((p) => Array.isArray(p) && p.length === 2 && !p.some(Array.isArray))) return pointsArg(v)
  const r = await traceList(v, ctx, t)
  return r.points
}

function polyline(t, pts) {
  if (t.pen === 'pod' || pts.length === 0) return
  const style = t.lineStyle()
  t.clipped(() => {
    if (pts.length === 1) t.surface.line(pts[0][0], pts[0][1], pts[0][0], pts[0][1], style)
    for (let i = 0; i + 1 < pts.length; i++) t.surface.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], style)
  })
  t._changed()
}

// ------------------------------------------------------------------ suń (glide)

function glideOptions(v) {
  if (!Array.isArray(v)) throw badInput(undefined, v)
  if (v.length === 0) return { step: 5, todo: null, wait: 30 }
  const o = { step: 5, todo: null, wait: 0 }
  for (let i = 0; i < v.length; i += 2) {
    const k = normName(v[i]), val = v[i + 1]
    if (val === undefined) throw badInput(undefined, v)
    if (k === 'co' || k === 'step') o.step = Math.max(0.5, Math.abs(num(val)))
    else if (k === 'rób' || k === 'todo') o.todo = val
    else if (k === 'czekaj' || k === 'wait') o.wait = Math.max(0, num(val))
    else throw badInput(undefined, v)
  }
  return o
}

async function glide(ctx, t, list, opts) {
  const r = await traceList(list, ctx, t)
  const start = { x: t.x, y: t.y, heading: t.heading }
  const pts = r.points.map((p) => toWorld(start, p))
  const c = ctx.interp.objectCtx(ctx, t)
  let cx = t.x, cy = t.y
  for (let i = 1; i < pts.length; i++) {
    const [tx, ty] = pts[i]
    const len = Math.hypot(tx - cx, ty - cy)
    if (len < 1e-9) continue
    t.setHeading(t.towards(tx, ty))
    const n = Math.max(1, Math.ceil(len / opts.step - 1e-9))
    for (let k = 1; k <= n; k++) {
      const nx = cx + ((tx - cx) * k) / n, ny = cy + ((ty - cy) * k) / n
      await t.setPos(snap(nx), snap(ny))
      traced(t)
      if (opts.todo) await ctx.interp.execList(opts.todo, c)
      if (opts.wait > 0) await ctx.interp.sleep(opts.wait, ctx)
    }
    cx = tx; cy = ty
  }
}

// ------------------------------------------------------------------ pages

function pageBgLine(p) {
  if (!p.bgLine) p.bgLine = { color: BLACK, width: 1, pattern: 0 }
  return p.bgLine
}

function snapshotPage(world) {
  const s = world.surface, p = world.page
  try {
    if (s.data && !s.canvas) p._pixels = { kind: 'headless', w: s.width, h: s.height, data: new Uint8ClampedArray(s.data) }
    else if (s.canvas && s.ctx) p._pixels = { kind: 'canvas', data: s.ctx.getImageData(0, 0, s.canvas.width, s.canvas.height) }
  } catch { p._pixels = null }
}

function restorePage(world, p) {
  const s = world.surface
  if (s.width !== p.width || s.height !== p.height) s.resize(p.width, p.height)
  s.setBackground?.(p.background)
  s.clear(p.background)
  const px = p._pixels
  try {
    if (px?.kind === 'headless' && s.data && px.data.length === s.data.length) s.data.set(px.data)
    else if (px?.kind === 'canvas' && s.ctx) s.ctx.putImageData(px.data, 0, 0)
  } catch { /* ignore */ }
}

function showPage(world, p) {
  if (p === world.page) return
  snapshotPage(world)
  world.page._who = world.activeTurtles
  world.page = p
  restorePage(world, p)
  world.activeTurtles = p._who ?? world.turtlesOf(p).slice(0, 1)
  world.requestRender()
  world.dispatchEvent?.('gdyPokazanaStrona', { target: p }) // §13.3 page event
}

function pageArg(ctx, v) {
  const o = findObj(ctx, v)
  if (!(o instanceof Page)) throw new LogoError(`Nie ma obiektu ${formatValue(v)}`)
  return o
}

/** Draw the page's background picture (image / drawing list) on the current surface. */
async function drawBgPicture(ctx, p) {
  const v = p.bgPicture
  if (!v || p !== ctx.world.page) return
  const s = ctx.world.surface
  if (v instanceof LogoImage) putImage(s, v, 0, 0)
  else if (v && typeof v === 'object' && !Array.isArray(v) && (v.naturalWidth || v.width)) s.image(v, 0, 0, {})
  else if (Array.isArray(v)) {
    const t = activeTurtles(ctx)[0] ?? ctx.world.turtles[0]
    const r = await traceList(v, ctx, t, { penDown: true })
    if (r.compact) {
      const pts = r.points
      for (let i = 0; i + 1 < pts.length; i++) s.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], { color: BLACK, width: 1 })
    } else replayOps(r.ops, s, { x: 0, y: 0, heading: 0 }, p.background)
  }
  ctx.world.requestRender()
}

/** Settings of a non-turtle, non-page object addressed with apostrophe syntax (pt1'kolTła). */
function uiObject(ctx) {
  const s = ctx._self
  if (s && !(s instanceof Turtle) && !(s instanceof Page) && typeof s.getSetting === 'function') {
    // inside the widget's own event handler (gdyWciśnięty, gdyZmieniasz…) turtle/page commands
    // still go to the active turtles and the page; only `prz1'…` addressing reaches the widget
    const ev = ctx.process?.event
    if (ev && ev.target === s) return null
    return s
  }
  return null
}

function screenMode(ctx, mode) {
  const io = ctx.interp?.io
  if (io && typeof io.setScreenMode === 'function') io.setScreenMode(mode)
}

// ------------------------------------------------------------------ registration

export function register(registry) {
  const def = (names, spec) => registry.define(names, spec)
  /** turtle command applied to all active turtles */
  const cmd = (names, arity, fn, extra = {}) => def(names, { arity, ...extra, fn: async (ctx, ...a) => { await each(ctx, (t) => fn(t, ctx, ...a)) } })
  /** reporter of the first active turtle */
  const rep = (names, arity, fn, extra = {}) => def(names, { arity, ...extra, fn: async (ctx, ...a) => fn(firstTurtle(ctx), ctx, ...a) })

  // ---------------------------------------------------------------- §2.1 movement
  cmd(['naprzód', 'np', 'forward', 'fd'], 1, async (t, ctx, d) => { await t.forward(num(d, JLD.move)); traced(t) },
    { doc: 'Przesuwa aktywne żółwie o n kroków.' })
  cmd(['wstecz', 'ws', 'back', 'bk'], 1, async (t, ctx, d) => { await t.back(num(d, JLD.move)); traced(t) },
    { doc: 'Ruch do tyłu.' })
  cmd(['prawo', 'pw', 'right', 'rt'], 1, async (t, ctx, a) => { await t.right(num(a, JLD.turn)) },
    { doc: 'Obrót zgodnie z ruchem wskazówek zegara.' })
  cmd(['lewo', 'lw', 'left', 'lt'], 1, async (t, ctx, a) => { await t.left(num(a, JLD.turn)) },
    { doc: 'Obrót przeciwnie do ruchu wskazówek zegara.' })
  cmd(['wróć', 'home'], 0, async (t) => { t.home(); traced(t); await t.world?.yield() },
    { doc: 'Żółw wraca do stanu początkowego bez rysowania.' })
  def(['suń', 'glide'], {
    arity: 2,
    doc: 'Żółw jedzie po obrysie listy rysującej: suń lista [co N rób [..] czekaj ms].',
    fn: async (ctx, list, opts) => {
      const o = glideOptions(opts)
      await each(ctx, (t) => glide(ctx, t, list, o))
    },
  })

  // ---------------------------------------------------------------- §2.2 position & heading
  cmd(['ustalPoz', 'naPoz', 'setPos'], 1, async (t, ctx, p) => { const [x, y] = pointArg(ctx, p); await t.setPos(x, y); traced(t) },
    { doc: 'Przesuwa żółwia do punktu [x y].' })
  rep(['poz', 'pos'], 0, (t) => [t.x, t.y], { doc: '[x y] żółwia.' })
  rep(['pozx', 'xcor'], 0, (t) => t.x, { doc: 'Współrzędna x.' })
  rep(['pozy', 'ycor'], 0, (t) => t.y, { doc: 'Współrzędna y.' })
  cmd(['ustalPozx', 'setXcor', 'setX'], 1, async (t, ctx, x) => {
    const v = isAny(x) ? randomPoint(ctx.world)[0] : num(x)
    await t.setX(v); traced(t)
  }, { doc: 'Ustala x.' })
  cmd(['ustalPozy', 'setYcor', 'setY'], 1, async (t, ctx, y) => {
    const v = isAny(y) ? randomPoint(ctx.world)[1] : num(y)
    await t.setY(v); traced(t)
  }, { doc: 'Ustala y.' })
  cmd(['ustalXY', 'setXY'], 2, async (t, ctx, x, y) => {
    const rp = randomPoint(ctx.world)
    await t.setXY(isAny(x) ? rp[0] : num(x), isAny(y) ? rp[1] : num(y)); traced(t)
  }, { doc: 'Ustala obie współrzędne.' })
  rep(['kierunek', 'heading'], 0, (t) => t.heading, { doc: 'Kierunek w stopniach.' })
  cmd(['ustalKierunek', 'skieruj', 'skier', 'setHeading', 'setH'], 1, (t, ctx, h) => { t.setHeading(num(h, JLD.heading)) },
    { doc: 'Ustala kierunek: 0 = północ, 90 = wschód.' })
  rep(['kierunekDo', 'towards'], 1, (t, ctx, p) => { const [x, y] = pointArg(ctx, p, { allowTurtle: true }); return t.towards(x, y) },
    { doc: 'Kierunek do punktu albo żółwia.' })
  rep(['stanPoczątkowy', 'homeState'], 0, (t) => [[t.homeState.x, t.homeState.y], t.homeState.heading],
    { doc: '[[x y] kierunek] stanu początkowego.' })
  cmd(['ustalStanPoczątkowy', 'setHomeState'], 1, (t, ctx, v) => {
    let x, y, h
    if (Array.isArray(v) && v.length === 2 && Array.isArray(v[0]) && v[0].length === 2) { [[x, y], h] = v }
    else if (Array.isArray(v) && v.length === 3 && !v.some(Array.isArray)) { [x, y, h] = v }
    else if (Array.isArray(v) && v.length === 2 && !v.some(Array.isArray)) { [x, y] = v; h = 0 }
    else throw badInput(undefined, v)
    t.setHomeState(num(x), num(y), num(h))
  }, { doc: 'Ustala stan, do którego wracają wróć i czyść.' })
  rep(['pozA', 'aPos'], 0, (t) => {
    const p = t.page || t.world.page, o = p.origin || [0, 0]
    return [snap(t.x + o[0] + Math.floor(p.width / 2)), snap(Math.floor(p.height / 2) - (t.y + o[1]))]
  }, { doc: 'Pozycja bezwzględna (piksele od lewego górnego rogu, oś y w dół).' })
  cmd(['ustalPozA', 'setAPos'], 1, async (t, ctx, v) => {
    const [ax, ay] = pointArg(ctx, v)
    const p = t.page || t.world.page, o = p.origin || [0, 0]
    await t.setPos(ax - Math.floor(p.width / 2) - o[0], Math.floor(p.height / 2) - ay - o[1]); traced(t)
  }, { doc: 'Ustala pozycję bezwzględną.' })
  def(['pozMyszy', 'mousePos'], { arity: 0, doc: 'Pozycja myszy.', fn: async (ctx) => [snap(ctx.world.mouse.x), snap(ctx.world.mouse.y)] })
  def(['ustalPozMyszy', 'setMousePos'], {
    arity: 1,
    doc: 'W przeglądarce tylko zapamiętuje pozycję myszy.',
    fn: async (ctx, p) => { const [x, y] = pointArg(ctx, p); ctx.world.mouse.x = x; ctx.world.mouse.y = y },
  })
  rep(['odległość', 'distance'], 1, (t, ctx, p) => { const [x, y] = pointArg(ctx, p, { allowTurtle: true }); return t.distance(x, y) },
    { extension: true, doc: 'Odległość od punktu albo żółwia (rozszerzenie).' })

  // ---------------------------------------------------------------- §2.3 pen
  cmd(['podnieś', 'pod', 'penUp', 'pu'], 0, (t) => t.penUp(), { doc: 'Żółw nie zostawia śladu.' })
  cmd(['opuść', 'opu', 'penDown', 'pd'], 0, (t) => t.penDownCmd(), { doc: 'Żółw rysuje.' })
  cmd(['ścieraj', 'ścier', 'penErase', 'pe'], 0, (t) => t.penErase(), { doc: 'Żółw ściera do koloru tła.' })
  cmd(['odwracaj', 'penReverse', 'px'], 0, (t) => t.penReverse(), { doc: 'Rysowanie w trybie XOR.' })
  rep(['pisak', 'pen'], 0, (t) => t.pen, { doc: 'Stan pisaka: opu, pod, ścier albo odwr.' })
  cmd(['ustalPisak', 'setPen'], 1, (t, ctx, w) => {
    const p = typeof w === 'string' ? parsePenWord(w) : undefined
    if (!p) throw badInput(undefined, w)
    t.pen = p; t._changed()
  }, { doc: 'Ustala stan pisaka słowem.' })
  cmd(['ustalKolPis', 'ukp', 'setPenColour', 'setPenColor', 'setPC'], 1, (t, ctx, c) => t.setPenColor(color(c)),
    { doc: 'Ustala kolor pisaka (i kolor malowania).' })
  rep(['kolPis', 'penColour', 'penColor', 'pc'], 0, (t) => colorToLogo(t.penColor), { doc: 'Kolor pisaka.' })
  cmd(['ustalGrubość', 'ugp', 'setPenWidth', 'setPW'], 1, (t, ctx, w) => t.setPenWidth(num(w, JLD.width)),
    { doc: 'Grubość pisaka w pikselach.' })
  rep(['grubość', 'penWidth'], 0, (t) => t.penWidth, { doc: 'Grubość pisaka.' })
  cmd(['ustalWzórPis', 'uwp', 'setPenPattern', 'setPP'], 1, (t, ctx, p) => t.setPenPattern(num(p, [0, 5])),
    { doc: 'Wzór pisaka 0–6.' })
  rep(['wzórPis', 'penPattern', 'pp', 'pattern'], 0, (t) => t.penPattern, { doc: 'Wzór pisaka.' })

  // ---------------------------------------------------------------- §2.4 fill
  cmd(['zamaluj', 'zam', 'fill'], 0, async (t) => { t.fill(); await t.world?.yield() }, { doc: 'Zamalowuje obszar wokół żółwia.' })
  cmd(['ustalKolMal', 'ukm', 'ustalKolZam', 'setFillColour', 'setFillColor', 'setFC'], 1, (t, ctx, c) => { t.setFillColor(color(c)) },
    { doc: 'Ustala kolor malowania.' })
  rep(['kolMal', 'fillColour', 'fillColor', 'fc'], 0, (t) => colorToLogo(t.fillColor), { doc: 'Kolor malowania.' })
  cmd(['ustalWzórMal', 'uwm', 'setFillPattern', 'setFP'], 1, (t, ctx, p) => t.setFillPattern(num(p, [0, 7])),
    { doc: 'Wzór malowania 0–7.' })
  rep(['wzórMal', 'fillPattern', 'fp'], 0, (t) => t.fillPattern, { doc: 'Wzór malowania.' })
  rep(['kolorPodŻółwiem', 'dotColour', 'dotColor', 'kolorPod'], 0, (t) => colorToLogo(t.colorUnder()),
    { doc: 'Kolor piksela pod żółwiem.' })

  // ---------------------------------------------------------------- §2.5 shapes
  cmd(['okrąg', 'circle'], 1, (t, ctx, d) => t.circle(num(d)), { doc: 'Okrąg o podanej średnicy.' })
  cmd(['koło', 'filledCircle'], 1, (t, ctx, d) => t.filledCircle(num(d)), { doc: 'Koło o podanej średnicy.' })
  cmd(['kropka', 'point'], 1, (t, ctx, d) => t.point(num(d)), { doc: 'Pełne koło w kolorze pisaka.' })
  cmd(['pkt', 'dot'], 0, (t) => t.dot(), { doc: 'Punkt w miejscu żółwia.' })
  const ellipseArgs = (v) => {
    if (!Array.isArray(v) || (v.length !== 2 && v.length !== 4)) throw badInput(undefined, v)
    const n = v.map((q) => num(q))
    return { a: n[0], b: n[1], start: v.length === 4 ? n[2] : 0, end: v.length === 4 ? n[3] : 360 }
  }
  cmd(['elipsa', 'ellipse'], 1, (t, ctx, v) => { const e = ellipseArgs(v); t.ellipse(e.a, e.b, { start: e.start, end: e.end }) },
    { doc: 'Elipsa [a b] albo łuk [a b kąt1 kąt2].' })
  cmd(['elipsaZamalowana', 'filledEllipse'], 1, (t, ctx, v) => { const e = ellipseArgs(v); t.ellipse(e.a, e.b, { start: e.start, end: e.end, filled: true }) },
    { doc: 'Elipsa wypełniona kolorem malowania.' })
  cmd(['wielokąt', 'polygon'], 1, async (t, ctx, list) => {
    const r = await traceList(list, ctx, t)
    const pts = r.points.map((p) => toWorld(t, p))
    if (pts.length < 3) return
    t.clipped(() => t.surface.polygon(pts, { fillColor: (r.tmp ?? t).fillColor }))
    t._changed()
  }, { doc: 'Wypełniony wielokąt z listy rysującej.' })
  cmd(['rysuj', 'drawList'], 1, (t, ctx, list) => drawList(ctx, t, list), { doc: 'Rysuje listę rysującą bez przesuwania żółwia.' })
  cmd(['obrys', 'outline'], 1, async (t, ctx, v) => {
    const pts = await pointsOrDrawing(ctx, t, v)
    polyline(t, pts.map((p) => toWorld(t, p)))
  }, { doc: 'Łamana przez listę punktów (względem żółwia).' })
  rep(['krzywa', 'spline'], 1, async (t, ctx, v) => spline(await pointsOrDrawing(ctx, t, v)), { doc: 'Wygładzona lista punktów.' })
  cmd(['rysujKrzywą', 'drawSpline'], 1, async (t, ctx, v) => {
    const pts = spline(await pointsOrDrawing(ctx, t, v))
    polyline(t, pts.map((p) => toWorld(t, p)))
  }, { doc: 'Rysuje krzywą przez punkty.' })
  rep(['naPunkty', 'toPoints'], 1, async (t, ctx, v) => (await traceList(v, ctx, t)).points, { doc: 'Lista rysująca → lista punktów.' })
  rep(['naWektory', 'toVectors'], 1, async (t, ctx, v) => {
    const pts = (await traceList(v, ctx, t)).points
    const out = []
    for (let i = 1; i < pts.length; i++) out.push([snap(pts[i][0] - pts[i - 1][0]), snap(pts[i][1] - pts[i - 1][1])])
    return out
  }, { doc: 'Lista rysująca → lista wektorów [dx dy].' })

  // ---------------------------------------------------------------- §2.6 text
  const textOf = (v) => formatValue(v, { top: true })
  cmd(['napisz', 'label', 'setTT', 'ttext'], 1, (t, ctx, v) => t.label(textOf(v)), { doc: 'Pisze tekst na stronie w miejscu żółwia.' })
  cmd(['napisz2', 'label2'], 1, (t, ctx, v) => { t.label2(textOf(v)); traced(t) }, { doc: 'Jak napisz, żółw przesuwa się na koniec tekstu.' })
  cmd(['ustalCzcionkę', 'setFont'], 1, (t, ctx, v) => { t.font = fontFromValue(v, t.font); t._changed() }, { doc: 'Ustala czcionkę.' })
  rep(['czcionka', 'font'], 0, (t) => fontToValue(t.font), { doc: 'Bieżąca czcionka.' })
  rep(['rozmiarTekstu', 'textSize'], 1, (t, ctx, v) => {
    const s = t.textSize(textOf(v))
    return [Math.round(s.width), Math.round(s.height)]
  }, { doc: '[szer wys] tekstu.' })

  // ---------------------------------------------------------------- §2.7 visibility & range
  cmd(['pokażMnie', 'pż', 'showTurtle', 'st', 'showMe'], 0, (t) => t.show(), { doc: 'Pokazuje aktywne żółwie.' })
  cmd(['schowajMnie', 'sż', 'hideTurtle', 'ht', 'hideMe'], 0, (t) => t.hide(), { doc: 'Chowa aktywne żółwie.' })
  rep(['widoczny', 'widoczny?', 'shown', 'shown?'], 0, (t) => fromBool(t.visible), { doc: 'Czy żółw jest widoczny.' })
  cmd(['ustalWidoczny', 'setShown'], 1, (t, ctx, b) => t.setVisible(bool(b)), { doc: 'Pokazuje albo chowa żółwia.' })
  const styleArg = (v) => { const s = typeof v === 'string' ? parseRangeStyle(v) : undefined; if (!s) throw badInput(undefined, v); return s }
  cmd(['ustalStylZakresu', 'setRangeStyle'], 1, (t, ctx, v) => { t.ownRangeStyle = styleArg(v) }, { doc: 'sklej, okno, płot albo odbij.' })
  rep(['stylZakresu', 'rangeStyle'], 0, (t) => t.rangeStyle, { doc: 'Bieżący styl zakresu.' })
  const rangeValue = (v) => (isEmptyList(v) ? null : rectArg(v))
  cmd(['ustalZakres', 'setRange'], 1, (t, ctx, v) => { const r = rangeValue(v); t.range = r; t._changed() }, { doc: 'Prostokąt [x1 y1 x2 y2], w którym działa żółw.' })
  rep(['zakres', 'range'], 0, (t) => (t.range ? [...t.range] : []), { doc: 'Bieżący zakres.' })
  for (const [style, names] of [['sklej', ['sklej', 'wrap']], ['okno', ['okno', 'window']], ['płot', ['płot', 'fence']], ['odbij', ['odbij', 'bounce']]]) {
    def(names, {
      arity: 0, minArity: 0, maxArity: 1,
      doc: `Ustala styl zakresu ${style}; (${names[0]} [x1 y1 x2 y2]) ustala też zakres.`,
      fn: async (ctx, rect) => {
        const r = rect === undefined ? undefined : rangeValue(rect)
        await each(ctx, (t) => { t.ownRangeStyle = style; if (r !== undefined) t.range = r; t._changed() })
      },
    })
  }
  cmd(['ustalWidocznyZakres', 'setShownRange'], 1, (t, ctx, v) => { t.shownRange = rangeValue(v); t._changed() },
    { doc: 'Prostokąt, w którym żółw jest widoczny.' })
  rep(['widocznyZakres', 'shownRange'], 0, (t) => (t.shownRange ? [...t.shownRange] : []), { doc: 'Bieżący widoczny zakres.' })
  const inside = (t, v) => { const [a, b, c, d] = rectArg(v); return t.x >= a && t.x <= c && t.y >= b && t.y <= d }
  rep(['wewnątrz?', 'inside?'], 1, (t, ctx, v) => fromBool(inside(t, v)), { doc: 'Czy żółw jest w prostokącie.' })
  rep(['zewnątrz?', 'outside?'], 1, (t, ctx, v) => fromBool(!inside(t, v)), { doc: 'Czy żółw jest poza prostokątem.' })

  // ---------------------------------------------------------------- §2.8 shape, stamp, animation
  def(['ustalPostać', 'setShape'], {
    arity: 1,
    doc: 'Ustala postać: nazwa, plik, lista rysująca, lista list (animacja) albo [].',
    fn: async (ctx, v) => {
      await each(ctx, async (t) => {
        const s = await shapeFromValue(ctx, t, v)
        t.shape = s; t.frame = 0; t._changed()
      })
    },
  })
  rep(['postać', 'shape'], 0, (t) => shapeToValue(t), { doc: 'Bieżąca postać.' })
  cmd(['stempluj', 'stamp'], 0, (t) => t.stamp(), { doc: 'Odciska postać na tle.' })
  cmd(['stemplujObraz', 'stampPicture'], 1, async (t, ctx, v) => {
    if (v instanceof LogoImage) { t.clipped(() => putImage(t.surface, v, t.x, t.y, { heading: 0 })); t._changed(); return }
    if (typeof v === 'string' && IMAGE_FILE_RE.test(v)) { const img = await loadImageFile(v); t.clipped(() => t.surface.image(img, t.x, t.y, {})); t._changed(); return }
    if (Array.isArray(v)) { await drawList(ctx, t, v); return }
    throw badInput(undefined, v)
  }, { doc: 'Odciska obraz albo listę rysującą.' })
  rep(['weźObraz', 'getImage'], 1, (t, ctx, v) => grabImage(t.surface, isEmptyList(v) ? t.bounds() : rectArg(v)),
    { doc: 'Wycina obraz z prostokąta tła.' })
  cmd(['ustalSkalęPostaci', 'setShapeScale'], 1, (t, ctx, v) => {
    if (Array.isArray(v)) { if (v.length !== 2) throw badInput(undefined, v); t.shapeScale = [num(v[0]), num(v[1])] }
    else t.shapeScale = num(v)
    t._changed()
  }, { doc: 'Skala postaci: n albo [sx sy].' })
  rep(['skalaPostaci', 'shapeScale'], 0, (t) => (Array.isArray(t.shapeScale) ? [...t.shapeScale] : t.shapeScale), { doc: 'Skala postaci.' })
  cmd(['ustalKolPostaci', 'setShapeColour', 'setShapeColor'], 1, (t, ctx, v) => { t.shapeColor = isEmptyList(v) ? null : color(v); t._changed() },
    { doc: 'Przebarwia postać; [] przywraca oryginał.' })
  rep(['kolPostaci', 'shapeColour', 'shapeColor'], 0, (t) => (t.shapeColor ? colorToLogo(t.shapeColor) : []), { doc: 'Kolor przebarwienia postaci.' })
  cmd(['ustalKlatkę', 'setFrame'], 1, (t, ctx, v) => { t.frame = Math.round(num(v)); t._changed() }, { doc: 'Numer klatki animacji.' })
  rep(['klatka', 'frame'], 0, (t) => t.frame, { doc: 'Bieżąca klatka.' })
  cmd(['ustalAnimację', 'setAnimation'], 1, (t, ctx, v) => { t.animation = bool(v); t._changed() }, { doc: 'Włącza lub wyłącza animację postaci.' })
  rep(['animacja', 'animation'], 0, (t) => fromBool(t.animation !== false), { doc: 'Czy animacja jest włączona.' })
  cmd(['ustalSkalęOpóźnienia', 'setDelayScale'], 1, (t, ctx, v) => { t.delayScale = num(v) }, { doc: 'Mnożnik opóźnień klatek.' })
  rep(['skalaOpóźnienia', 'delayScale'], 0, (t) => t.delayScale ?? 1, { doc: 'Mnożnik opóźnień klatek.' })
  cmd(['naWierzch', 'toFront'], 0, (t) => {
    t.zOrder = Math.max(...t.world.turtles.map((q) => q.zOrder || 0)) + 1; t._changed()
  }, { doc: 'Żółw na wierzch.' })
  cmd(['naSpód', 'toBack'], 0, (t) => {
    t.zOrder = Math.min(...t.world.turtles.map((q) => q.zOrder || 0)) - 1; t._changed()
  }, { doc: 'Żółw na spód.' })
  const overlaps = (a, b) => a !== b && a.page === b.page &&
    Math.hypot(a.x - b.x, a.y - b.y) < shapeRadius(a.currentShape, a.shapeScale) + shapeRadius(b.currentShape, b.shapeScale)
  rep(['nachodzi?', 'overlap?'], 1, (t, ctx, v) => {
    const list = Array.isArray(v) ? v : [v]
    return fromBool(list.some((n) => overlaps(t, turtleArg(ctx, n))))
  }, { doc: 'Czy postać nachodzi na żółwia lub listę żółwi.' })
  rep(['listaNachodzących', 'overlapList'], 0, (t) => t.world.turtles.filter((q) => overlaps(t, q)).map((q) => q.name),
    { doc: 'Żółwie, na które nachodzi postać.' })

  // ---------------------------------------------------------------- §3 colours
  def(['kolory', 'ImagineColours', 'ImagineColors'], { arity: 0, doc: 'Nazwy kolorów Imagine.', fn: async () => [...IMAGINE_COLOR_NAMES] })
  def(['naRGB', 'toRGB'], { arity: 1, doc: 'Dowolny kolor → [R G B].', fn: async (ctx, v) => { const c = color(v); return [c.r, c.g, c.b] } })

  // ---------------------------------------------------------------- §4 page
  def(['czyść', 'cs', 'clearScreen'], {
    arity: 0,
    doc: 'Czyści stronę i odsyła żółwie do stanu początkowego.',
    fn: async (ctx) => {
      const w = ctx.world
      const r = w.clearScreen()
      await drawBgPicture(ctx, w.page)
      if (r && typeof r.then === 'function') await r
      await w.yield()
    },
  })
  def(['zmaż', 'clean', 'cleanBgPicture', 'cbg'], {
    arity: 0,
    doc: 'Wypełnia stronę kolorem tła; żółwie się nie ruszają.',
    fn: async (ctx) => { ctx.world.page.bgPicture = null; ctx.world.clean(); await ctx.world.yield() },
  })
  def(['odnowa', 'reset'], {
    arity: 0,
    doc: 'Zostawia tylko ż1 w stanie domyślnym, przywraca tło i czyści stronę.',
    fn: async (ctx) => {
      const w = ctx.world
      if (w.page !== w.pages[0]) showPage(w, w.pages[0])
      w.page.bgPicture = null
      w.page.origin = null
      w.page.bgLine = null
      w.reset()
    },
  })
  def(['ustalKolTła', 'ustalTło', 'setBgColour', 'setBgColor', 'setBg'], {
    arity: 1,
    doc: 'Ustala kolor tła strony i ją czyści.',
    fn: async (ctx, v) => {
      const ui = uiObject(ctx)
      if (ui && typeof ui.setSetting === 'function' && ui.setSetting('kolTła', v)) return
      const c = color(v)
      const p = pageOf(ctx)
      if (p === ctx.world.page) { ctx.world.setBackground(c); await drawBgPicture(ctx, p) }
      else { p.background = c; p._pixels = null }
    },
  })
  def(['kolTła', 'bgColour', 'bgColor', 'bg'], {
    arity: 0,
    doc: 'Kolor tła.',
    fn: async (ctx) => {
      const ui = uiObject(ctx)
      if (ui) { const v = ui.getSetting('kolTła'); if (v !== undefined) return v }
      return colorToLogo(pageOf(ctx).background)
    },
  })
  def(['ustalRozmiar', 'setSize'], {
    arity: 1,
    doc: '[szer wys] strony.',
    fn: async (ctx, v) => {
      const ui = uiObject(ctx)
      if (ui && typeof ui.setSetting === 'function' && ui.setSetting('rozmiar', v)) return
      if (!Array.isArray(v) || v.length !== 2) throw badInput(undefined, v)
      const w = num(v[0]), h = num(v[1])
      if (w < 1 || h < 1) throw badInput(undefined, v)
      const p = pageOf(ctx)
      if (p === ctx.world.page) ctx.world.resize(w, h)
      else { p.width = Math.round(w); p.height = Math.round(h); p._pixels = null }
    },
  })
  def(['rozmiar', 'size'], {
    arity: 0,
    doc: '[szer wys] strony.',
    fn: async (ctx) => {
      const ui = uiObject(ctx)
      if (ui) { const v = ui.getSetting('rozmiar'); if (v !== undefined) return v }
      const p = pageOf(ctx)
      return [p.width, p.height]
    },
  })
  def(['ustalPoczątek', 'setOrigin'], {
    arity: 1,
    doc: 'Przesuwa początek układu współrzędnych (zapamiętywane dla pozA/lewyGórny).',
    fn: async (ctx, v) => { pageOf(ctx).origin = pointArg(ctx, v) },
  })
  def(['początek', 'origin'], { arity: 0, doc: 'Bieżący początek układu.', fn: async (ctx) => [...(pageOf(ctx).origin || [0, 0])] })
  def(['lewyGórny', 'upperLeft'], {
    arity: 0,
    doc: 'Współrzędne lewego górnego rogu strony.',
    fn: async (ctx) => {
      const p = pageOf(ctx), o = p.origin || [0, 0]
      return [snap(-Math.floor(p.width / 2) - o[0]), snap(Math.floor(p.height / 2) - o[1])]
    },
  })
  def(['ustalObrazTła', 'setBgPicture'], {
    arity: 1,
    doc: 'Obraz, lista rysująca albo plik jako tło.',
    fn: async (ctx, v) => {
      const p = pageOf(ctx)
      if (isEmptyList(v)) { p.bgPicture = null; if (p === ctx.world.page) ctx.world.clean(); return }
      if (typeof v === 'string' && IMAGE_FILE_RE.test(v)) v = new LogoImage({ ...imageInfo(await loadImageFile(v)), name: v })
      if (!(v instanceof LogoImage) && !Array.isArray(v)) throw badInput(undefined, v)
      p.bgPicture = v
      if (p === ctx.world.page) { ctx.world.clean(); await drawBgPicture(ctx, p) }
    },
  })
  def(['obrazTła', 'bgPicture'], { arity: 0, doc: 'Bieżący obraz tła.', fn: async (ctx) => pageOf(ctx).bgPicture ?? [] })
  def(['ładujTło', 'loadBgPicture'], {
    arity: 1,
    doc: 'Wczytuje obraz tła z pliku (URL).',
    fn: async (ctx, name) => {
      const io = ctx.interp?.io
      let img
      if (io && typeof io.loadImage === 'function') img = await io.loadImage(String(name))
      else img = await loadImageFile(name)
      const p = pageOf(ctx)
      p.bgPicture = img instanceof LogoImage ? img : new LogoImage({ ...imageInfo(img), name: String(name) })
      if (p === ctx.world.page) { ctx.world.clean(); await drawBgPicture(ctx, p) }
    },
  })
  def(['zapiszTło', 'saveBgPicture'], {
    arity: 1,
    doc: 'Zapisuje tło do pliku (pobranie w przeglądarce).',
    fn: async (ctx, name) => {
      const s = ctx.world.surface
      let fname = formatValue(name, { top: true }) || 'tlo.png'
      if (!/\.\w+$/.test(fname)) fname += '.png'
      const io = ctx.interp?.io
      const url = typeof s.toDataURL === 'function' ? s.toDataURL('image/png') : null
      if (io && typeof io.download === 'function') { await io.download(fname, url, s); return }
      if (url && hasDom()) {
        const a = document.createElement('a')
        a.href = url; a.download = fname
        document.body?.appendChild(a); a.click(); a.remove()
      }
    },
  })
  def(['zrzutTła', 'takePicture'], {
    arity: 1,
    doc: 'Obraz prostokąta tła.',
    fn: async (ctx, v) => {
      const p = ctx.world.page
      const r = isEmptyList(v) ? [-p.width / 2, -p.height / 2, p.width / 2, p.height / 2] : rectArg(v)
      return grabImage(ctx.world.surface, r)
    },
  })
  def(['wstawObraz', 'putPicture'], {
    arity: 2,
    doc: 'Wkleja obraz (środek w podanym punkcie).',
    fn: async (ctx, img, p) => {
      const [x, y] = pointArg(ctx, p)
      if (typeof img === 'string' && IMAGE_FILE_RE.test(img)) img = new LogoImage({ ...imageInfo(await loadImageFile(img)), name: img })
      if (!(img instanceof LogoImage)) throw badInput(undefined, img)
      putImage(ctx.world.surface, img, x, y)
      ctx.world.requestRender()
    },
  })
  def(['kolorPunktuW', 'dotColourAt', 'dotColorAt'], {
    arity: 1,
    doc: 'Kolor tła w punkcie.',
    fn: async (ctx, v) => { const [x, y] = pointArg(ctx, v); return colorToLogo(ctx.world.surface.getPixel(x, y)) },
  })
  def(['ustalKolLiniiTła', 'setBgLineColour', 'setBgLineColor'], {
    arity: 1, doc: 'Kolor pisaka „bez żółwia”.', fn: async (ctx, v) => { pageBgLine(pageOf(ctx)).color = color(v) },
  })
  def(['ustalGrubośćLiniiTła', 'setBgLineWidth'], {
    arity: 1, doc: 'Grubość pisaka „bez żółwia”.', fn: async (ctx, v) => { const n = num(v, JLD.width); pageBgLine(pageOf(ctx)).width = n < 1 ? 1 : n },
  })
  def(['ustalWzórLiniiTła', 'setBgLinePattern'], {
    arity: 1, doc: 'Wzór pisaka „bez żółwia”.', fn: async (ctx, v) => { pageBgLine(pageOf(ctx)).pattern = Math.max(0, Math.min(6, Math.round(num(v)))) },
  })
  const bgStyle = (ctx) => { const l = pageBgLine(ctx.world.page); return { color: l.color, width: l.width, pattern: l.pattern, mode: 'paint', background: ctx.world.page.background } }
  const bgDone = async (ctx) => { ctx.world.requestRender(); await ctx.world.yield() }
  def(['liniaTła', 'bgLine'], {
    arity: 1,
    doc: 'Linia tła [[x1 y1] [x2 y2]].',
    fn: async (ctx, v) => {
      const [x1, y1, x2, y2] = linePoints(v)
      ctx.world.surface.line(x1, y1, x2, y2, bgStyle(ctx)); await bgDone(ctx)
    },
  })
  const rectPts = ([a, b, c, d]) => [[a, b], [c, b], [c, d], [a, d]]
  def(['prostokątTła', 'bgRectangle'], {
    arity: 1, doc: 'Obrys prostokąta [x1 y1 x2 y2].',
    fn: async (ctx, v) => { const st = bgStyle(ctx); ctx.world.surface.polygon(rectPts(rectArg(v)), { color: st.color, width: st.width, pattern: st.pattern }); await bgDone(ctx) },
  })
  def(['pełnyProstokątTła', 'bgFilledRectangle'], {
    arity: 1, doc: 'Wypełniony prostokąt.',
    fn: async (ctx, v) => { const st = bgStyle(ctx); ctx.world.surface.polygon(rectPts(rectArg(v)), { fillColor: st.color, color: st.color, width: 1 }); await bgDone(ctx) },
  })
  const bgEllipse = async (ctx, v, filled) => {
    const [a, b, c, d] = rectArg(v)
    const st = bgStyle(ctx)
    ctx.world.surface.ellipse((a + c) / 2, (b + d) / 2, (c - a) / 2, (d - b) / 2, {
      rotation: 0, color: st.color, width: st.width, ...(filled ? { fillColor: st.color } : {}),
    })
    await bgDone(ctx)
  }
  def(['elipsaTła', 'bgEllipse'], { arity: 1, doc: 'Elipsa wpisana w prostokąt [p1 p2].', fn: (ctx, v) => bgEllipse(ctx, v, false) })
  def(['pełnaElipsaTła', 'bgFilledEllipse'], { arity: 1, doc: 'Wypełniona elipsa.', fn: (ctx, v) => bgEllipse(ctx, v, true) })
  def(['zamalujTło', 'bgFill'], {
    arity: 1, doc: 'Wypełnia od punktu kolorem linii tła.',
    fn: async (ctx, v) => { const [x, y] = pointArg(ctx, v); ctx.world.surface.fill(x, y, pageBgLine(ctx.world.page).color, {}); await bgDone(ctx) },
  })

  // pages
  def(['nowaStrona', 'newPage'], {
    arity: 0, minArity: 0, maxArity: 1,
    doc: 'Tworzy nową stronę s2, s3, … albo o podanej nazwie.',
    fn: async (ctx, name) => {
      const w = ctx.world
      const nm = name === undefined ? w.nextName('s') : formatValue(name)
      if (w.getObject(nm)) throw new LogoError(`Obiekt ${nm} już istnieje`)
      const p = new Page({ name: nm, width: w.page.width, height: w.page.height, parent: w.pageClass })
      w.pages.push(p)
      w.registerObject(p)
      p._who = []
      return undefined
    },
  })
  def(['pokażStronę', 'showPage'], { arity: 1, doc: 'Przełącza widok na stronę.', fn: async (ctx, v) => { showPage(ctx.world, pageArg(ctx, v)) } })
  def(['usuńStronę', 'erasePage'], {
    arity: 1,
    doc: 'Usuwa stronę.',
    fn: async (ctx, v) => {
      const w = ctx.world
      const p = pageArg(ctx, v)
      if (w.pages.length <= 1) throw badInput(undefined, v)
      if (p === w.page) showPage(w, w.pages.find((q) => q !== p))
      for (const t of w.turtlesOf(p)) w.unregisterObject(t)
      w.pages = w.pages.filter((q) => q !== p)
      w.unregisterObject(p)
      w.requestRender()
    },
  })
  def(['listaStron', 'pageList'], { arity: 0, doc: 'Nazwy stron.', fn: async (ctx) => ctx.world.pages.map((p) => p.name) })
  def(['aktywnaStrona', 'activePage'], { arity: 0, doc: 'Nazwa bieżącej strony.', fn: async (ctx) => ctx.world.page.name })

  // main window
  def(['eg', 'ekranGraficzny', 'graphicScreen', 'gs'], { arity: 0, doc: 'Tylko ekran graficzny.', fn: async (ctx) => screenMode(ctx, 'graphics') })
  def(['ekranTekstowy', 'textScreen', 'ts'], { arity: 0, doc: 'Tylko pole tekstowe.', fn: async (ctx) => screenMode(ctx, 'text') })
  def(['ekranDzielony', 'splitScreen', 'ss'], { arity: 0, doc: 'Grafika i tekst razem.', fn: async (ctx) => screenMode(ctx, 'split') })
  def(['pełnyEkran', 'fullScreen'], {
    arity: 0,
    doc: 'Tryb pełnoekranowy.',
    fn: async (ctx) => {
      const io = ctx.interp?.io
      if (io && typeof io.fullScreen === 'function') return void (await io.fullScreen())
      try { await globalThis.document?.documentElement?.requestFullscreen?.() } catch { /* not allowed */ }
    },
  })
  // io.js (prims-control) also defines czyśćTekst; theirs wins if present.
  if (!registry.has('czyśćTekst')) {
    def(['czyśćTekst', 'ct', 'clearText'], { arity: 0, doc: 'Czyści pole tekstowe.', fn: async (ctx) => { ctx.interp?.io?.clearText?.() } })
  }
  def(['drukujGrafikę', 'printGraphics'], {
    arity: 0,
    doc: 'Drukuje stronę.',
    fn: async (ctx) => {
      const io = ctx.interp?.io
      if (io && typeof io.printGraphics === 'function') return void (await io.printGraphics())
      if (typeof globalThis.window?.print === 'function') globalThis.window.print()
    },
  })

  // ---------------------------------------------------------------- interface elements
  // `prz1'ustalPoz [50 60]`, `suw1'poz`, `pt1'schowajMnie`: when the addressed object is a widget
  // (not a turtle/page), position and visibility go to its own settings (docs/WIDGETS.md).
  const uiSetting = {
    ustalPoz: ['poz', (v) => v], ustalPozx: ['pozx', (v) => v], ustalPozy: ['pozy', (v) => v],
    ustalXY: ['poz', (x, y) => [x, y]],
    pokażMnie: ['widoczny', () => 'prawda'], schowajMnie: ['widoczny', () => 'fałsz'],
    ustalWidoczny: ['widoczny', (v) => v],
  }
  for (const [name, [key, value]] of Object.entries(uiSetting)) {
    const spec = registry.lookup(name)
    if (!spec) continue
    const orig = spec.fn
    spec.fn = async (ctx, ...a) => {
      const ui = uiObject(ctx)
      if (ui && typeof ui.setSetting === 'function' && ui.setSetting(key, value(...a))) return undefined
      return orig(ctx, ...a)
    }
  }
  for (const name of ['poz', 'pozx', 'pozy', 'widoczny']) {
    const spec = registry.lookup(name)
    if (!spec) continue
    const orig = spec.fn
    spec.fn = async (ctx, ...a) => {
      const ui = uiObject(ctx)
      if (ui) { const v = ui.getSetting(name); if (v !== undefined) return v }
      return orig(ctx, ...a)
    }
  }
}

// ------------------------------------------------------------------ helpers used above

function imageInfo(img) {
  return { width: img.naturalWidth || img.width || 32, height: img.naturalHeight || img.height || 32, source: img }
}

function linePoints(v) {
  if (Array.isArray(v) && v.length === 2 && Array.isArray(v[0]) && Array.isArray(v[1]) && v[0].length === 2 && v[1].length === 2) {
    return [num(v[0][0]), num(v[0][1]), num(v[1][0]), num(v[1][1])]
  }
  if (Array.isArray(v) && v.length === 4 && !v.some(Array.isArray)) return v.map((q) => num(q))
  throw badInput(undefined, v)
}

/** `[[Nazwa] [rozmiar grubość kursywa podkreślenie przekreślenie zestaw]]` (or a size / name). */
function fontFromValue(v, cur = DEFAULT_FONT) {
  const f = { ...cur }
  if (typeof v === 'number' || (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v))) { f.size = num(v); return f }
  if (typeof v === 'string') { f.name = v; return f }
  if (!Array.isArray(v) || v.length === 0) throw badInput(undefined, v)
  const [nameP, attrs] = v
  if (nameP !== undefined) f.name = Array.isArray(nameP) ? nameP.map((x) => formatValue(x)).join(' ') : formatValue(nameP)
  if (attrs !== undefined) {
    if (!Array.isArray(attrs)) throw badInput(undefined, v)
    const keys = ['size', 'weight', 'italic', 'underline', 'strike', 'charset']
    attrs.forEach((a, i) => { if (i < keys.length) f[keys[i]] = num(a) })
  }
  return f
}

function fontToValue(f) {
  return [[f.name], [f.size, f.weight, f.italic, f.underline, f.strike, f.charset]]
}
