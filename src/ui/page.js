// The page view: CanvasSurface inside a scaled container, input forwarding to the world. Owner: ui.
//
//   const view = new PageView({ wrap, scaler, host, onCoords })
//   view.surface                 CanvasSurface to pass to createLogomocja
//   view.attach(world)           start forwarding pointer/keyboard events, follow page resizes
//   view.fit()                   recompute scale (called automatically on resize)
import { CanvasSurface } from '../graphics/canvasSurface.js'

export class PageView {
  constructor({ wrap, scaler, host, width = 796, height = 499, onCoords = null, onFocusChange = null }) {
    this.wrap = wrap          // flexible area (ResizeObserver)
    this.scaler = scaler      // element with CSS transform
    this.host = host          // container of the canvases (focusable, receives pointer events)
    this.onCoords = onCoords
    this.onFocusChange = onFocusChange
    this.surface = new CanvasSurface({ container: host, width, height })
    this.scale = 1
    this.fitMode = 'fit' // 'fit' | '100'
    this._size = [width, height]
    this.world = null
    this._drag = false
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(() => this.fit())
      this._ro.observe(wrap)
    } else globalThis.addEventListener('resize', () => this.fit())
    this.fit()
  }

  setFitMode(mode) {
    this.fitMode = mode
    this.fit()
  }

  fit() {
    const w = this.surface.width, h = this.surface.height
    const cs = typeof getComputedStyle === 'function' ? getComputedStyle(this.wrap) : null
    const padX = cs ? parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) : 0
    const padY = cs ? parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) : 0
    const avW = this.wrap.clientWidth - padX - 4, avH = this.wrap.clientHeight - padY - 4
    let s = 1
    if (this.fitMode === 'fit' && avW > 0 && avH > 0) s = Math.min(avW / w, avH / h)
    if (!Number.isFinite(s) || s <= 0) s = 1
    s = Math.min(s, 4)
    this.scale = s
    this.scaler.style.width = Math.floor(w * s) + 'px'
    this.scaler.style.height = Math.floor(h * s) + 'px'
    this.host.style.transform = `scale(${s})`
    this.host.style.transformOrigin = '0 0'
    this._size = [w, h]
  }

  /** Called on every world render: follows `ustalRozmiar`. */
  checkSize() {
    if (this.surface.width !== this._size[0] || this.surface.height !== this._size[1]) this.fit()
  }

  toLogo(e) {
    return this.surface.clientToLogo(e.clientX, e.clientY)
  }

  attach(world) {
    this.world = world
    const host = this.host
    const safe = (fn) => {
      try {
        const r = fn()
        if (r && typeof r.catch === 'function') r.catch((err) => console.error(err))
      } catch (err) { console.error(err) }
    }
    const isWidget = (e) => e.target !== host && e.target.closest?.('.widget')
    host.addEventListener('contextmenu', (e) => e.preventDefault())
    host.addEventListener('pointerdown', (e) => {
      if (isWidget(e)) return
      host.focus({ preventScroll: true })
      const [x, y] = this.toLogo(e)
      const button = e.button === 2 ? 2 : e.button === 1 ? 1 : 0
      // capture so dragging a turtle keeps sending moves outside the page
      this._drag = true
      try { host.setPointerCapture(e.pointerId) } catch { /* ignore */ }
      safe(() => world.pointer('down', x, y, button))
    })
    host.addEventListener('pointerup', (e) => {
      if (isWidget(e) && !this._drag) return
      const [x, y] = this.toLogo(e)
      const button = e.button === 2 ? 2 : e.button === 1 ? 1 : 0
      this._drag = false
      safe(() => world.pointer('up', x, y, button))
    })
    host.addEventListener('pointermove', (e) => {
      const [x, y] = this.toLogo(e)
      this.onCoords?.(x, y)
      if (isWidget(e) && !this._drag) return
      safe(() => world.pointer('move', x, y, 0))
      // gdyMyszWchodzi / gdyMyszWychodzi / gdyCiągnięty are derived from gdyRuchMyszy by prims/objects.js
    })
    host.addEventListener('pointerleave', () => this.onCoords?.(null, null))
    host.addEventListener('click', (e) => {
      if (isWidget(e)) return
      const [x, y] = this.toLogo(e)
      safe(() => world.pointer('click', x, y, 0))
    })
    host.addEventListener('dblclick', (e) => {
      if (isWidget(e)) return
      const [x, y] = this.toLogo(e)
      safe(() => world.pointer('dblclick', x, y, 0))
    })
    host.addEventListener('focus', () => this.onFocusChange?.(true))
    host.addEventListener('blur', () => this.onFocusChange?.(false))
  }
}

/**
 * Key passed to world.key / gdyKlawisz (pure): KeyboardEvent.key unchanged, as docs/WIDGETS.md
 * specifies ('a', 'A', ' ', 'Enter', 'ArrowLeft', 'Escape', 'F5', …).
 */
export function keyName(e) {
  return e.key === 'Spacebar' ? ' ' : e.key
}
