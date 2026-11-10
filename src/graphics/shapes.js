// Turtle shapes (postać). Owner: graphics.
//
// A Shape is a plain object:
//   { kind: 'builtin'|'vector'|'image', name, rotates: boolean, frames: Frame[], radius }
//   builtin frame: { draw(ctx, opts) }       — ctx in local px space, +y down, turtle faces up (-y)
//   vector  frame: { paths: [{ points:[[x,y]...] (LOGO units relative to the turtle, turtle facing
//                    north, +y up), closed?, color?: {r,g,b,css}, width?, fillColor? }],
//                    texts?: [{x,y,str,color,size}] }
//   image   frame: { image (HTMLImageElement|ImageBitmap|canvas), width, height }
// drawShape(ctx, shape, {x, y, heading, scale, frame, color}) draws it at pixel (x,y) on a 2D ctx.
// Shapes have no DOM dependency, so this module loads in Node.
import { makeColor } from './colors.js'
import { normName } from '../core/values.js'

const rad = (deg) => (deg * Math.PI) / 180

// ---------- built-in drawings ----------

function drawImagineTurtle(ctx, { color } = {}) {
  // Green Imagine-style turtle, ~ 26 px long, facing up.
  const shell = color ? color.css : '#2e9e2e'
  const dark = '#1d6b1d'
  const skin = color ? color.css : '#5cc85c'
  ctx.lineWidth = 1
  ctx.strokeStyle = dark
  // legs
  ctx.fillStyle = skin
  for (const [lx, ly, ang] of [[-8, -6, -40], [8, -6, 40], [-8, 7, -140], [8, 7, 140]]) {
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(rad(ang))
    ctx.beginPath(); ctx.ellipse(0, -3, 2.6, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.restore()
  }
  // tail
  ctx.beginPath(); ctx.moveTo(-2, 10); ctx.lineTo(0, 15); ctx.lineTo(2, 10); ctx.closePath(); ctx.fill(); ctx.stroke()
  // head
  ctx.beginPath(); ctx.ellipse(0, -13, 4, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#000'
  ctx.beginPath(); ctx.arc(-1.8, -15, 0.9, 0, Math.PI * 2); ctx.arc(1.8, -15, 0.9, 0, Math.PI * 2); ctx.fill()
  // shell
  ctx.fillStyle = shell
  ctx.beginPath(); ctx.ellipse(0, 0, 8.5, 10.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // shell pattern
  ctx.strokeStyle = dark
  ctx.beginPath()
  ctx.moveTo(-3.5, -5); ctx.lineTo(3.5, -5); ctx.lineTo(5, 0); ctx.lineTo(3.5, 5); ctx.lineTo(-3.5, 5); ctx.lineTo(-5, 0); ctx.closePath()
  for (const [a, b, c, d] of [[-3.5, -5, -6, -8], [3.5, -5, 6, -8], [5, 0, 8.5, 0], [-5, 0, -8.5, 0], [3.5, 5, 6, 8], [-3.5, 5, -6, 8]]) {
    ctx.moveTo(a, b); ctx.lineTo(c, d)
  }
  ctx.stroke()
}

const polyDraw = (pts, fill = '#2e9e2e', stroke = '#000') => (ctx, { color } = {}) => {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  ctx.fillStyle = color ? color.css : fill
  ctx.fill()
  ctx.lineWidth = 1; ctx.strokeStyle = stroke; ctx.stroke()
}

function builtin(name, draw, radius, rotates = true) {
  return { kind: 'builtin', name, rotates, frames: [{ draw }], radius }
}

const star = []
for (let i = 0; i < 10; i++) {
  const r = i % 2 ? 5 : 12, a = rad(i * 36)
  star.push([r * Math.sin(a), -r * Math.cos(a)])
}

/** name (normName) -> Shape. Polish names first, English aliases too. */
export const BUILTIN_SHAPES = new Map()
function reg(names, shape) { for (const n of names) BUILTIN_SHAPES.set(normName(n), shape) }

export const TURTLE_SHAPE = builtin('żółw', drawImagineTurtle, 16)
reg(['żółw', 'turtle'], TURTLE_SHAPE)
reg(['strzałka', 'arrow'], builtin('strzałka', polyDraw([[0, -12], [8, 4], [3, 2], [3, 10], [-3, 10], [-3, 2], [-8, 4]], '#2e9e2e'), 12))
reg(['trójkąt', 'triangle'], builtin('trójkąt', polyDraw([[0, -12], [9, 8], [-9, 8]], '#2e9e2e'), 12))
reg(['kwadrat', 'square'], builtin('kwadrat', polyDraw([[-8, -8], [8, -8], [8, 8], [-8, 8]], '#2e9e2e'), 12))
reg(['gwiazda', 'star'], builtin('gwiazda', polyDraw(star, '#f2c200'), 12))
reg(['koło', 'circle'], builtin('koło', (ctx, { color } = {}) => {
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2)
  ctx.fillStyle = color ? color.css : '#2e9e2e'; ctx.fill()
  ctx.lineWidth = 1; ctx.strokeStyle = '#000'; ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -8); ctx.stroke()
}, 8))
reg(['kursor', 'cursor', 'klasyczny', 'classic'], builtin('kursor', (ctx, { color } = {}) => {
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(6, 6); ctx.lineTo(-6, 6); ctx.closePath()
  ctx.lineWidth = 1.5; ctx.strokeStyle = color ? color.css : '#000'; ctx.stroke()
}, 10))

export const defaultShape = () => TURTLE_SHAPE

/** Built-in shape by name, or undefined. */
export function getShape(name) {
  return BUILTIN_SHAPES.get(normName(name))
}

/** Names of built-in shapes (canonical Polish). */
export function shapeNames() {
  return [...new Set([...BUILTIN_SHAPES.values()].map((s) => s.name))]
}

// ---------- vector / image / animated shapes ----------

function framesRadius(frames) {
  let r = 1
  for (const f of frames) {
    for (const p of f.paths || []) for (const [x, y] of p.points) r = Math.max(r, Math.hypot(x, y) + (p.width || 1) / 2)
    if (f.width) r = Math.max(r, Math.hypot(f.width, f.height) / 2)
  }
  return r
}

/**
 * Vector shape from paths (logo units relative to turtle, turtle facing north).
 * @param {Array} paths  [{points, closed?, color?, width?, fillColor?}] — or an array of such arrays
 *                       (one per animation frame) when `opts.animated` is true.
 */
export function createVectorShape(paths, { name = 'wektorowa', rotates = true, animated = false, texts } = {}) {
  const frames = animated ? paths.map((p) => ({ paths: p })) : [{ paths, texts }]
  return { kind: 'vector', name, rotates, frames, radius: framesRadius(frames) }
}

/** Image shape (does not rotate by default, like Imagine bitmaps). images: one image or an array (frames). */
export function createImageShape(images, { name = 'obraz', width, height, rotates = false } = {}) {
  const list = Array.isArray(images) ? images : [images]
  const frames = list.map((image) => ({
    image,
    width: width ?? image.naturalWidth ?? image.width ?? 32,
    height: height ?? image.naturalHeight ?? image.height ?? 32,
  }))
  return { kind: 'image', name, rotates, frames, radius: framesRadius(frames) }
}

/** Combine several shapes into one animated shape (frames concatenated). */
export function createAnimatedShape(shapes, { name = 'animacja' } = {}) {
  const frames = shapes.flatMap((s) => s.frames)
  return { kind: shapes[0]?.kind || 'vector', name, rotates: shapes[0]?.rotates ?? true, frames, radius: Math.max(1, ...shapes.map((s) => s.radius || 1)), mixed: new Set(shapes.map((s) => s.kind)).size > 1, parts: shapes }
}

/**
 * Turn ops recorded by a HeadlessSurface (e.g. a temporary turtle that executed a drawing list
 * `[powtórz 3 [np 50 pw 120]]`) into a vector shape. Coordinates in ops are logo coordinates; the
 * origin (ox,oy) and heading of the recording turtle's start state are subtracted so the shape is
 * relative to a north-facing turtle.
 */
export function shapeFromOps(ops, { originX = 0, originY = 0, heading = 0, name, rotates = true } = {}) {
  const a = rad(heading)
  const local = (x, y) => {
    const dx = x - originX, dy = y - originY
    // inverse rotation (undo the turtle heading, clockwise)
    return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]
  }
  const paths = []
  const texts = []
  for (const o of ops) {
    if (o.op === 'line') {
      if (o.pattern === 6 || o.mode === 'erase') continue
      const p = [local(o.x1, o.y1), local(o.x2, o.y2)]
      const last = paths[paths.length - 1]
      // merge consecutive collinear-joined segments with same style into one polyline
      if (last && !last.closed && !last.fillColor && last.color === o.color && last.width === (o.width || 1)) {
        const [lx, ly] = last.points[last.points.length - 1]
        if (Math.abs(lx - p[0][0]) < 1e-6 && Math.abs(ly - p[0][1]) < 1e-6) { last.points.push(p[1]); continue }
      }
      paths.push({ points: p, color: o.color, width: o.width || 1 })
    } else if (o.op === 'polygon') {
      paths.push({ points: o.points.map(([x, y]) => local(x, y)), closed: true, color: o.color, width: o.width || 1, fillColor: o.fillColor })
    } else if (o.op === 'ellipse') {
      // sample the ellipse into a polyline
      const pts = []
      const { start = 0, end = 360 } = o
      const n = 36
      const rot = rad((o.rotation || 0))
      for (let i = 0; i <= n; i++) {
        const t = rad(start + ((end - start) * i) / n)
        const lx = o.rx * Math.sin(t), ly = o.ry * Math.cos(t)
        pts.push(local(o.x + lx * Math.cos(rot) + ly * Math.sin(rot), o.y - lx * Math.sin(rot) + ly * Math.cos(rot)))
      }
      paths.push({ points: pts, closed: Math.abs(end - start) >= 360, color: o.color, width: o.width || 1, fillColor: o.fillColor })
    } else if (o.op === 'text') {
      const [x, y] = local(o.x, o.y)
      texts.push({ x, y, str: o.str, color: o.color, size: o.size })
    }
  }
  return createVectorShape(paths, { name: name || 'wektorowa', rotates, texts })
}

/**
 * Compact drawing list `[n [d1 a1 d2 a2 …]]` (§2.5) → list of points starting at [0 0], turtle
 * facing north. Returns null if `list` is not in compact form.
 */
export function compactToPoints(list) {
  if (!Array.isArray(list) || list.length !== 2 || !Array.isArray(list[1])) return null
  const n = Number(list[0])
  const seq = list[1].map(Number)
  if (!Number.isFinite(n) || seq.some((v) => !Number.isFinite(v)) || seq.length % 2) return null
  let x = 0, y = 0, h = 0
  const pts = [[0, 0]]
  for (let k = 0; k < Math.round(n); k++) {
    for (let i = 0; i < seq.length; i += 2) {
      x += seq[i] * Math.sin(rad(h)); y += seq[i] * Math.cos(rad(h))
      pts.push([Math.round(x * 1e9) / 1e9 + 0, Math.round(y * 1e9) / 1e9 + 0])
      h += seq[i + 1]
    }
  }
  return pts
}

/** Shape for a compact drawing list, drawn in `color` (pen colour), centred on its bounding box. */
export function shapeFromCompact(list, { color = makeColor(0, 0, 0), width = 1, fillColor, center = true } = {}) {
  const pts = compactToPoints(list)
  if (!pts) return null
  let p = pts
  if (center) {
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
    p = pts.map(([x, y]) => [x - cx, y - cy])
  }
  return createVectorShape([{ points: p, color, width, fillColor, closed: !!fillColor }], { name: 'lista' })
}

// ---------- rendering ----------

/**
 * Draw `shape` on a 2D context at pixel position (x,y).
 * @param {CanvasRenderingContext2D} ctx (any transform already applied for HiDPI)
 * @param {object} shape
 * @param {{x:number,y:number,heading?:number,scale?:number|[number,number],frame?:number,color?:object}} o
 *        color = recolour (ustalKolPostaci) or undefined
 */
export function drawShape(ctx, shape, { x, y, heading = 0, scale = 1, frame = 0, color } = {}) {
  if (!shape) shape = TURTLE_SHAPE
  const frames = shape.frames || []
  if (!frames.length) return
  const f = frames[((Math.floor(frame) % frames.length) + frames.length) % frames.length]
  const [sx, sy] = Array.isArray(scale) ? scale : [scale, scale]
  ctx.save()
  ctx.translate(x, y)
  if (shape.rotates !== false) ctx.rotate(rad(heading))
  ctx.scale(sx, sy)
  if (f.draw) f.draw(ctx, { color })
  else if (f.image) {
    ctx.drawImage(f.image, -f.width / 2, -f.height / 2, f.width, f.height)
  } else if (f.paths) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    for (const p of f.paths) {
      if (!p.points.length) continue
      ctx.beginPath()
      p.points.forEach(([px, py], i) => (i ? ctx.lineTo(px, -py) : ctx.moveTo(px, -py)))
      if (p.closed) ctx.closePath()
      if (p.fillColor) { ctx.fillStyle = (color || p.fillColor).css; ctx.fill() }
      if (p.color) { ctx.strokeStyle = (color || p.color).css; ctx.lineWidth = p.width || 1; ctx.stroke() }
      if (p.points.length === 1) {
        ctx.fillStyle = (color || p.color || { css: '#000' }).css
        ctx.fillRect(p.points[0][0] - 0.5, -p.points[0][1] - 0.5, 1, 1)
      }
    }
    for (const t of f.texts || []) {
      ctx.fillStyle = (color || t.color || { css: '#000' }).css
      ctx.font = `${t.size || 13}px sans-serif`
      ctx.fillText(t.str, t.x, -t.y)
    }
  }
  ctx.restore()
}

/** Hit-test radius in logo units. */
export function shapeRadius(shape, scale = 1) {
  const s = Array.isArray(scale) ? Math.max(...scale.map(Math.abs)) : Math.abs(scale)
  return (shape?.radius || TURTLE_SHAPE.radius) * (s || 1)
}
