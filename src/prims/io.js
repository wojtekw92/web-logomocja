// Primitives module: io — PRIMITYWY.md §11 (Wejście/wyjście) and `czyśćTekst` from §4.
// Owner: prims-control. See docs/ARCHITEKTURA.md and docs/API_NOTES.md.
//
// io interface (from createLogomocja): { print(text), printError(text, err), readLine(prompt), clearText() }.
// Optional extras this module uses when the UI provides them (all may be absent):
//   io.write(text)               raw output without implied newline ('\n' ends a line). Without it
//                                `wpisz` text is buffered and prepended to the next printed line.
//   io.readChar()                -> Promise<string>  key name (czytajZnak; otherwise world.keys)
//   io.readKey()                 -> Promise<string>  key name (czytajKlawisz; falls back to readChar)
//   io.dialog(text, title, n)    -> Promise<number>  (oknoDialogowe)
//   io.message(text)             -> Promise          (komunikat)
//   io.ask(text)                 -> Promise<string>  (zapytaj)
//   io.loadText(name) / io.saveText(name, text)       (ładujTekst/zapiszTekst, piszDo files)
//   io.loadProject(name) / io.saveProject(name)       (ładujProjekt/zapiszProjekt)
//   io.openUrl(url)                                   (pokażDokument)
//   io.edit(name)                                     (redaguj — in control.js)
import { LogoError } from '../core/errors.js'
import { normName, formatValue, isNumeric, toNumber, badInput, fromBool } from '../core/values.js'
import { readList } from '../core/lexer.js'
import { stateOf, wordArg, numArg, now } from './control.js'

const g = globalThis

// ------------------------------------------------------------------ output

function flatten(v) {
  if (!Array.isArray(v)) return formatValue(v)
  return v.map(flatten).filter((s) => s !== '').join(' ')
}

const joinTop = (args) => args.map((a) => formatValue(a, { top: true })).join(' ')
const joinShow = (args) => args.map((a) => formatValue(a)).join(' ')

/** Single output path for pisz/wpisz/pokaż/piszWiersz (handles piszDo and wpisz buffering). */
export async function emit(ctx, text, newline = true) {
  const interp = ctx.interp
  const st = stateOf(interp)
  const io = interp.io || {}
  const red = st.printTo
  if (red) {
    const chunk = text + (newline ? '\n' : '')
    if (red.kind === 'object') {
      const o = red.target
      if (typeof o.appendText === 'function') return void (await o.appendText(chunk))
      if (typeof o.printText === 'function') return void (await o.printText(chunk))
      const old = typeof o.getSetting === 'function' ? o.getSetting('zawartość') : undefined
      const cur = old === undefined ? '' : formatValue(old, { top: true })
      if (typeof o.setSetting === 'function' && (await o.setSetting('zawartość', cur + chunk.replace(/\n/g, '¶')))) return
      o.vars?.set?.('zawartość', cur + chunk)
      return
    }
    red.buffer += chunk
    if (red.kind === 'file') st.files.set(normName(red.target), red.buffer)
    return
  }
  if (typeof io.write === 'function') {
    io.write(text + (newline ? '\n' : ''))
    return
  }
  if (newline) {
    const line = st.pending + text
    st.pending = ''
    io.print?.(line)
  } else {
    // keep complete lines flowing, buffer the unfinished tail
    const parts = (st.pending + text).split('\n')
    st.pending = parts.pop()
    for (const p of parts) io.print?.(p)
  }
}

// ------------------------------------------------------------------ text storage

const LS_PREFIX = 'logomocja:plik:'

function lsGet(name) {
  try {
    return g.localStorage?.getItem?.(LS_PREFIX + name) ?? null
  } catch {
    return null
  }
}

function lsSet(name, text) {
  try {
    g.localStorage?.setItem?.(LS_PREFIX + name, text)
    return true
  } catch {
    return false
  }
}

export async function saveTextFile(ctx, name, text) {
  const interp = ctx.interp
  stateOf(interp).files.set(normName(name), text)
  const io = interp.io || {}
  if (typeof io.saveText === 'function') return void (await io.saveText(name, text))
  lsSet(name, text)
}

export async function loadTextFile(ctx, name) {
  const interp = ctx.interp
  const io = interp.io || {}
  if (typeof io.loadText === 'function') {
    const t = await io.loadText(name)
    if (typeof t === 'string') return t
  }
  const mem = stateOf(interp).files.get(normName(name))
  if (mem !== undefined) return mem
  const ls = lsGet(name)
  if (ls !== null) return ls
  throw badInput(undefined, name)
}

function flushRedirect(ctx) {
  const st = stateOf(ctx.interp)
  const red = st.printTo
  st.printTo = null
  if (!red) return
  if (red.kind === 'file') return saveTextFile(ctx, red.target, red.buffer)
  if (red.kind === 'clipboard') {
    try {
      return g.navigator?.clipboard?.writeText?.(red.buffer)?.catch?.(() => {})
    } catch {
      /* no clipboard */
    }
  }
}

/** Take the unfinished `wpisz` text (shown as part of an input prompt). */
function takePending(ctx) {
  const st = stateOf(ctx.interp)
  const p = st.pending
  st.pending = ''
  return p
}

// ------------------------------------------------------------------ keyboard

/** Next key press. `asName` (czytajKlawisz) prefers io.readKey; both return the key name. */
async function nextKey(ctx, asName = false) {
  const interp = ctx.interp
  const io = interp.io || {}
  const pend = takePending(ctx)
  if (pend && typeof io.write !== 'function') io.print?.(pend)
  if (asName && typeof io.readKey === 'function') return String(await io.readKey())
  if (typeof io.readChar === 'function') return String(await io.readChar())
  const keys = interp.world?.keys
  if (!keys) throw new LogoError('Brak klawiatury')
  while (!keys.buffer.length) await interp.sleep(16, ctx)
  return String(keys.buffer.shift())
}

// ------------------------------------------------------------------ sound

let audioCtx = null
function audio() {
  if (audioCtx) return audioCtx
  const AC = g.AudioContext || g.webkitAudioContext
  if (!AC) return null
  try {
    audioCtx = new AC()
  } catch {
    audioCtx = null
  }
  return audioCtx
}

function beep(midi, ms) {
  const ac = audio()
  if (!ac) return
  try {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'square'
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12)
    gain.gain.value = 0.08
    osc.connect(gain).connect(ac.destination)
    const t = ac.currentTime
    osc.start(t)
    osc.stop(t + ms / 1000)
  } catch {
    /* ignore audio errors */
  }
}

const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, h: 11, b: 10 }

/** Note word -> MIDI number: c d e f g a h (b = ais), suffix is/#/es, optional octave digit (4 = middle). */
export function noteToMidi(w) {
  if (isNumeric(w)) return toNumber(w)
  const m = /^([cdefgahb])(is|es|s|#)?(-?\d)?$/i.exec(String(w))
  if (!m) return null
  let n = NOTE[m[1].toLowerCase()]
  const acc = (m[2] || '').toLowerCase()
  if (acc === 'is' || acc === '#') n++
  else if (acc === 'es' || acc === 's') n--
  const oct = m[3] === undefined ? 4 : Number(m[3])
  return 12 * (oct + 1) + n
}

async function playNote(ctx, midi, ms) {
  if (midi !== null && ms > 0) beep(midi, ms)
  await ctx.interp.sleep(ms, ctx)
}

// ------------------------------------------------------------------ register

export function register(registry) {
  const def = (names, spec) => registry.define(names, spec)
  const variadic = { arity: 1, minArity: 0, maxArity: Infinity }

  def(['pisz', 'ps', 'print', 'pr'], {
    ...variadic,
    doc: 'pisz wartość — wypisuje bez zewnętrznych nawiasów i przechodzi do nowego wiersza.',
    fn: async (ctx, ...args) => emit(ctx, joinTop(args), true),
  })

  def(['wpisz', 'type'], {
    ...variadic,
    doc: 'wpisz wartość — jak pisz, ale bez nowego wiersza.',
    fn: async (ctx, ...args) => emit(ctx, joinTop(args), false),
  })

  def(['pokaż', 'show', 'sh'], {
    ...variadic,
    doc: 'pokaż wartość — wypisuje z nawiasami listy.',
    fn: async (ctx, ...args) => emit(ctx, joinShow(args), true),
  })

  def(['piszWiersz', 'printLine', 'pl'], {
    ...variadic,
    doc: 'piszWiersz wartość — dane w jednym wierszu, bez żadnych nawiasów.',
    fn: async (ctx, ...args) => emit(ctx, args.map(flatten).join(' '), true),
  })

  def(['czyśćTekst', 'ct', 'clearText'], {
    arity: 0,
    doc: 'czyśćTekst — czyści pole tekstowe.',
    fn: async (ctx) => {
      stateOf(ctx.interp).pending = ''
      ctx.interp.io?.clearText?.()
    },
  })

  // ---------------------------------------------------------------- input

  def(['czytajListę', 'cl', 'readList', 'rl'], {
    arity: 0,
    doc: 'czytajListę — czyta wiersz i zwraca go jako listę.',
    fn: async (ctx) => {
      const io = ctx.interp.io || {}
      const text = await io.readLine?.(takePending(ctx) + 'CL: ')
      ctx.interp.checkAbort(ctx)
      return readList(String(text ?? ''))
    },
  })

  def(['czytajSłowo', 'csw', 'readWord', 'rw'], {
    arity: 0,
    doc: 'czytajSłowo — czyta wiersz i zwraca go jako słowo (albo liczbę).',
    fn: async (ctx) => {
      const io = ctx.interp.io || {}
      const text = String((await io.readLine?.(takePending(ctx))) ?? '')
      ctx.interp.checkAbort(ctx)
      return isNumeric(text) ? toNumber(text) : text
    },
  })

  def(['czytajZnak', 'cz', 'readChar', 'rc'], {
    arity: 0,
    doc: 'czytajZnak — czeka na klawisz i zwraca znak.',
    fn: async (ctx) => {
      const k = await nextKey(ctx)
      if (k === 'Enter' || k === '\n') return '\r' // same code (13) on every path
      if (k === 'Tab') return '\t'
      if (k === 'Backspace') return '\b'
      if (k === 'Escape') return '\x1b'
      return k
    },
  })

  def(['czytajKlawisz', 'readKey'], {
    arity: 0,
    doc: 'czytajKlawisz — czeka na klawisz i zwraca jego nazwę.',
    fn: async (ctx) => nextKey(ctx, true),
  })

  def(['klawisz?', 'key?'], {
    arity: 0,
    doc: 'klawisz? — czy w buforze czeka klawisz.',
    fn: async (ctx) => fromBool(!!ctx.interp.world?.keys?.buffer?.length),
  })

  def(['klawisz', 'key'], {
    arity: 0,
    doc: 'klawisz — znak z bufora bez czekania ("" gdy pusty).',
    fn: async (ctx) => {
      const b = ctx.interp.world?.keys?.buffer
      return b && b.length ? String(b.shift()) : ''
    },
  })

  def(['ostatniKlawisz', 'lastKey'], {
    arity: 0,
    doc: 'ostatniKlawisz — ostatnio naciśnięty klawisz.',
    fn: async (ctx) => String(ctx.interp.world?.keys?.last ?? ''),
  })

  def(['stanMyszy', 'mouseState'], {
    arity: 0,
    doc: 'stanMyszy — stan przycisków myszy (0 brak, 1 lewy, 2 środkowy, 4 prawy; suma).',
    fn: async (ctx) => ctx.interp.world?.mouse?.buttons ?? 0,
  })

  // ---------------------------------------------------------------- dialogs

  def(['oknoDialogowe', 'dialogBox'], {
    arity: 1,
    minArity: 1,
    maxArity: 3,
    doc: '(oknoDialogowe tekst tytuł n) — okno z przyciskami; zwraca numer przycisku.',
    fn: async (ctx, text, title, n) => {
      const io = ctx.interp.io || {}
      const t = formatValue(text, { top: true })
      const tt = title === undefined ? '' : formatValue(title, { top: true })
      const count = n === undefined ? 1 : Math.max(1, Math.round(numArg(n)))
      if (typeof io.dialog === 'function') return toNumber(await io.dialog(t, tt, count))
      if (count >= 2 && typeof g.confirm === 'function') return g.confirm(t) ? 1 : 2
      if (typeof g.alert === 'function') g.alert(t)
      else await emit(ctx, t, true)
      return 1
    },
  })

  def(['komunikat', 'message'], {
    arity: 1,
    doc: 'komunikat tekst — okienko z tekstem i przyciskiem OK.',
    fn: async (ctx, text) => {
      const io = ctx.interp.io || {}
      const t = formatValue(text, { top: true })
      if (typeof io.message === 'function') return void (await io.message(t))
      if (typeof g.alert === 'function') return void g.alert(t)
      await emit(ctx, t, true)
    },
  })

  def(['zapytaj', 'question', 'ask?'], {
    arity: 1,
    extension: true,
    doc: 'zapytaj tekst — okienko z polem tekstowym; zwraca wpisany tekst.',
    fn: async (ctx, text) => {
      const io = ctx.interp.io || {}
      const t = formatValue(text, { top: true })
      let r
      if (typeof io.ask === 'function') r = await io.ask(t)
      else if (typeof g.prompt === 'function') r = g.prompt(t)
      else r = await io.readLine?.(takePending(ctx) + t + ' ')
      ctx.interp.checkAbort(ctx)
      return String(r ?? '')
    },
  })

  def(['powiedz', 'say'], {
    arity: 1,
    doc: 'powiedz tekst — synteza mowy (pl-PL).',
    fn: async (ctx, text) => {
      const synth = g.speechSynthesis
      const U = g.SpeechSynthesisUtterance
      if (!synth || !U) return
      const u = new U(formatValue(text, { top: true }))
      u.lang = 'pl-PL'
      await new Promise((resolve) => {
        u.onend = resolve
        u.onerror = resolve
        const stop = () => {
          try {
            synth.cancel()
          } catch {
            /* ignore */
          }
          resolve()
        }
        ctx.interp.abortSignal?.addEventListener?.('abort', stop, { once: true })
        synth.speak(u)
      })
      ctx.interp.checkAbort(ctx)
    },
  })

  // ---------------------------------------------------------------- time

  def(['data', 'date'], {
    arity: 0,
    doc: 'data — [dzień miesiąc rok].',
    fn: async () => {
      const d = new Date()
      return [d.getDate(), d.getMonth() + 1, d.getFullYear()]
    },
  })

  def(['czas', 'time'], {
    arity: 0,
    doc: 'czas — [godz min sek].',
    fn: async () => {
      const d = new Date()
      return [d.getHours(), d.getMinutes(), d.getSeconds()]
    },
  })

  def(['zegar', 'timer'], {
    arity: 0,
    doc: 'zegar — milisekundy od ostatniego zerujZegar (lub od startu).',
    fn: async (ctx) => Math.floor(now() - stateOf(ctx.interp).timerStart),
  })

  def(['zerujZegar', 'resetTimer', 'resetT'], {
    arity: 0,
    doc: 'zerujZegar — zeruje zegar.',
    fn: async (ctx) => {
      stateOf(ctx.interp).timerStart = now()
    },
  })

  // ---------------------------------------------------------------- sound

  def(['nuta', 'note'], {
    arity: 2,
    doc: 'nuta wysokość czas — wysokość (kod MIDI) i czas w ms.',
    fn: async (ctx, pitch, ms) => {
      const m = noteToMidi(pitch)
      if (m === null) throw badInput(undefined, pitch)
      const d = numArg(ms)
      if (d < 0) throw badInput(undefined, ms)
      await playNote(ctx, m, d)
    },
  })

  def(['pauza', 'rest'], {
    arity: 1,
    doc: 'pauza n — cisza przez n ms.',
    fn: async (ctx, ms) => {
      const d = numArg(ms)
      if (d < 0) throw badInput(undefined, ms)
      await ctx.interp.sleep(d, ctx)
    },
  })

  def(['graj', 'play'], {
    arity: 1,
    doc: 'graj [lista] — elementy: kod MIDI, nuta (c d e f g a h, cis, es, z oktawą c5), p (pauza) albo [nuta ms]. Domyślnie 250 ms.',
    fn: async (ctx, list) => {
      const items = Array.isArray(list) ? list : readList(formatValue(list))
      for (const it of items) {
        let pitch = it
        let ms = 250
        if (Array.isArray(it)) {
          if (!it.length || it.length > 2) throw badInput(undefined, it)
          pitch = it[0]
          if (it.length === 2) ms = numArg(it[1])
        }
        if (typeof pitch === 'string' && ['p', '-', 'pauza', 'r'].includes(normName(pitch))) {
          await ctx.interp.sleep(ms, ctx)
          continue
        }
        const m = noteToMidi(pitch)
        if (m === null) throw badInput(undefined, it)
        await playNote(ctx, m, ms)
      }
    },
  })

  def(['grajPlik', 'playFile'], {
    arity: 1,
    doc: 'grajPlik "adres — odtwarza plik dźwiękowy.',
    fn: async (ctx, url) => {
      const u = wordArg(url)
      if (typeof g.Audio !== 'function') return
      try {
        const a = new g.Audio(u)
        const p = a.play()
        p?.catch?.(() => {})
        ctx.interp.abortSignal?.addEventListener?.('abort', () => a.pause(), { once: true })
      } catch {
        /* ignore */
      }
    },
  })

  // ---------------------------------------------------------------- files & projects

  def(['ładujTekst', 'loadText'], {
    arity: 1,
    doc: 'ładujTekst "nazwa — tekst pliku (przeglądarka: localStorage).',
    fn: async (ctx, name) => loadTextFile(ctx, wordArg(name)),
  })

  def(['zapiszTekst', 'saveText'], {
    arity: 2,
    doc: 'zapiszTekst "nazwa tekst — zapisuje tekst do pliku.',
    fn: async (ctx, name, text) => saveTextFile(ctx, wordArg(name), formatValue(text, { top: true })),
  })

  def(['ładujProjekt', 'loadProject', 'load'], {
    arity: 1,
    doc: 'ładujProjekt "nazwa — wczytuje projekt .lgm albo .imp (linie definiuj\'…).',
    fn: async (ctx, name) => {
      const n = wordArg(name)
      const interp = ctx.interp
      const io = interp.io || {}
      let text
      if (typeof io.loadProject === 'function') {
        text = await io.loadProject(n)
        if (typeof text !== 'string') return // the UI loaded it itself
      } else text = await loadTextFile(ctx, n)
      importProject(interp, text)
      if (interp.procedures.has('starter')) await interp.callProcedure('starter', [], ctx)
    },
  })

  def(['zapiszProjekt', 'save'], {
    arity: 0,
    minArity: 0,
    maxArity: 1,
    extraQuotedArg: true,
    doc: 'zapiszProjekt ("nazwa) — zapisuje procedury jako projekt .lgm.',
    fn: async (ctx, name) => {
      const interp = ctx.interp
      const io = interp.io || {}
      const n = name === undefined ? undefined : wordArg(name)
      if (typeof io.saveProject === 'function') return void (await io.saveProject(n))
      await saveTextFile(ctx, n ?? 'projekt.lgm', projectSource(interp))
    },
  })

  def(['piszDo', 'printTo'], {
    arity: 1,
    doc: 'piszDo cel — przekierowuje pisz do pliku, "schowek albo pola tekstowego; [] przywraca.',
    fn: async (ctx, target) => {
      await flushRedirect(ctx)
      const st = stateOf(ctx.interp)
      if ((Array.isArray(target) && !target.length) || target === '') return
      const t = wordArg(target)
      const k = normName(t)
      if (k === 'schowek' || k === 'clipboard') {
        st.printTo = { kind: 'clipboard', target: t, buffer: '' }
        return
      }
      const obj = ctx.interp.findObject(t, ctx)
      if (obj) {
        st.printTo = { kind: 'object', target: obj, buffer: '' }
        return
      }
      st.printTo = { kind: 'file', target: t, buffer: '' }
    },
  })

  def(['pokażDokument', 'showDocument', 'showDoc', 'browseDocument', 'browseDoc'], {
    arity: 1,
    doc: 'pokażDokument "adres — otwiera adres w nowej karcie.',
    fn: async (ctx, url) => {
      const u = wordArg(url)
      const io = ctx.interp.io || {}
      if (typeof io.openUrl === 'function') return void (await io.openUrl(u))
      if (typeof g.open === 'function') g.open(u, '_blank', 'noopener')
    },
  })
}

/** Source text of all global procedures (project `.lgm` body). */
export function projectSource(interp) {
  return [...interp.procedures.values()].map((d) => d.sourceText || interp.procedureSource(d.name)).join('\n\n') + '\n'
}

/** Define procedures from `.lgm` text (oto … już) or `.imp` text (definiuj'Nazwa |…| lines). */
export function importProject(interp, text) {
  const src = String(text)
  const re = /definiuj'[^\s|]*\s*\|([^|]*)\|/gi
  let m
  let found = false
  while ((m = re.exec(src))) {
    found = true
    interp.defineFromSource(m[1])
  }
  if (!found) interp.defineFromSource(src)
}
