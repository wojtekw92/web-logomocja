// localStorage wrapper: every access in try/catch (private mode, blocked storage). Owner: ui.
const PREFIX = 'logomocja.'

export const store = {
  get(key, fallback = null) {
    try {
      const v = globalThis.localStorage?.getItem(PREFIX + key)
      return v === null || v === undefined ? fallback : v
    } catch { return fallback }
  },
  set(key, value) {
    try { globalThis.localStorage?.setItem(PREFIX + key, value); return true } catch { return false }
  },
  remove(key) {
    try { globalThis.localStorage?.removeItem(PREFIX + key) } catch { /* ignore */ }
  },
  getJSON(key, fallback = null) {
    const v = this.get(key)
    if (v === null) return fallback
    try { return JSON.parse(v) } catch { return fallback }
  },
  setJSON(key, value) {
    try { return this.set(key, JSON.stringify(value)) } catch { return false }
  },
}

/** Trigger a browser download of text or a Blob. */
export function download(name, data, type = 'text/plain;charset=utf-8') {
  const blob = data instanceof Blob ? data : new Blob([data], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Ask the user for a file. Resolves {name, bytes: Uint8Array} or null when cancelled. */
export function pickFile(accept = '') {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (accept) input.accept = accept
    input.style.display = 'none'
    document.body.appendChild(input)
    let settled = false
    const done = (v) => { if (!settled) { settled = true; input.remove(); resolve(v) } }
    input.addEventListener('change', async () => {
      const f = input.files?.[0]
      if (!f) return done(null)
      done({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), file: f })
    })
    input.addEventListener('cancel', () => done(null))
    input.click()
  })
}
