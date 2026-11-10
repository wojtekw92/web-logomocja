// CanvasSurface — browser drawing backend. Owner: graphics.
// Two stacked canvases: `canvas` (drawing layer = page background + drawings) and `overlay`
// (turtles only, redrawn on each render). HiDPI aware: backing stores are width*dpr × height*dpr,
// the contexts are scaled by dpr, all API coordinates are Logo coordinates.
// No top-level DOM access, so this module can be imported (but not instantiated) in Node.
import { makeColor, WHITE } from './colors.js'
import { logoToPixel, pixelToLogo, floodFill, penDash, ellipsePoints, rectToPixelBox } from './surface.js'
import { drawShape } from './shapes.js'

export class CanvasSurface {
  /**
   * @param {{container?: HTMLElement, canvas?: HTMLCanvasElement, overlay?: HTMLCanvasElement,
   *          width?: number, height?: number, dpr?: number}} opts
   * If `container` is given (and no canvases), two absolutely positioned canvases are created in it.
   */
  constructor({ container, canvas, overlay, width = 796, height = 499, dpr } = {}) {
    const doc = globalThis.document
    if (!canvas) {
      canvas = doc.createElement('canvas')
      canvas.className = 'logo-drawing'
      if (container) container.appendChild(canvas)
    }
    if (!overlay) {
      overlay = doc.createElement('canvas')
      overlay.className = 'logo-overlay'
      if (container) container.appendChild(overlay)
    }
    if (container) {
      if (!container.style.position) container.style.position = 'relative'
      for (const c of [canvas, overlay]) { c.style.position = 'absolute'; c.style.left = '0'; c.style.top = '0' }
      overlay.style.pointerEvents = 'none'
    }
    this.canvas = canvas
    this.overlay = overlay
    this.container = container
    this.dpr = dpr || globalThis.devicePixelRatio || 1
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })
    this.octx = overlay.getContext('2d')
    this.background = WHITE
    this.ops = null // set to [] to record ops (debugging)
    this.resize(width, height)
  }

  _rec(o) { if (this.ops) this.ops.push(o) }

  toPixel(x, y) { return logoToPixel(x, y, this.width, this.height) }
  /** Client (mouse event) coordinates → logo coordinates. */
  clientToLogo(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect()
    const sx = r.width ? this.width / r.width : 1, sy = r.height ? this.height / r.height : 1
    return pixelToLogo((clientX - r.left) * sx, (clientY - r.top) * sy, this.width, this.height)
  }

  resize(w, h) {
    this.width = Math.max(1, Math.round(w))
    this.height = Math.max(1, Math.round(h))
    const d = this.dpr
    for (const c of [this.canvas, this.overlay]) {
      c.width = Math.round(this.width * d)
      c.height = Math.round(this.height * d)
      c.style.width = this.width + 'px'
      c.style.height = this.height + 'px'
    }
    if (this.container) { this.container.style.width = this.width + 'px'; this.container.style.height = this.height + 'px' }
    this.ctx.setTransform(d, 0, 0, d, 0, 0)
    this.octx.setTransform(d, 0, 0, d, 0, 0)
    this.clear(this.background)
  }

  setBackground(color) { this.background = color }

  clear(color = this.background) {
    this._rec({ op: 'clear', color })
    const c = this.ctx
    c.save()
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.globalCompositeOperation = 'source-over'
    c.fillStyle = color.css
    c.fillRect(0, 0, this.canvas.width, this.canvas.height)
    c.restore()
  }

  _stroke(c, { color, width = 1, mode = 'paint', background, pattern = 0, dashOffset = 0 }) {
    c.lineWidth = width
    c.lineCap = width > 5 ? 'round' : 'square'
    c.lineJoin = 'round'
    c.strokeStyle = (mode === 'erase' ? (background || this.background) : color).css
    c.setLineDash(width <= 1 ? penDash(pattern) : [])
    c.lineDashOffset = dashOffset
  }

  /**
   * Apply XOR pen ('odwr') for a path: draw the path into a mask on an offscreen canvas, then
   * swap pen/background colours pixel by pixel inside its bounding box.
   */
  _reverse(pathFn, style, bbox) {
    const d = this.dpr
    const pad = Math.ceil((style.width || 1) / 2) + 2
    const x0 = Math.max(0, Math.floor((bbox[0] - pad) * d)), y0 = Math.max(0, Math.floor((bbox[1] - pad) * d))
    const x1 = Math.min(this.canvas.width, Math.ceil((bbox[2] + pad) * d)), y1 = Math.min(this.canvas.height, Math.ceil((bbox[3] + pad) * d))
    const w = x1 - x0, h = y1 - y0
    if (w <= 0 || h <= 0) return
    const m = globalThis.document.createElement('canvas')
    m.width = w; m.height = h
    const mc = m.getContext('2d', { willReadFrequently: true })
    mc.setTransform(d, 0, 0, d, -x0, -y0)
    if (this._clipRect) { const r = this._clipRect; mc.beginPath(); mc.rect(r[0], r[1], r[2], r[3]); mc.clip() }
    this._stroke(mc, { ...style, mode: 'paint', color: makeColor(0, 0, 0) })
    mc.beginPath(); pathFn(mc); mc.stroke()
    const mask = mc.getImageData(0, 0, w, h).data
    const img = this.ctx.getImageData(x0, y0, w, h)
    const a = img.data, p = style.color, b = style.background || this.background
    for (let i = 0; i < a.length; i += 4) {
      if (mask[i + 3] < 128) continue
      const r = a[i], g = a[i + 1], bl = a[i + 2]
      if (r === p.r && g === p.g && bl === p.b) { a[i] = b.r; a[i + 1] = b.g; a[i + 2] = b.b }
      else if (r === b.r && g === b.g && bl === b.b) { a[i] = p.r; a[i + 1] = p.g; a[i + 2] = p.b }
      else { a[i] = r ^ p.r ^ b.r; a[i + 1] = g ^ p.g ^ b.g; a[i + 2] = bl ^ p.b ^ b.b }
      a[i + 3] = 255
    }
    this.ctx.putImageData(img, x0, y0)
  }

  line(x1, y1, x2, y2, style = {}) {
    this._rec({ op: 'line', x1, y1, x2, y2, ...style })
    if (style.pattern === 6) return
    const [a, b] = this.toPixel(x1, y1), [e, f] = this.toPixel(x2, y2)
    const width = style.width || 1
    if (a === e && b === f) {
      // zero-length move (np 0 / pkt): a dot of pen width
      if (style.mode === 'reverse') {
        this._reverse((c) => { c.moveTo(a - 0.01, b); c.lineTo(a + 0.01, b) }, { ...style, width: Math.max(1, width) }, [a, b, a, b])
        return
      }
      const c = this.ctx
      c.fillStyle = (style.mode === 'erase' ? (style.background || this.background) : style.color).css
      if (width <= 2) c.fillRect(Math.floor(a), Math.floor(b), Math.max(1, Math.round(width)), Math.max(1, Math.round(width)))
      else { c.beginPath(); c.arc(a, b, width / 2, 0, Math.PI * 2); c.fill() }
      return
    }
    if (style.mode === 'reverse') {
      this._reverse((c) => { c.moveTo(a, b); c.lineTo(e, f) }, style, [Math.min(a, e), Math.min(b, f), Math.max(a, e), Math.max(b, f)])
      return
    }
    const c = this.ctx
    c.save()
    this._stroke(c, style)
    c.beginPath(); c.moveTo(a, b); c.lineTo(e, f); c.stroke()
    c.restore()
  }

  _path(c, points, closed) {
    points.forEach(([x, y], i) => { const [px, py] = this.toPixel(x, y); i ? c.lineTo(px, py) : c.moveTo(px, py) })
    if (closed) c.closePath()
  }

  polygon(points, style = {}) {
    this._rec({ op: 'polygon', points, ...style })
    if (!points.length) return
    const c = this.ctx
    c.save()
    if (style.fillColor) { c.fillStyle = style.fillColor.css; c.beginPath(); this._path(c, points, true); c.fill() }
    if (style.color) { this._stroke(c, style); c.beginPath(); this._path(c, points, true); c.stroke() }
    c.restore()
  }

  ellipse(x, y, rx, ry, style = {}) {
    this._rec({ op: 'ellipse', x, y, rx, ry, ...style })
    const { start = 0, end = 360 } = style
    const full = Math.abs(end - start) >= 360
    const pts = ellipsePoints(x, y, rx, ry, style)
    if (!pts.length) return
    const c = this.ctx
    c.save()
    if (style.fillColor) {
      c.fillStyle = style.fillColor.css
      c.beginPath(); this._path(c, full ? pts : [[x, y], ...pts], true); c.fill()
    }
    if (style.color) {
      if (style.mode === 'reverse') {
        const px = pts.map(([px0, py0]) => this.toPixel(px0, py0))
        const xs = px.map((p) => p[0]), ys = px.map((p) => p[1])
        this._reverse((mc) => px.forEach(([u, v], i) => (i ? mc.lineTo(u, v) : mc.moveTo(u, v))), style,
          [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
      } else {
        this._stroke(c, style)
        c.beginPath(); this._path(c, pts, false); c.stroke()
      }
    }
    c.restore()
  }

  arc(x, y, r, start, end, style = {}) { this.ellipse(x, y, r, r, { ...style, start, end }) }

  fill(x, y, color, { bounds } = {}) {
    this._rec({ op: 'fill', x, y, color, bounds })
    const d = this.dpr
    const [px, py] = this.toPixel(x, y)
    const W = this.canvas.width, H = this.canvas.height
    let box
    if (bounds) {
      const [ax, ay] = this.toPixel(Math.min(bounds[0], bounds[2]), Math.max(bounds[1], bounds[3]))
      const [bx, by] = this.toPixel(Math.max(bounds[0], bounds[2]), Math.min(bounds[1], bounds[3]))
      box = [Math.floor(ax * d), Math.floor(ay * d), Math.ceil(bx * d) - 1, Math.ceil(by * d) - 1]
    }
    const img = this.ctx.getImageData(0, 0, W, H)
    const n = floodFill(img.data, W, H, Math.floor(px * d), Math.floor(py * d), color, box)
    if (n) this.ctx.putImageData(img, 0, 0)
    return n
  }

  getPixel(x, y) {
    const [px, py] = this.toPixel(x, y)
    const d = this.dpr
    const X = Math.floor(px * d), Y = Math.floor(py * d)
    if (X < 0 || Y < 0 || X >= this.canvas.width || Y >= this.canvas.height) return this.background
    const p = this.ctx.getImageData(X, Y, 1, 1).data
    return makeColor(p[0], p[1], p[2])
  }

  _font({ font = 'sans-serif', size = 13, bold, italic } = {}) {
    return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${/[\s,]/.test(font) && !/["']/.test(font) ? `"${font}"` : font}`
  }

  text(x, y, str, style = {}) {
    this._rec({ op: 'text', x, y, str, ...style })
    const c = this.ctx
    const [px, py] = this.toPixel(x, y)
    const size = style.size || 13
    c.save()
    c.translate(px, py)
    c.rotate(((style.heading || 0) * Math.PI) / 180)
    c.font = this._font(style)
    c.fillStyle = (style.color || { css: '#000' }).css
    c.textBaseline = 'alphabetic'
    const lines = String(str).split(/¶|\r?\n/)
    lines.forEach((ln, i) => {
      const yy = i * Math.round(size * 1.25)
      c.fillText(ln, 0, yy)
      if (style.underline || style.strike) {
        const w = c.measureText(ln).width
        c.fillRect(0, yy + (style.underline ? 2 : -Math.round(size * 0.3)), w, Math.max(1, size / 13))
      }
    })
    c.restore()
  }

  measureText(str, style = {}) {
    const c = this.ctx
    c.save()
    c.font = this._font(style)
    const lines = String(str).split(/¶|\r?\n/)
    const width = Math.max(...lines.map((l) => c.measureText(l).width))
    c.restore()
    return { width, height: Math.round((style.size || 13) * 1.25) * lines.length }
  }

  /** Draw an image (HTMLImageElement/ImageBitmap/canvas) centred at logo (x,y). */
  image(img, x, y, { heading = 0, scale = 1, width, height } = {}) {
    this._rec({ op: 'image', x, y })
    const [px, py] = this.toPixel(x, y)
    const w = (width ?? img.naturalWidth ?? img.width) * scale
    const h = (height ?? img.naturalHeight ?? img.height) * scale
    const c = this.ctx
    c.save(); c.translate(px, py); c.rotate((heading * Math.PI) / 180)
    c.drawImage(img, -w / 2, -h / 2, w, h)
    c.restore()
  }

  /** stempluj — draw a turtle shape on the drawing layer. */
  stamp(shape, x, y, opts = {}) {
    this._rec({ op: 'stamp', x, y })
    const [px, py] = this.toPixel(x, y)
    drawShape(this.ctx, shape, { ...opts, x: px, y: py })
  }

  /** Redraw the overlay with the given (visible) turtles. */
  drawTurtles(turtles) {
    const c = this.octx
    c.save()
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, this.overlay.width, this.overlay.height)
    c.restore()
    for (const t of turtles) {
      const [px, py] = this.toPixel(t.x, t.y)
      drawShape(c, t.currentShape, { x: px, y: py, heading: t.heading, scale: t.shapeScale, frame: t.frame, color: t.shapeColor || undefined })
    }
  }

  /**
   * Run fn() with drawing limited to the logo rectangle `bounds` (turtle range, §2.5/§2.7).
   * Canvas clipping covers stroke/fill/text/drawImage; the XOR pen clips its mask.
   */
  withClip(bounds, fn) {
    if (!bounds) return fn()
    const [x0, y0, x1, y1] = rectToPixelBox(bounds, this.width, this.height)
    let rect = [x0, y0, Math.max(0, x1 - x0 + 1), Math.max(0, y1 - y0 + 1)]
    const prev = this._clipRect
    if (prev) {
      const l = Math.max(rect[0], prev[0]), t = Math.max(rect[1], prev[1])
      const r = Math.min(rect[0] + rect[2], prev[0] + prev[2]), b = Math.min(rect[1] + rect[3], prev[1] + prev[3])
      rect = [l, t, Math.max(0, r - l), Math.max(0, b - t)]
    }
    const c = this.ctx
    c.save()
    c.beginPath(); c.rect(rect[0], rect[1], rect[2], rect[3]); c.clip()
    this._clipRect = rect
    try { return fn() } finally { this._clipRect = prev; c.restore() }
  }

  /** Data URL of the drawing layer (zapiszTło etc.). */
  toDataURL(type = 'image/png') { return this.canvas.toDataURL(type) }
}
