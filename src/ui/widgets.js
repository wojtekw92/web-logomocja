// Renders Imagine UI objects (Przycisk, Suwak, PoleTekstowe) as absolutely positioned DOM controls
// over the page. Diffed on every render: elements are created once per object and only changed
// properties are written, so focus and slider drags survive. Owner: ui.
import { widgetModel, widgetRect, listWidgets } from './widgetModel.js'

export class WidgetLayer {
  constructor({ layer, bar = null, world, interp }) {
    this.layer = layer
    this.bar = bar
    this.world = world
    this.interp = interp
    this.els = new Map() // obj -> {el, model, input}
  }

  fire(obj, event, extra = {}) {
    try {
      const r = this.world.dispatchEvent(event, { target: obj, ...extra })
      if (r && typeof r.catch === 'function') r.catch((e) => console.error(e))
    } catch (e) { console.error(e) }
  }

  create(obj, m) {
    let el, input = null
    if (m.kind === 'button') {
      el = document.createElement('button')
      el.type = 'button'
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.fire(obj, 'gdyWciśnięty') })
      el.addEventListener('pointerup', (e) => { e.stopPropagation(); this.fire(obj, 'gdyPuszczony') })
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.fire(obj, 'gdyWciśnięty'); this.fire(obj, 'gdyPuszczony') }
      })
    } else if (m.kind === 'slider') {
      el = document.createElement('div')
      input = document.createElement('input')
      input.type = 'range'
      const out = document.createElement('output')
      el.append(input, out)
      input.addEventListener('pointerdown', (e) => e.stopPropagation())
      input.addEventListener('input', () => {
        const v = Number(input.value)
        out.textContent = fmt(v)
        // prims/objects.js stores data.value into the slider, then runs the handler
        this.fire(obj, 'gdyZmieniasz', { value: v })
      })
      input.addEventListener('change', () => this.fire(obj, 'gdyPoZmianie', { value: Number(input.value) }))
    } else if (m.kind === 'textbox') {
      el = document.createElement('div')
      input = document.createElement('textarea')
      input.spellcheck = false
      el.appendChild(input)
      input.addEventListener('pointerdown', (e) => e.stopPropagation())
      input.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation() })
      input.addEventListener('change', () => this.fire(obj, 'gdyPoZmianie', { value: input.value }))
    } else {
      el = document.createElement('div') // 'pane' / 'label'
    }
    // a value the program set while the control had focus is shown once focus leaves it
    if (input) input.addEventListener('blur', () => queueMicrotask(() => { try { this.update() } catch (e) { console.error(e) } }))
    el.classList.add('widget', 'widget-' + m.kind)
    el.dataset.name = m.name
    el.title = m.name
    this.layer.appendChild(el)
    const rec = { el, input, model: {} }
    this.els.set(obj, rec)
    return rec
  }

  /** Button bar (ustalPrzyciski / pokażPrzyciski): world.buttonBar = {visible, buttons:[{caption, list}]}. */
  updateButtonBar() {
    const bar = this.bar
    if (!bar) return
    const bb = this.world.buttonBar
    const visible = !!(bb && bb.visible && bb.buttons?.length)
    bar.hidden = !visible
    if (!visible) return
    const key = bb.buttons.map((b) => b.caption).join('\u0001')
    if (key === this._barKey) return
    this._barKey = key
    bar.replaceChildren(...bb.buttons.map((b, index) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.textContent = String(b.caption)
      el.addEventListener('click', () => {
        try { this.world.dispatchEvent('przyciskPaska', { index }) } catch (e) { console.error(e) }
      })
      return el
    }))
  }

  update() {
    this.updateButtonBar()
    const world = this.world
    const pw = world.page?.width ?? 796, ph = world.page?.height ?? 499
    const seen = new Set()
    for (const obj of listWidgets(world)) {
      const m = widgetModel(obj)
      if (!m) continue
      if (m.page && world.page?.name && m.page !== world.page.name) continue
      seen.add(obj)
      const rec = this.els.get(obj) || this.create(obj, m)
      const old = rec.model
      const el = rec.el
      if (m.visible !== old.visible) el.hidden = !m.visible
      const r = widgetRect(m, pw, ph)
      const key = `${r.left},${r.top},${r.width},${r.height}`
      if (key !== old._rect) {
        Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' })
      }
      m._rect = key
      if (m.background !== old.background) el.style.background = m.background
      if (m.color !== old.color) el.style.color = m.color
      if (m.kind === 'button' && m.caption !== old.caption) el.textContent = m.caption
      if (m.kind === 'slider') {
        const inp = rec.input
        if (m.min !== old.min) inp.min = m.min
        if (m.max !== old.max) inp.max = m.max
        if (m.step !== old.step) inp.step = m.step
        if (m.vertical !== old.vertical) el.classList.toggle('vertical', m.vertical)
        // compare with what the DOM shows (not the last model): a change made while the control had
        // focus is written as soon as it loses focus
        if (String(m.value) !== inp.value && document.activeElement !== inp) inp.value = m.value
        if (m.value !== old.value) el.lastChild.textContent = fmt(m.value)
      }
      if (m.kind === 'textbox' && String(m.contents ?? '') !== rec.input.value && document.activeElement !== rec.input) rec.input.value = m.contents
      if (m.kind === 'label' && m.caption !== old.caption) el.textContent = m.contents || m.caption
      rec.model = m
    }
    for (const [obj, rec] of this.els) if (!seen.has(obj)) { rec.el.remove(); this.els.delete(obj) }
  }
}

function fmt(v) {
  const n = Number(v)
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}
