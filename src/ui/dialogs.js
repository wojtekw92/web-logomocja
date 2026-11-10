// Modal dialogs (komunikat / oknoDialogowe / zapytaj, confirmations). Owner: ui.
// Every function returns a promise that settles on Stop (`signal` abort -> rejects with LogoAbort).
import { AbortSignal as LogoAbort } from '../core/errors.js'

/** Button captions for `(oknoDialogowe tekst tytuł n)`: n = number of buttons or a list of captions. */
export function dialogButtons(n) {
  if (Array.isArray(n)) return n.map(String)
  const k = Math.max(1, Math.min(4, Math.round(Number(n) || 1)))
  return [['OK'], ['Tak', 'Nie'], ['Tak', 'Nie', 'Anuluj'], ['Tak', 'Nie', 'Ponów', 'Anuluj']][k - 1]
}

/**
 * Generic modal. opts: {title, text, buttons: string[], input?: {value, placeholder}, signal}
 * Resolves {button: 1-based index (0 = closed), value}.
 */
export function modal({ title = 'Logomocja', text = '', buttons = ['OK'], input = null, signal = null, html = null } = {}) {
  return new Promise((resolve, reject) => {
    const dlg = document.createElement('dialog')
    dlg.className = 'logo-dialog'
    const form = document.createElement('form')
    form.method = 'dialog'
    const h = document.createElement('h2')
    h.textContent = title
    const body = document.createElement('div')
    body.className = 'dlg-body'
    if (html) body.appendChild(html)
    else body.textContent = String(text).replace(/¶/g, '\n')
    form.append(h, body)
    let field = null
    if (input) {
      field = document.createElement('input')
      field.type = 'text'
      field.className = 'dlg-input'
      field.value = input.value ?? ''
      field.placeholder = input.placeholder ?? ''
      field.autocomplete = 'off'
      form.appendChild(field)
    }
    const row = document.createElement('div')
    row.className = 'dlg-buttons'
    buttons.forEach((cap, i) => {
      const b = document.createElement('button')
      b.type = 'submit'
      b.value = String(i + 1)
      b.textContent = cap
      if (i === 0) b.className = 'primary'
      row.appendChild(b)
    })
    form.appendChild(row)
    dlg.appendChild(form)
    document.body.appendChild(dlg)
    let done = false
    const cleanup = () => {
      done = true
      signal?.removeEventListener?.('abort', onAbort)
      if (dlg.open) dlg.close()
      dlg.remove()
    }
    const onAbort = () => { if (!done) { cleanup(); reject(new LogoAbort()) } }
    dlg.addEventListener('close', () => {
      if (done) return
      const button = Number(dlg.returnValue) || 0
      const value = field ? field.value : undefined
      cleanup()
      resolve({ button, value })
    })
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && field && e.target === field) {
        e.preventDefault()
        dlg.close('1')
      }
      e.stopPropagation()
    })
    if (signal) {
      if (signal.aborted) { cleanup(); reject(new LogoAbort()); return }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    dlg.showModal()
    ;(field || row.firstChild)?.focus()
  })
}

export async function message(text, { title = 'Komunikat', signal } = {}) {
  await modal({ title, text, buttons: ['OK'], signal })
}

export async function dialog(text, { title = 'Logomocja', buttons = 1, signal } = {}) {
  const r = await modal({ title, text, buttons: dialogButtons(buttons), signal })
  return r.button
}

export async function ask(text, { title = 'Pytanie', value = '', signal } = {}) {
  const r = await modal({ title, text, buttons: ['OK', 'Anuluj'], input: { value }, signal })
  return r.button === 1 ? r.value : ''
}

export async function confirm(text, { title = 'Logomocja', yes = 'Tak', no = 'Nie' } = {}) {
  const r = await modal({ title, text, buttons: [yes, no] })
  return r.button === 1
}
