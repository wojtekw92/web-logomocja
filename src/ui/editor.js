// Procedure editor panel ("Procedury"): textarea with all user procedures, live syntax
// highlighting (a <pre> under a transparent textarea), "Zastosuj" defines everything. Owner: ui.
//
// Policy for "Zastosuj": every `oto … już` in the text is (re)defined; global procedures that
// were shown in the editor but are no longer in its text are ERASED (the editor is the
// authoritative view of the main-window procedures, as in Logomocja's procedure pane).
import { highlightHTML } from './highlight.js'
import { normName } from '../core/values.js'
import { parse } from '../core/parser.js'

export class ProcedureEditor {
  constructor({ textarea, pre, status, interp, isPrimitive, onError, onApplied }) {
    this.ta = textarea
    this.pre = pre
    this.status = status
    this.interp = interp
    this.isPrimitive = isPrimitive
    this.onError = onError
    this.onApplied = onApplied
    this.dirty = false
    this.shown = new Set() // normNames of procedures the current text was built from
    this._hlPending = false
    textarea.addEventListener('input', () => { this.setDirty(true); this.scheduleHighlight() })
    textarea.addEventListener('scroll', () => this.syncScroll())
    textarea.addEventListener('keydown', (e) => this.onKey(e))
    interp.onChange(() => { if (!this.dirty) this.refresh(); else this.scheduleHighlight() })
    this.refresh()
  }

  setDirty(d) {
    this.dirty = d
    if (this.status) this.status.textContent = d ? 'Niezastosowane zmiany' : ''
    this.ta.closest('.editor')?.classList.toggle('dirty', d)
  }

  /** Text of every global procedure in definition order. */
  allSource() {
    const parts = []
    this.shown = new Set()
    for (const [key, def] of this.interp.procedures) {
      const src = this.interp.procedureSource(def.name) ?? ''
      this.shown.add(key)
      parts.push(String(src).replace(/\s+$/, ''))
    }
    return parts.join('\n\n') + (parts.length ? '\n' : '')
  }

  refresh() {
    this.ta.value = this.allSource()
    this.setDirty(false)
    this.highlight()
  }

  scheduleHighlight() {
    if (this._hlPending) return
    this._hlPending = true
    requestAnimationFrame(() => { this._hlPending = false; this.highlight() })
  }

  highlight() {
    const procs = this.interp.procedures
    this.pre.innerHTML = highlightHTML(this.ta.value + '\n', {
      isPrimitive: this.isPrimitive,
      isProcedure: (k) => procs.has(k),
    })
    this.syncScroll()
  }

  syncScroll() {
    this.pre.scrollTop = this.ta.scrollTop
    this.pre.scrollLeft = this.ta.scrollLeft
  }

  onKey(e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'Enter')) {
      e.preventDefault()
      this.apply()
      return
    }
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      const { selectionStart: a, selectionEnd: b, value } = this.ta
      this.ta.setRangeText('  ', a, b, 'end')
      this.ta.dispatchEvent(new Event('input'))
      void value
    }
  }

  /** Define everything in the editor. Returns true on success. */
  apply() {
    const text = this.ta.value
    let parsed
    try {
      parsed = parse(text)
    } catch (err) {
      this.onError?.(err)
      return false
    }
    const stray = parsed.bodyLines?.filter((L) => L.items.length) ?? []
    if (stray.length) {
      this.onError?.(new Error(`Edytor procedur: poza „oto … już” jest tekst w wierszu ${stray[0].line} — przenieś go do linii poleceń`))
      return false
    }
    const keep = new Set(parsed.definitions.map((d) => normName(d.name)))
    try {
      for (const d of parsed.definitions) this.interp.defineProcedure(d)
    } catch (err) {
      this.onError?.(err)
      return false
    }
    for (const key of this.shown) {
      if (!keep.has(key)) {
        const def = this.interp.procedures.get(key)
        if (def) this.interp.eraseProcedure(def.name)
      }
    }
    this.refresh()
    this.onApplied?.(parsed.definitions.map((d) => d.name))
    return true
  }

  /** Put a new procedure skeleton at the end and select its name. */
  newProcedure(name = 'nowa') {
    let n = name, i = 1
    const esc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    while (this.interp.procedures.has(normName(n)) || new RegExp(`^\\s*oto\\s+${esc(n)}(\\s|$)`, 'mi').test(this.ta.value)) n = name + ++i
    const prefix = this.ta.value && !this.ta.value.endsWith('\n\n') ? (this.ta.value.endsWith('\n') ? '\n' : '\n\n') : ''
    const at = this.ta.value.length + prefix.length + 4
    this.ta.value += `${prefix}oto ${n}\n  \njuż\n`
    this.ta.focus()
    this.ta.setSelectionRange(at, at + n.length)
    this.setDirty(true)
    this.highlight()
  }
}
