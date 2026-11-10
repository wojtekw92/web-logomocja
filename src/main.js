// Logomocja Web — UI bootstrap. Owner: ui.
// Wires the page view (CanvasSurface), the interpreter facade, the memo ("Pole tekstowe"),
// the command line ("Linia poleceń"), the procedure editor, help, examples, projects and widgets.
//
// io object handed to the interpreter (prims call these via ctx.interp.io; all optional except the
// first four, every promise settles on Stop):
//   print(text)                     one line                     (pisz/pokaż)
//   type(text)                      no newline                   (wpisz)
//   printError(text, err)           red block, 2nd line = hint
//   readLine(prompt) -> string      inline prompt in the memo    (czytajListę/czytajSłowo)
//   readChar() -> string            next key press               (czytajZnak)
//   readKey() -> string             next key press, key name     (czytajKlawisz)
//   clearText()                                                  (czyśćTekst)
//   message(text, title?)                                        (komunikat)
//   dialog(text, title?, n|captions) -> 1-based button number    (oknoDialogowe)
//   ask(text, title?) -> string                                  (zapytaj)
//   setScreenMode('graphics'|'text'|'split')                     (eg/ekranTekstowy/ekranDzielony)
//   fullScreen(on?)  printGraphics()  openUrl(url)
//   setOutput(fn|null)               redirect print/type: fn(text, newline)   (piszDo)
//   downloadText(name, text)  pickTextFile(accept?) -> {name, text}|null   (zapiszTekst/ładujTekst)
//   saveProject(name?)  loadProject(nameOrUrl?)                  (zapiszProjekt/ładujProjekt)
//   pageImage() -> dataURL           drawing layer as PNG          (zapiszTło)
import { createLogomocja } from './logomocja.js'
import { needsMoreInput, parse } from './core/parser.js'
import { normName } from './core/values.js'
import { AbortSignal as LogoAbort } from './core/errors.js'
import { PageView, keyName } from './ui/page.js'
import { Memo } from './ui/memo.js'
import { CommandHistory } from './ui/history.js'
import { ProcedureEditor } from './ui/editor.js'
import { HelpPanel } from './ui/help.js'
import { primitiveNameSet, completions } from './ui/helpIndex.js'
import { WidgetLayer } from './ui/widgets.js'
import { sliderToSpeed, speedToSlider, speedLabel } from './ui/speed.js'
import * as dialogs from './ui/dialogs.js'
import { store, download, pickFile } from './ui/storage.js'
import { buildProject, parseProject, globalsSource, isImp, extractImp, decodeBytes, fileNameFor } from './ui/project.js'
import { fetchIndex, fetchExample } from './ui/examples.js'

const $ = (id) => document.getElementById(id)

// ------------------------------------------------------------------------------- theme
const THEMES = ['auto', 'light', 'dark']
function applyTheme(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', t)
  const label = { auto: 'systemowy', light: 'jasny', dark: 'ciemny' }[t]
  $('btnTheme').title = `Motyw: ${label} (kliknij, aby zmienić)`
}
let theme = store.get('theme', 'auto')
if (!THEMES.includes(theme)) theme = 'auto'
applyTheme(theme)

// ------------------------------------------------------------------------------- core objects
const memo = new Memo($('memo'))
const view = new PageView({
  wrap: $('pageArea'),
  scaler: $('pageScaler'),
  host: $('pageHost'),
  onCoords: (x, y) => {
    $('stCoords').textContent = x === null ? 'x — y —' : `x ${Math.round(x)}  y ${Math.round(y)}`
  },
  onFocusChange: (f) => $('pageHost').classList.toggle('has-focus', f),
})

let currentProject = store.get('projectName', '') || ''
let interp // set below; io closures read it lazily

const signal = () => interp?.abortSignal

/** Wait for the next key press anywhere (czytajZnak / czytajKlawisz). */
function nextKey() {
  return new Promise((resolve, reject) => {
    const sig = signal()
    // a key already in the world buffer (pressed while the page had focus) is consumed first
    const buf = logo.world.keys?.buffer
    if (buf && buf.length) return resolve(String(buf.shift()))
    setStatus('waitkey')
    const onKey = (e) => {
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape'].includes(e.key)) return
      e.preventDefault()
      e.stopPropagation()
      cleanup()
      const k = keyName(e)
      resolve(k) // key name; czytajZnak turns Enter/Tab/… into characters (prims/io.js)
    }
    const onAbort = () => { cleanup(); reject(new LogoAbort()) }
    const cleanup = () => {
      window.removeEventListener('keydown', onKey, true)
      sig?.removeEventListener?.('abort', onAbort)
      updateRunning()
    }
    window.addEventListener('keydown', onKey, true)
    if (sig) {
      if (sig.aborted) return onAbort()
      sig.addEventListener('abort', onAbort, { once: true })
    }
  })
}

let lastError = null
const io = {
  print: (text) => memo.print(text),
  type: (text) => memo.type(text),
  write: (text) => memo.write(text),
  printError: (text, err) => {
    memo.error(text)
    if (err instanceof LogoAbort || text === 'Zatrzymano!') return
    lastError = err
    setStatus('error')
  },
  readLine: (prompt = '') => memo.readLine(prompt, signal()),
  readChar: () => nextKey(),
  readKey: () => nextKey(),
  clearText: () => memo.clear(),
  message: (text, title) => dialogs.message(text, { title: title || 'Komunikat', signal: signal() }),
  dialog: (text, title, n = 1) => dialogs.dialog(text, { title: title || 'Logomocja', buttons: n, signal: signal() }),
  ask: (text, title) => dialogs.ask(text, { title: title || 'Pytanie', signal: signal() }),
  setScreenMode: (mode) => setScreenMode(mode),
  fullScreen: (on) => toggleFullScreen(on),
  printGraphics: () => printGraphics(),
  openUrl: (url) => { window.open(String(url), '_blank', 'noopener') },
  setOutput: (fn) => { memo.redirect = typeof fn === 'function' ? fn : null },
  /** zapiszTło: (fileName, dataURL, surface) */
  download: (name, data) => {
    if (typeof data === 'string' && data.startsWith('data:')) download(String(name), dataUrlToBlob(data))
    else download(String(name), data ?? '')
  },
  downloadText: (name, text) => download(String(name), String(text)),
  /** ładujTekst: undefined -> prims fall back to their own storage (memory / localStorage). */
  loadText: async (name) => {
    try {
      if (globalThis.localStorage?.getItem('logomocja:plik:' + name) != null) return undefined
    } catch { /* blocked storage */ }
    if (/^[\w./-]+$/.test(String(name))) {
      try {
        const r = await fetch(String(name), { signal: signal() })
        if (r.ok) return decodeBytes(new Uint8Array(await r.arrayBuffer()))
      } catch { /* not a URL */ }
    }
    return undefined
  },
  pickTextFile: async (accept = '') => {
    const f = await pickFile(accept)
    return f ? { name: f.name, text: decodeBytes(f.bytes) } : null
  },
  saveProject: async (name) => {
    if (name) { currentProject = String(name).replace(/\.lgm$/i, ''); updateProjectLabel() }
    saveLocal() // so `ładujProjekt "nazwa` finds it again
    await downloadProject(name)
  },
  /** ładujProjekt: loads definitions, globals and the picture without stopping the caller. */
  loadProject: async (name) => {
    await loadProjectByName(String(name ?? ''))
    // prims skip `starter` when this hook returns no text, so run it here (§16)
    if (interp.procedures.has(normName('starter'))) await interp.callProcedure('starter', [], interp.rootCtx())
  },
  /** redaguj: open the procedure editor at `name` (or a new skeleton). */
  edit: (name) => openEditorAt(Array.isArray(name) ? name[0] : name),
  pageImage: () => view.surface.toDataURL?.('image/png'),
}

const logo = createLogomocja({ surface: view.surface, io })
interp = logo.interp
const { world, registry } = logo
view.attach(world)
view.fit()

const widgets = new WidgetLayer({ layer: $('widgetLayer'), bar: $('buttonBar'), world, interp })
world.onRender(() => {
  view.checkSize()
  widgets.update()
  updateTurtleCount()
})
world.requestRender()

// primitive names for highlighting / completion (prims may still be registering: compute lazily)
let primSet = null
const isPrimitive = (k) => (primSet ??= primitiveNameSet(registry.specs())).has(k)

// ------------------------------------------------------------------------------- status
let runCount = 0
function setStatus(kind) {
  const el = $('stState')
  el.classList.toggle('running', kind === 'running' || kind === 'waitkey')
  el.classList.toggle('error', kind === 'error')
  el.querySelector('b').textContent = {
    running: 'Program działa…', waitkey: 'Czekam na klawisz…', error: 'Błąd', ready: 'Gotowe',
  }[kind] ?? 'Gotowe'
}
function updateRunning() {
  const running = runCount > 0 || interp.running
  $('btnStop').disabled = !running
  const el = $('stState')
  if (running) { if (!el.classList.contains('running')) setStatus('running') }
  else if (el.classList.contains('running')) setStatus(lastError ? 'error' : 'ready')
}
setInterval(updateRunning, 250)
function updateTurtleCount() {
  const n = world.turtles?.length ?? 0
  const act = (world.activeTurtles || []).map((t) => t.name).join(' ')
  $('stTurtles').textContent = `żółwie: ${n}${act ? ` · aktywne: ${act}` : ''}`
}
function updateProjectLabel() {
  $('stProject').textContent = currentProject ? `projekt: ${currentProject}` : ''
  document.title = currentProject ? `${currentProject} — Logomocja` : 'Logomocja'
}
updateProjectLabel()

// ------------------------------------------------------------------------------- running
async function runSource(source, { echo = true } = {}) {
  if (echo) memo.echo(source)
  lastError = null
  runCount++
  setStatus('running')
  updateRunning()
  try {
    return await logo.run(source)
  } catch (e) {
    console.error(e)
    memo.error(`Błąd wewnętrzny: ${e?.message ?? e}`)
    return { ok: false, error: e }
  } finally {
    runCount--
    updateRunning()
    autosave()
  }
}

function stopAll() {
  logo.stop()
  updateRunning()
}

// ------------------------------------------------------------------------------- command line
const cmd = $('cmd')
const history = new CommandHistory({ items: store.getJSON('history', []) })

function autoGrow() {
  cmd.style.height = 'auto'
  cmd.style.height = Math.min(cmd.scrollHeight + 2, window.innerHeight * 0.4) + 'px'
  const multi = cmd.value.includes('\n')
  $('cmdPrompt').textContent = multi && needsMoreInput(cmd.value) ? '>' : '?'
}

function submitCommand() {
  const text = cmd.value
  if (!text.trim()) {
    const starter = interp.procedures.get(normName('starter'))
    if (starter) runSource('starter')
    return
  }
  history.push(text)
  store.setJSON('history', history.toJSON().slice(-200))
  cmd.value = ''
  autoGrow()
  hideCompletion()
  runSource(text)
}

let compState = null
function hideCompletion() {
  $('complete').hidden = true
  compState = null
}
function currentWord() {
  const pos = cmd.selectionStart
  const before = cmd.value.slice(0, pos)
  const m = /[^\s\[\]()"':+\-*/=<>]+$/u.exec(before)
  return m ? { word: m[0], start: pos - m[0].length, end: pos } : null
}
function completeWord() {
  if (compState) {
    compState.index = (compState.index + 1) % compState.items.length
  } else {
    const w = currentWord()
    if (!w) return false
    const procs = [...interp.procedures.values()].map((d) => d.name)
    const items = completions(registry.specs(), w.word, procs, 12)
    if (!items.length) return false
    compState = { ...w, items, index: 0 }
  }
  const { start, items, index } = compState
  const end = cmd.selectionStart
  cmd.setRangeText(items[index], start, end, 'end')
  if (items.length > 1) {
    const box = $('complete')
    box.replaceChildren(...items.map((n, i) => {
      const s = document.createElement('span')
      s.textContent = n
      if (i === index) s.className = 'sel'
      return s
    }))
    box.hidden = false
  } else hideCompletion()
  return true
}

cmd.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !e.shiftKey) {
    if (completeWord()) { e.preventDefault(); return }
  }
  if (e.key !== 'Tab') hideCompletion()
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    // continuation: an open `[` or `oto` without `już` -> newline with `>` prompt
    if (!e.ctrlKey && needsMoreInput(cmd.value)) {
      e.preventDefault()
      cmd.setRangeText('\n', cmd.selectionStart, cmd.selectionEnd, 'end')
      autoGrow()
      return
    }
    e.preventDefault()
    submitCommand()
    return
  }
  const caretAtStart = cmd.selectionStart === 0 && cmd.selectionEnd === 0
  const caretAtEnd = cmd.selectionStart === cmd.value.length
  const firstLine = !cmd.value.slice(0, cmd.selectionStart).includes('\n')
  const lastLine = !cmd.value.slice(cmd.selectionEnd).includes('\n')
  if (e.key === 'ArrowUp' && (firstLine || caretAtStart) && !e.shiftKey) {
    const v = history.prev(cmd.value)
    if (v !== undefined) { e.preventDefault(); cmd.value = v; autoGrow(); cmd.setSelectionRange(v.length, v.length) }
  } else if (e.key === 'ArrowDown' && (lastLine || caretAtEnd) && !e.shiftKey) {
    const v = history.next()
    if (v !== undefined) { e.preventDefault(); cmd.value = v; autoGrow(); cmd.setSelectionRange(v.length, v.length) }
  }
})
cmd.addEventListener('input', () => { autoGrow(); if (compState) hideCompletion() })
cmd.addEventListener('blur', () => setTimeout(hideCompletion, 150))
$('btnRun').addEventListener('click', () => { submitCommand(); cmd.focus() })
$('btnStop').addEventListener('click', stopAll)
$('btnClearText').addEventListener('click', () => { memo.clear(); cmd.focus() })
$('btnCopyMemo').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(memo.text()); memo.info('Skopiowano zawartość pola tekstowego.') } catch { memo.info('Nie udało się skopiować.') }
})

function insertIntoCommand(text) {
  const s = cmd.selectionStart, e = cmd.selectionEnd
  const before = cmd.value.slice(0, s)
  const sep = before && !/\s$/.test(before) ? ' ' : ''
  cmd.setRangeText(sep + text + ' ', s, e, 'end')
  autoGrow()
  cmd.focus()
}

// ------------------------------------------------------------------------------- editor + help
const editor = new ProcedureEditor({
  textarea: $('editor'),
  pre: $('editorHl'),
  status: $('editorStatus'),
  interp,
  isPrimitive,
  onError: (err) => { memo.error(interp.formatError ? interp.formatError(err) : String(err.message ?? err)); setStatus('error') },
  onApplied: (names) => {
    memo.info(names.length ? `Zdefiniowano: ${names.join(', ')}` : 'Brak procedur w edytorze.')
    autosave()
  },
})
$('btnApply').addEventListener('click', () => editor.apply())
$('btnNewProc').addEventListener('click', () => editor.newProcedure())
$('btnRevert').addEventListener('click', () => editor.refresh())

const help = new HelpPanel({
  input: $('helpSearch'),
  list: $('helpList'),
  count: $('helpCount'),
  registry,
  onInsert: (name) => insertIntoCommand(name),
})

function showSide(tab) {
  const side = $('side')
  const cur = side.hidden ? null : side.dataset.tab
  if (cur === tab) { side.hidden = true; side.dataset.tab = ''; syncSideButtons(); view.fit(); store.set('side', ''); return }
  side.hidden = false
  side.dataset.tab = tab
  $('panelProcs').hidden = tab !== 'procs'
  $('panelHelp').hidden = tab !== 'help'
  $('tabProcs').setAttribute('aria-selected', String(tab === 'procs'))
  $('tabHelp').setAttribute('aria-selected', String(tab === 'help'))
  if (tab === 'help') { primSet = null; help.render(); $('helpSearch').focus() }
  if (tab === 'procs') { editor.highlight(); }
  syncSideButtons()
  view.fit()
  store.set('side', tab)
}
function syncSideButtons() {
  const side = $('side')
  const tab = side.hidden ? '' : side.dataset.tab
  $('btnProcs').setAttribute('aria-pressed', String(tab === 'procs'))
  $('btnHelp').setAttribute('aria-pressed', String(tab === 'help'))
}
$('tabProcs').addEventListener('click', () => { if ($('side').dataset.tab !== 'procs') showSide('procs') })
$('tabHelp').addEventListener('click', () => { if ($('side').dataset.tab !== 'help') showSide('help') })
$('sideClose').addEventListener('click', () => showSide($('side').dataset.tab))

// ------------------------------------------------------------------------------- screen modes
function setScreenMode(mode) {
  const m = { graphics: 'graphics', eg: 'graphics', text: 'text', ts: 'text', split: 'split', ss: 'split' }[mode] ?? 'split'
  document.body.dataset.screen = m
  requestAnimationFrame(() => view.fit())
}
async function toggleFullScreen(on) {
  try {
    if (on === false || (on === undefined && document.fullscreenElement)) await document.exitFullscreen?.()
    else await document.documentElement.requestFullscreen?.()
  } catch { /* not allowed */ }
}
function printGraphics() {
  document.body.classList.add('print-graphics')
  const done = () => { document.body.classList.remove('print-graphics'); window.removeEventListener('afterprint', done) }
  window.addEventListener('afterprint', done)
  window.print()
  setTimeout(done, 1000)
}

// ------------------------------------------------------------------------------- splitter
;(() => {
  const sp = $('splitter')
  const col = $('mainCol')
  const saved = Number(store.get('memoH', ''))
  if (saved > 40) col.style.setProperty('--memo-h', saved + 'px')
  let startY = 0, startH = 0
  const move = (e) => {
    const h = Math.max(60, Math.min(col.clientHeight - 160, startH - (e.clientY - startY)))
    col.style.setProperty('--memo-h', h + 'px')
    view.fit()
  }
  const up = () => {
    sp.classList.remove('dragging')
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    store.set('memoH', String(parseInt(getComputedStyle(col).getPropertyValue('--memo-h')) || 170))
  }
  sp.addEventListener('pointerdown', (e) => {
    startY = e.clientY
    startH = $('memoPane').getBoundingClientRect().height
    sp.classList.add('dragging')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    e.preventDefault()
  })
  sp.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    const h = $('memoPane').getBoundingClientRect().height + (e.key === 'ArrowUp' ? 20 : -20)
    col.style.setProperty('--memo-h', Math.max(60, h) + 'px')
    view.fit()
    e.preventDefault()
  })
})()

// ------------------------------------------------------------------------------- speed
const speedInput = $('speed')
speedInput.value = String(speedToSlider(Number(store.get('speed', '0'))))
function applySpeed() {
  world.speed = sliderToSpeed(speedInput.value)
  $('speedOut').textContent = speedLabel(world.speed)
  store.set('speed', String(world.speed))
}
speedInput.addEventListener('input', applySpeed)
applySpeed()

// ------------------------------------------------------------------------------- projects
function projectText(name = currentProject, { withImage = $('optImage').checked } = {}) {
  const procedures = [...interp.procedures.values()].map((d) => interp.procedureSource(d.name) ?? '')
  let image = ''
  if (withImage) { try { image = view.surface.toDataURL() } catch { image = '' } }
  return buildProject({ name, procedures, globals: interp.globals, image })
}

function drawImage(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return
  const img = new Image()
  img.onload = () => {
    const s = view.surface
    try { s.ctx.drawImage(img, 0, 0, s.width, s.height) } catch (e) { console.error(e) }
    world.requestRender()
  }
  img.src = dataUrl
}

let autosaveTimer = null
function autosave() {
  clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    store.set('autosave', projectText(currentProject, { withImage: false }))
  }, 400)
}
interp.onChange(() => autosave())

async function runProjectText(text, name) {
  stopAll()
  if (isImp(text)) return importImp(text, name)
  const { source, image } = parseProject(text)
  if (image) drawImage(image)
  // a project carries its own definitions: show what happened, then run its body and `starter`
  const res = await runSource(source, { echo: false })
  if (res?.ok !== false && interp.procedures.has(normName('starter'))) await runSource('starter', { echo: false })
  editor.refresh()
  return res
}

function importImp(text, name) {
  const defs = extractImp(text)
  if (!defs.length) {
    memo.error(`Nie znalazłem procedur w pliku ${name || ''}`.trim())
    return
  }
  let n = 0
  const skipped = []
  for (const d of defs) {
    try {
      let object = null
      if (d.owner) {
        object = world.getObject?.(d.owner) ?? null
        if (!object) { skipped.push(`${d.owner}'${d.name}`); continue }
      }
      interp.defineFromSource(d.source, object ? { object } : {})
      n++
    } catch (err) {
      memo.error(`${d.name}: ${err?.message ?? err}`)
    }
  }
  memo.info(`Zaimportowano ${n} procedur z projektu Logomocji${name ? ` ${name}` : ''}.` +
    (skipped.length ? ` Pominięto procedury obiektów, których nie ma na stronie: ${skipped.join(', ')}.` : '') +
    ' Obiekty i rysunki z pliku .imp nie są wczytywane.')
  editor.refresh()
  if (interp.procedures.has(normName('starter'))) return runSource('starter', { echo: false })
}

async function openProjectFile() {
  const f = await pickFile('.lgm,.imp,.lg,.logo,.txt')
  if (!f) return
  await freshStart()
  const name = f.name.replace(/\.(lgm|imp|lg|logo|txt)$/i, '')
  currentProject = name
  store.set('projectName', name)
  updateProjectLabel()
  memo.info(`Wczytuję ${f.name}…`)
  await runProjectText(decodeBytes(f.bytes), f.name)
}

/** Text of a project by name: browser storage, then URL (name or name.lgm), else ask for a file. */
async function fetchProjectText(what) {
  const local = store.get('project:' + what.replace(/\.lgm$/i, ''))
  if (local !== null) return local
  if (what) {
    for (const url of /\.\w+$/.test(what) ? [what] : [what + '.lgm', what + '.imp', 'examples/' + what + '.lgm']) {
      try {
        const r = await fetch(url, { signal: signal() })
        if (r.ok) return decodeBytes(new Uint8Array(await r.arrayBuffer()))
      } catch (e) { if (e?.name === 'AbortError') throw new LogoAbort() }
    }
  }
  const go = await dialogs.modal({ title: 'ładujProjekt', text: `Nie znalazłem projektu ${what || ''}. Wybrać plik z dysku?`, buttons: ['Wybierz plik…', 'Anuluj'], signal: signal() })
  if (go.button !== 1) throw new Error(`Nie mogę wczytać projektu ${what}`)
  const f = await pickFile('.lgm,.imp,.lg,.logo,.txt')
  if (!f) throw new Error(`Nie wybrano pliku projektu`)
  return decodeBytes(f.bytes)
}

/** Define everything from project text without running its body or stopping running code. */
async function importProjectText(text, name) {
  if (isImp(text)) {
    for (const d of extractImp(text)) {
      const object = d.owner ? world.getObject?.(d.owner) : null
      if (d.owner && !object) continue
      interp.defineFromSource(d.source, object ? { object } : {})
    }
  } else {
    const { source, image } = parseProject(text)
    interp.defineFromSource(source)
    const assigns = globalsSource(source)
    if (assigns) await logo.run(assigns)
    if (image) drawImage(image)
  }
  if (name) { currentProject = name.replace(/\.(lgm|imp)$/i, ''); updateProjectLabel() }
  editor.refresh()
}

async function loadProjectByName(what) {
  const text = await fetchProjectText(what)
  await importProjectText(text, what)
}

function openEditorAt(name) {
  const side = $('side')
  if (side.hidden || side.dataset.tab !== 'procs') showSide('procs')
  if (!name) return
  const ta = $('editor')
  const re = new RegExp(`^\\s*(oto|to)\\s+${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'mi')
  const m = re.exec(ta.value)
  if (m) {
    ta.focus()
    ta.setSelectionRange(m.index, m.index + m[0].length)
    const line = ta.value.slice(0, m.index).split('\n').length
    ta.scrollTop = Math.max(0, (line - 3) * parseFloat(getComputedStyle(ta).lineHeight || '21'))
    editor.syncScroll()
  } else editor.newProcedure(String(name))
}

async function downloadProject(name) {
  let n = name ?? currentProject
  if (!n) {
    n = await dialogs.ask('Nazwa projektu:', { title: 'Zapisz projekt', value: 'projekt' })
    if (!n) return
  }
  currentProject = String(n).replace(/\.lgm$/i, '')
  store.set('projectName', currentProject)
  updateProjectLabel()
  download(fileNameFor(currentProject), projectText(currentProject))
  memo.info(`Zapisano plik ${fileNameFor(currentProject)}.`)
}

function saveLocal() {
  const name = currentProject || 'projekt'
  const ok = store.set('project:' + name, projectText(name))
  let png = ''
  try { png = view.surface.toDataURL() } catch { /* tainted */ }
  if (png) store.set('projectImage:' + name, png)
  const list = new Set(store.getJSON('projects', []))
  list.add(name)
  store.setJSON('projects', [...list])
  memo.info(ok ? `Projekt „${name}” zapisano w przeglądarce.` : 'Nie udało się zapisać w przeglądarce (brak miejsca lub zablokowana pamięć).')
}

async function loadLocal() {
  const list = store.getJSON('projects', [])
  if (!list.length) { await dialogs.message('W tej przeglądarce nie ma zapisanych projektów.', { title: 'Wczytaj projekt' }); return }
  const sel = document.createElement('select')
  sel.className = 'dlg-input'
  for (const n of list) sel.add(new Option(n, n))
  const wrap = document.createElement('div')
  wrap.append('Wybierz projekt zapisany w przeglądarce:', document.createElement('br'), sel)
  const r = await dialogs.modal({ title: 'Wczytaj projekt', html: wrap, buttons: ['Wczytaj', 'Usuń', 'Anuluj'] })
  const name = sel.value
  if (r.button === 2) {
    store.remove('project:' + name)
    store.remove('projectImage:' + name)
    store.setJSON('projects', list.filter((x) => x !== name))
    memo.info(`Usunięto projekt „${name}” z przeglądarki.`)
    return
  }
  if (r.button !== 1) return
  const text = store.get('project:' + name)
  if (text === null) { memo.error(`Brak projektu ${name}`); return }
  await freshStart()
  currentProject = name
  store.set('projectName', name)
  updateProjectLabel()
  const img = store.get('projectImage:' + name)
  await runProjectText(text, name)
  if (img && !parseProject(text).image) drawImage(img)
}

async function newProject() {
  if (interp.procedures.size && !(await dialogs.confirm('Usunąć wszystkie procedury i zmienne oraz wyczyścić stronę?', { title: 'Nowy projekt', yes: 'Nowy projekt', no: 'Anuluj' }))) return
  await freshStart()
  memo.clear()
  currentProject = ''
  store.set('projectName', '')
  updateProjectLabel()
  editor.refresh()
  autosave()
}

/** Before loading another project/example: no procedures, globals, extra turtles or widgets. */
async function freshStart() {
  logo.reset({ all: true })
  const names = (world.widgets || []).map((w) => w.name).filter((n) => /^[^\s\[\]()|;"]+$/.test(n))
  // a fresh run() clears the Stop flag that reset() just set
  if (names.length) await logo.run(`usuńObiekt [${names.join(' ')}]`)
  if (world.buttonBar) world.buttonBar.visible = false
  world.requestRender()
}

function newWidget(cls) {
  const nm = { button: 'Przycisk', slider: 'Suwak', textbox: 'PoleTekstowe' }[cls]
  runSource(`nowy "${nm} []`, { echo: true })
}

// ------------------------------------------------------------------------------- examples
async function loadExamples() {
  const sel = $('examples')
  const { items, error } = await fetchIndex()
  if (!items.length) {
    sel.options[0].textContent = 'Przykłady (brak)'
    sel.title = `Brak przykładów: ${error}`
    return
  }
  const groups = new Map()
  for (const it of items) {
    const g = it.category || ''
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g).push(it)
  }
  for (const [g, list] of groups) {
    const parent = g ? Object.assign(document.createElement('optgroup'), { label: g }) : sel
    for (const it of list) {
      const o = new Option(it.title, it.file)
      if (it.description) o.title = it.description
      parent.appendChild(o)
    }
    if (g) sel.appendChild(parent)
  }
}
$('examples').addEventListener('change', async (e) => {
  const file = e.target.value
  e.target.value = ''
  if (!file) return
  try {
    const bytes = await fetchExample(file)
    const title = e.target.querySelector(`option[value="${CSS.escape(file)}"]`)?.textContent ?? file
    stopAll()
    await freshStart()
    memo.info(`Przykład: ${title}`)
    currentProject = file.replace(/\.(lgm|imp)$/i, '')
    updateProjectLabel()
    await runProjectText(decodeBytes(bytes), file)
  } catch (err) {
    memo.error(err.message || String(err))
  }
  cmd.focus()
})

// ------------------------------------------------------------------------------- menus + commands
const COMMANDS = {
  new: newProject,
  open: () => openProjectFile(),
  'save-local': saveLocal,
  'load-local': loadLocal,
  download: () => downloadProject(),
  png: () => {
    try { download(fileNameFor(currentProject || 'strona', '.png'), dataUrlToBlob(view.surface.toDataURL())) } catch (e) { memo.error('Nie mogę zapisać obrazu strony.') }
  },
  cs: () => runSource('czyść', { echo: false }),
  clean: () => { world.clean(); },
  reset: () => { logo.reset(); widgets.update(); memo.info('Odnowa: jeden żółw ż1, białe tło.') },
  'new-button': () => newWidget('button'),
  'new-slider': () => newWidget('slider'),
  'new-textbox': () => newWidget('textbox'),
  fit: () => { view.setFitMode(view.fitMode === 'fit' ? '100' : 'fit') },
  'screen-split': () => setScreenMode('split'),
  'screen-graphics': () => setScreenMode('graphics'),
  'screen-text': () => setScreenMode('text'),
  'panel-procs': () => showSide('procs'),
  'panel-help': () => showSide('help'),
  theme: () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]
    store.set('theme', theme)
    applyTheme(theme)
  },
  fullscreen: () => toggleFullScreen(),
  shortcuts: () => showShortcuts(),
  about: () => dialogs.message(
    'Logomocja Web — przeglądarkowa wersja Logomocji (polskiej edycji Imagine Logo).\n\n' +
    `Procedur pierwotnych: ${registry.specs().length}. Domyślna strona s1: 796 × 499, żółw ż1.\n` +
    'Program działa w całości w przeglądarce; projekty można zapisywać jako pliki .lgm, a projekty Logomocji (.imp) importować.',
    { title: 'O programie' }),
}

function dataUrlToBlob(url) {
  const [head, b64] = url.split(',')
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'image/png'
  const bin = atob(b64)
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return new Blob([u8], { type: mime })
}

function showShortcuts() {
  const rows = [
    ['Enter', 'wykonaj polecenie (gdy brakuje ] albo już — nowy wiersz)'],
    ['Shift+Enter', 'nowy wiersz w linii poleceń'],
    ['↑ / ↓', 'historia poleceń'],
    ['Tab', 'uzupełnij nazwę procedury'],
    ['Esc', 'zatrzymaj wszystkie procesy'],
    ['Ctrl+Enter / Ctrl+S w edytorze', 'zastosuj procedury'],
    ['Ctrl+S', 'zapisz projekt w przeglądarce'],
    ['Ctrl+O', 'otwórz plik projektu'],
    ['F1 / F2', 'pomoc / procedury'],
    ['kliknięcie strony', 'klawisze trafiają do programu (gdyKlawisz)'],
  ]
  const t = document.createElement('table')
  for (const [k, v] of rows) {
    const tr = t.insertRow()
    tr.insertCell().textContent = k
    tr.insertCell().textContent = v
  }
  dialogs.modal({ title: 'Skróty klawiszowe', html: t, buttons: ['OK'] })
}

function runCommand(name) {
  const fn = COMMANDS[name]
  if (!fn) return
  try {
    const r = fn()
    if (r && typeof r.catch === 'function') r.catch((e) => memo.error(e?.message ?? String(e)))
  } catch (e) { memo.error(e?.message ?? String(e)) }
}

document.addEventListener('click', (e) => {
  const item = e.target.closest('[data-cmd]')
  if (item) {
    closeMenus()
    runCommand(item.dataset.cmd)
    return
  }
  const mb = e.target.closest('.menu-btn')
  if (mb) {
    const menu = mb.parentElement
    const open = !menu.classList.contains('open')
    closeMenus()
    if (open) { menu.classList.add('open'); mb.setAttribute('aria-expanded', 'true'); menu.querySelector('.menu-pop button')?.focus() }
    return
  }
  if (!e.target.closest('.menu-pop')) closeMenus()
})
document.querySelectorAll('.menu-btn').forEach((b) => b.addEventListener('pointerenter', () => {
  const anyOpen = document.querySelector('.menu.open')
  if (anyOpen && anyOpen !== b.parentElement) { closeMenus(); b.parentElement.classList.add('open'); b.setAttribute('aria-expanded', 'true') }
}))
function closeMenus() {
  document.querySelectorAll('.menu.open').forEach((m) => { m.classList.remove('open'); m.querySelector('.menu-btn').setAttribute('aria-expanded', 'false') })
}

// ------------------------------------------------------------------------------- global keys
const isEditable = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (document.querySelector('.menu.open')) { closeMenus(); return }
    if (document.querySelector('dialog[open]')) return
    stopAll()
    return
  }
  // F12 stops all processes, as in Logomocja (PRIMITYWY.md §6)
  if (e.key === 'F12') { e.preventDefault(); stopAll(); return }
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 's' && !e.target.closest?.('#editor')) { e.preventDefault(); saveLocal(); return }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openProjectFile(); return }
  if (e.key === 'F1') { e.preventDefault(); showSide('help'); return }
  if (e.key === 'F2') { e.preventDefault(); showSide('procs'); return }
  if (e.key === 'F11' && !mod) { e.preventDefault(); toggleFullScreen(); return }
  if (mod || e.altKey) return
  // keyboard input for the program (gdyKlawisz, klawisz?, ostatniKlawisz): when the page has focus
  // or focus is on nothing editable
  const onPage = e.target === $('pageHost') || e.target.closest?.('#pageHost')
  if (onPage || !isEditable(e.target)) {
    if (e.target.closest?.('.widget') && isEditable(e.target)) return
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return
    if (onPage && (e.key.startsWith('Arrow') || e.key === ' ')) e.preventDefault()
    try {
      const r = world.key(keyName(e))
      if (r && typeof r.catch === 'function') r.catch((err) => console.error(err))
    } catch (err) { console.error(err) }
    // typing a printable key with nothing focused jumps to the command line (like Imagine)
    if (!onPage && e.key.length === 1 && !interp.running && document.activeElement === document.body) cmd.focus()
  }
})

// drag & drop project files
window.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault() })
window.addEventListener('drop', async (e) => {
  const f = e.dataTransfer?.files?.[0]
  if (!f) return
  e.preventDefault()
  const bytes = new Uint8Array(await f.arrayBuffer())
  await freshStart()
  currentProject = f.name.replace(/\.(lgm|imp|lg|logo|txt)$/i, '')
  updateProjectLabel()
  memo.info(`Wczytuję ${f.name}…`)
  runProjectText(decodeBytes(bytes), f.name)
})

window.addEventListener('beforeunload', () => {
  store.set('autosave', projectText(currentProject, { withImage: false }))
})

// ------------------------------------------------------------------------------- start
;(async () => {
  memo.info('Logomocja — wpisz polecenie w linii poleceń, np. powtórz 4 [np 100 pw 90]. Pomoc: F1, procedury: F2.')
  const saved = store.get('autosave')
  if (saved) {
    try {
      const { source } = parseProject(saved)
      const parsed = parse(source)
      let n = 0
      for (const d of parsed.definitions) { try { interp.defineProcedure(d); n++ } catch { /* skip */ } }
      // restore globals silently (no echo, no page side effects besides przypisz)
      const text = globalsSource(source)
      if (text) await logo.run(text)
      if (n) memo.info(`Przywrócono ${n} procedur z poprzedniej sesji.`)
      editor.refresh()
    } catch (e) { console.warn('autosave restore failed', e) }
  }
  const side = store.get('side', '')
  if (side === 'procs' || side === 'help') showSide(side)
  loadExamples()
  cmd.focus()
  autoGrow()
  // debugging handle
  window.logomocja = { logo, interp, world, registry, memo, view, editor, widgets, io }
})()
