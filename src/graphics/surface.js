// Surface interface + HeadlessSurface. Owner: graphics. See docs/ARCHITEKTURA.md.
//
// Every surface method takes LOGO coordinates (origin at page centre, +y up). Colours are resolved
// colour objects {r,g,b,css} (see colors.js). Angles for arcs/ellipses are Logo headings
// (degrees, 0 = north, clockwise).
//
// Surface interface (implemented by HeadlessSurface and CanvasSurface):
//   width, height                      page size in logo units (= CSS px)
//   resize(w, h)                       resize and clear to the current background
//   clear(color?)                      fill whole drawing layer (default: current background)
//   setBackground(color)               remember background (used by clear())
//   line(x1,y1,x2,y2, style)           style: {color, width=1, mode:'paint'|'erase'|'reverse',
//                                      background (needed for reverse), pattern 0..6, dashOffset}
//   polygon(points, style)             points [[x,y]...]; style: {fillColor?, color?, width?}
//   ellipse(x,y,rx,ry, style)          style: {rotation (heading deg), start, end (heading deg, arc),
//                                      color?, width?, fillColor?}; rx across heading, ry along heading
//   arc(x,y,r,start,end, style)        = ellipse(x,y,r,r,{...style,start,end})
//   fill(x,y,color, {bounds?})         flood fill of the region having the colour of pixel (x,y);
//                                      bounds = [x1,y1,x2,y2] logo rectangle limiting the fill
//   getPixel(x,y) -> {r,g,b,css}       colour of the drawing layer at a logo point
//   text(x,y,str, style)               style: {font, size, color, heading, bold, italic}; anchor =
//                                      left baseline at (x,y), text direction = heading + 90
//   measureText(str, style) -> {width, height}
//   image(img, x, y, style)            img = shape/image source; style {heading, scale, width, height}
//   stamp(shape, x, y, style)          draw a turtle shape (shapes.js) onto the drawing layer
//   drawTurtles(turtles)               overlay rendering (no-op on headless)
import { makeColor, WHITE } from './colors.js'

/** Logo → pixel (CSS px). Logo (0,0) maps to the centre of a pixel, so 1px lines stay crisp. */
export function logoToPixel(x, y, width, height) {
  return [Math.floor(width / 2) + 0.5 + x, Math.floor(height / 2) + 0.5 - y]
}
export function pixelToLogo(px, py, width, height) {
  return [px - Math.floor(width / 2) - 0.5 + 0, Math.floor(height / 2) + 0.5 - py + 0]
}

/** Dash pattern for pen pattern 0..6 (6 = invisible → null). */
export function penDash(pattern) {
  switch (pattern | 0) {
    case 1: return [6, 3]
    case 2: return [2, 2]
    case 3: return [6, 2, 2, 2]
    case 4: return [6, 2, 2, 2, 2, 2]
    case 5: return [1, 3]
    default: return []
  }
}

/**
 * Scanline flood fill on an RGBA buffer (iterative, no recursion).
 * Fills the 4-connected region with exactly the colour of (sx,sy).
 * @param {Uint8ClampedArray} data RGBA
 * @param {number} w @param {number} h buffer size
 * @param {number} sx @param {number} sy start pixel (integers)
 * @param {{r,g,b}} color
 * @param {[number,number,number,number]} [box] pixel bounds [x0,y0,x1,y1] inclusive
 * @returns {number} pixels filled
 */
export function floodFill(data, w, h, sx, sy, color, box) {
  const [bx0, by0, bx1, by1] = box || [0, 0, w - 1, h - 1]
  const x0 = Math.max(0, bx0), y0 = Math.max(0, by0), x1 = Math.min(w - 1, bx1), y1 = Math.min(h - 1, by1)
  if (sx < x0 || sx > x1 || sy < y0 || sy > y1) return 0
  const i0 = (sy * w + sx) * 4
  const tr = data[i0], tg = data[i0 + 1], tb = data[i0 + 2], ta = data[i0 + 3]
  const fr = color.r, fg = color.g, fb = color.b
  if (tr === fr && tg === fg && tb === fb && ta === 255) return 0
  const match = (i) => data[i] === tr && data[i + 1] === tg && data[i + 2] === tb && data[i + 3] === ta
  const set = (i) => { data[i] = fr; data[i + 1] = fg; data[i + 2] = fb; data[i + 3] = 255 }
  let count = 0
  const stack = [sx, sy]
  while (stack.length) {
    const y = stack.pop(), x = stack.pop()
    let lx = x
    while (lx >= x0 && match((y * w + lx) * 4)) lx--
    lx++
    let rx = x
    while (rx <= x1 && match((y * w + rx) * 4)) rx++
    rx--
    if (lx > rx) continue
    for (let xx = lx; xx <= rx; xx++) { set((y * w + xx) * 4); count++ }
    for (const ny of [y - 1, y + 1]) {
      if (ny < y0 || ny > y1) continue
      let inRun = false
      for (let xx = lx; xx <= rx; xx++) {
        const m = match((ny * w + xx) * 4)
        if (m && !inRun) { stack.push(xx, ny); inRun = true } else if (!m) inRun = false
      }
    }
  }
  return count
}

/** Sample an ellipse/arc into a polyline of logo points. */
export function ellipsePoints(x, y, rx, ry, { rotation = 0, start = 0, end = 360 } = {}) {
  let sweep = end - start
  if (sweep === 0) return []
  const full = Math.abs(sweep) >= 360
  if (full) sweep = 360
  const n = Math.max(8, Math.ceil((Math.abs(sweep) / 360) * Math.max(24, Math.PI * (rx + ry))))
  const rot = (rotation * Math.PI) / 180
  const pts = []
  for (let i = 0; i <= n; i++) {
    const a = ((start + (sweep * i) / n) * Math.PI) / 180 // heading angle in the turtle frame
    const lx = rx * Math.sin(a), ly = ry * Math.cos(a)  // local: x across heading, y along heading
    // rotate local frame by turtle heading (clockwise)
    pts.push([x + lx * Math.cos(rot) + ly * Math.sin(rot), y - lx * Math.sin(rot) + ly * Math.cos(rot)])
  }
  return pts
}

const approxTextWidth = (str, size) => String(str).length * size * 0.6

/**
 * In-memory surface for tests and headless runs. Records every call in `ops` and (unless
 * `{pixels:false}`) rasterises lines/polygons/ellipses into an RGBA buffer so getPixel/fill work.
 * Text and images are recorded only.
 */
export class HeadlessSurface {
  constructor({ width = 796, height = 499, pixels = true, background = WHITE } = {}) {
    this.ops = []
    this.withPixels = pixels
    this.background = background
    this.width = width
    this.height = height
    this.data = null
    this._alloc()
  }

  _alloc() {
    this.data = this.withPixels ? new Uint8ClampedArray(this.width * this.height * 4) : null
    this._clearPixels(this.background)
  }

  _clearPixels(c) {
    if (!this.data) return
    const d = this.data
    for (let i = 0; i < d.length; i += 4) { d[i] = c.r; d[i + 1] = c.g; d[i + 2] = c.b; d[i + 3] = 255 }
  }

  toPixel(x, y) { return logoToPixel(x, y, this.width, this.height) }

  resize(w, h) {
    this.ops.push({ op: 'resize', w, h })
    this.width = Math.max(1, Math.round(w)); this.height = Math.max(1, Math.round(h))
    this._alloc()
  }

  setBackground(color) {
    this.ops.push({ op: 'setBackground', color })
    this.background = color
  }

  clear(color = this.background) {
    this.ops.push({ op: 'clear', color })
    this._clearPixels(color)
  }

  // --- pixel helpers ---
  _put(px, py, c, mode, bg) {
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return
    const i = (py * this.width + px) * 4, d = this.data
    if (mode === 'reverse') {
      const b = bg || this.background
      const cur = { r: d[i], g: d[i + 1], b: d[i + 2] }
      let out
      if (cur.r === c.r && cur.g === c.g && cur.b === c.b) out = b
      else if (cur.r === b.r && cur.g === b.g && cur.b === b.b) out = c
      else out = { r: cur.r ^ c.r ^ b.r, g: cur.g ^ c.g ^ b.g, b: cur.b ^ c.b ^ b.b }
      d[i] = out.r; d[i + 1] = out.g; d[i + 2] = out.b; d[i + 3] = 255
      return
    }
    d[i] = c.r; d[i + 1] = c.g; d[i + 2] = c.b; d[i + 3] = 255
  }

  _brush(px, py, width, c, mode, bg, seen) {
    const w = Math.max(1, Math.round(width))
    const lo = -Math.floor((w - 1) / 2), hi = Math.ceil((w - 1) / 2)
    const r2 = (w / 2) * (w / 2)
    for (let dy = lo; dy <= hi; dy++) {
      for (let dx = lo; dx <= hi; dx++) {
        if (w > 2 && dx * dx + dy * dy > r2) continue
        const X = px + dx, Y = py + dy
        if (seen) { const k = Y * this.width + X; if (seen.has(k)) continue; seen.add(k) }
        this._put(X, Y, c, mode, bg)
      }
    }
  }

  _rasterLine(x1, y1, x2, y2, { color, width = 1, mode = 'paint', background, pattern = 0 }, seen) {
    if (!this.data || pattern === 6) return
    const c = mode === 'erase' ? (background || this.background) : color
    const [a, b] = this.toPixel(x1, y1), [e, f] = this.toPixel(x2, y2)
    const n = Math.max(Math.abs(e - a), Math.abs(f - b))
    const steps = Math.max(1, Math.ceil(n))
    if (!seen && mode === 'reverse') seen = new Set()
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      this._brush(Math.floor(a + (e - a) * t), Math.floor(b + (f - b) * t), width, c, mode, background, seen)
    }
  }

  _rasterPolygonFill(points, color) {
    if (!this.data || points.length < 3) return
    const pts = points.map(([x, y]) => this.toPixel(x, y))
    let minY = Infinity, maxY = -Infinity
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
    for (let py = Math.max(0, Math.floor(minY)); py <= Math.min(this.height - 1, Math.ceil(maxY)); py++) {
      const cy = py + 0.5, xs = []
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length]
        if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax))
      }
      xs.sort((p, q) => p - q)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let px = Math.ceil(xs[k] - 0.5); px <= Math.floor(xs[k + 1] - 0.5); px++) this._put(px, py, color)
      }
    }
  }

  // --- drawing API ---
  line(x1, y1, x2, y2, style = {}) {
    this.ops.push({ op: 'line', x1, y1, x2, y2, ...style })
    this._rasterLine(x1, y1, x2, y2, style)
  }

  polygon(points, style = {}) {
    this.ops.push({ op: 'polygon', points, ...style })
    if (style.fillColor) this._rasterPolygonFill(points, style.fillColor)
    if (style.color) this._polyline(points, style, true)
  }

  _polyline(points, style, closed) {
    const seen = style.mode === 'reverse' ? new Set() : undefined
    for (let i = 0; i + 1 < points.length; i++) {
      this._rasterLine(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], style, seen)
    }
    if (closed && points.length > 2) {
      const a = points[points.length - 1], b = points[0]
      this._rasterLine(a[0], a[1], b[0], b[1], style, seen)
    }
  }

  ellipse(x, y, rx, ry, style = {}) {
    this.ops.push({ op: 'ellipse', x, y, rx, ry, ...style })
    const { start = 0, end = 360 } = style
    const pts = ellipsePoints(x, y, rx, ry, style)
    const full = Math.abs(end - start) >= 360
    if (style.fillColor) this._rasterPolygonFill(full ? pts : [[x, y], ...pts], style.fillColor)
    if (style.color) this._polyline(pts, style, false)
  }

  arc(x, y, r, start, end, style = {}) {
    this.ellipse(x, y, r, r, { ...style, start, end })
  }

  fill(x, y, color, { bounds } = {}) {
    this.ops.push({ op: 'fill', x, y, color, bounds })
    if (!this.data) return 0
    const [px, py] = this.toPixel(x, y)
    let box
    if (bounds) {
      const [ax, ay] = this.toPixel(Math.min(bounds[0], bounds[2]), Math.max(bounds[1], bounds[3]))
      const [bx, by] = this.toPixel(Math.max(bounds[0], bounds[2]), Math.min(bounds[1], bounds[3]))
      box = [Math.ceil(ax - 0.5), Math.ceil(ay - 0.5), Math.floor(bx - 0.5), Math.floor(by - 0.5)]
    }
    return floodFill(this.data, this.width, this.height, Math.floor(px), Math.floor(py), color, box)
  }

  getPixel(x, y) {
    if (!this.data) return this.background
    const [px, py] = this.toPixel(x, y)
    const X = Math.floor(px), Y = Math.floor(py)
    if (X < 0 || Y < 0 || X >= this.width || Y >= this.height) return this.background
    const i = (Y * this.width + X) * 4
    return makeColor(this.data[i], this.data[i + 1], this.data[i + 2])
  }

  text(x, y, str, style = {}) {
    this.ops.push({ op: 'text', x, y, str: String(str), ...style })
  }

  measureText(str, style = {}) {
    const size = style.size || 13
    const lines = String(str).split(/¶|\n/)
    return { width: Math.max(...lines.map((l) => approxTextWidth(l, size))), height: Math.round(size * 1.25) * lines.length }
  }

  image(img, x, y, style = {}) {
    this.ops.push({ op: 'image', img, x, y, ...style })
  }

  stamp(shape, x, y, style = {}) {
    this.ops.push({ op: 'stamp', shape, x, y, ...style })
  }

  drawTurtles(turtles) {
    this.lastTurtles = turtles.length
  }
}
