// "Pole tekstowe" — the output memo of the main window. Owner: ui.
//
//   const memo = new Memo(element)
//   memo.print(text)        whole line (continues a pending `wpisz` line)
//   memo.type(text)         text without newline (`wpisz`)
//   memo.error(text)        red error block (two lines: message + hint)
//   memo.echo(cmd)          echo of a command from the command line (`? np 100`)
//   memo.info(text)         grey UI notice
//   memo.clear()
//   await memo.readLine(prompt, signal)  inline input in the memo; rejects on abort
import { AbortSignal as LogoAbort } from '../core/errors.js'

const MAX_LINES = 5000

export class Memo {
  constructor(el) {
    this.el = el
    this.openLine = null
    this.redirect = null // (text, newline) => void   — `piszDo` support
  }

  _scroll() {
    const el = this.el
    // keep the bottom visible unless the user scrolled up to read
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80 || this._forceScroll) el.scrollTop = el.scrollHeight
  }

  _trim() {
    while (this.el.childElementCount > MAX_LINES) this.el.firstElementChild.remove()
  }

  _line(cls) {
    const d = document.createElement('div')
    d.className = 'memo-line' + (cls ? ' ' + cls : '')
    this.el.appendChild(d)
    this._trim()
    return d
  }

  type(text) {
    if (this.redirect) return this.redirect(String(text), false)
    if (!this.openLine) this.openLine = this._line('out')
    this.openLine.textContent += String(text)
    this._scroll()
  }

  /** Raw output: '\n' ends a line, text after the last '\n' stays open (io.write for pisz/wpisz). */
  write(text) {
    const parts = String(text).split('\n')
    const tail = parts.pop()
    for (const p of parts) this.print(p)
    if (tail) this.type(tail)
  }

  print(text = '') {
    if (this.redirect) return this.redirect(String(text), true)
    const s = String(text)
    if (this.openLine) {
      this.openLine.textContent += s
      this.openLine = null
    } else {
      const d = this._line('out')
      d.textContent = s
    }
    this._scroll()
  }

  error(text) {
    this.openLine = null
    const d = this._line('err')
    const [first, ...rest] = String(text).split('\n')
    const msg = document.createElement('span')
    msg.className = 'err-msg'
    msg.textContent = first
    d.appendChild(msg)
    if (rest.length) {
      const hint = document.createElement('span')
      hint.className = 'err-hint'
      hint.textContent = rest.join('\n')
      d.appendChild(hint)
    }
    this._forceScroll = true
    this._scroll()
    this._forceScroll = false
  }

  echo(cmd) {
    this.openLine = null
    const lines = String(cmd).split('\n')
    lines.forEach((l, i) => {
      const d = this._line('echo')
      d.dataset.prompt = i === 0 ? '?' : '>'
      d.textContent = l
    })
    this._forceScroll = true
    this._scroll()
    this._forceScroll = false
  }

  info(text) {
    this.openLine = null
    const d = this._line('info')
    d.textContent = String(text)
    this._scroll()
  }

  clear() {
    this.el.textContent = ''
    this.openLine = null
  }

  /** Plain text of the memo (for "Kopiuj"). */
  text() {
    return [...this.el.children].map((d) => (d.classList.contains('echo') ? d.dataset.prompt + ' ' : '') + d.textContent).join('\n')
  }

  /**
   * Inline prompt. Resolves with the typed line; rejects with LogoAbort when `signal` aborts.
   * `kind` = 'line' (Enter) or 'char' (first key).
   */
  readLine(prompt = '', signal, kind = 'line') {
    return new Promise((resolve, reject) => {
      const line = this.openLine || this._line('out')
      this.openLine = null
      line.classList.add('reading')
      const p = document.createElement('span')
      p.className = 'read-prompt'
      p.textContent = prompt
      const input = document.createElement('input')
      input.className = 'read-input'
      input.type = 'text'
      input.autocomplete = 'off'
      input.spellcheck = false
      input.setAttribute('aria-label', prompt ? `Odpowiedź: ${prompt}` : 'Odpowiedź')
      line.append(p, input)
      this._forceScroll = true
      this._scroll()
      this._forceScroll = false
      const prevFocus = document.activeElement
      input.focus()
      const finish = (value, err) => {
        input.removeEventListener('keydown', onKey)
        signal?.removeEventListener?.('abort', onAbort)
        const echo = document.createElement('span')
        echo.className = 'read-answer'
        echo.textContent = err ? '' : value
        input.replaceWith(echo)
        line.classList.remove('reading')
        if (prevFocus && prevFocus !== document.body && prevFocus.isConnected) prevFocus.focus?.()
        if (err) reject(err)
        else resolve(value)
      }
      const onKey = (e) => {
        if (e.key === 'Escape') return // global handler presses Stop -> signal aborts -> finish
        e.stopPropagation()
        if (kind === 'char') {
          if (e.key.length === 1 || e.key === 'Enter') {
            e.preventDefault()
            finish(e.key === 'Enter' ? '\n' : e.key)
          }
          return
        }
        if (e.key === 'Enter') { e.preventDefault(); finish(input.value) }
      }
      const onAbort = () => finish('', new LogoAbort())
      input.addEventListener('keydown', onKey)
      if (signal) {
        if (signal.aborted) return onAbort()
        signal.addEventListener('abort', onAbort, { once: true })
      }
    })
  }
}
