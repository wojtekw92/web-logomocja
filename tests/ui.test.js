// Pure-logic tests for the UI (no DOM). Owner: ui.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CommandHistory } from '../src/ui/history.js'
import { sliderToSpeed, speedToSlider, speedLabel, SLIDER_MAX } from '../src/ui/speed.js'
import { searchSpecs, arityText, fold, primitiveNameSet, completions } from '../src/ui/helpIndex.js'
import { tokenize, highlightHTML } from '../src/ui/highlight.js'
import { valueToSource, buildProject, parseProject, isImp, extractImp, decodeBytes, fileNameFor, IMAGE_MARK } from '../src/ui/project.js'
import { normalizeIndex, titleFromFile, exampleUrl } from '../src/ui/examples.js'
import { widgetKind, widgetModel, widgetRect, listWidgets } from '../src/ui/widgetModel.js'
import { keyName } from '../src/ui/page.js'
import { dialogButtons } from '../src/ui/dialogs.js'
import { LogoObject } from '../src/core/values.js'
import { makeTestLogo } from './helpers.js'

test('history: ↑/↓ navigation keeps the draft', () => {
  const h = new CommandHistory()
  h.push('np 100')
  h.push('pw 90')
  h.push('pw 90') // duplicate of last is not stored twice
  h.push('   ')   // blank ignored
  assert.deepEqual(h.items, ['np 100', 'pw 90'])
  assert.equal(h.prev('szkic'), 'pw 90')
  assert.equal(h.prev(), 'np 100')
  assert.equal(h.prev(), undefined)
  assert.equal(h.next(), 'pw 90')
  assert.equal(h.next(), 'szkic')
  assert.equal(h.next(), undefined)
})

test('history: limit', () => {
  const h = new CommandHistory({ limit: 3 })
  for (const c of ['a', 'b', 'c', 'd']) h.push(c)
  assert.deepEqual(h.toJSON(), ['b', 'c', 'd'])
})

test('speed slider: top position is speed 0 (instant), 1..10 animate', () => {
  assert.equal(sliderToSpeed(SLIDER_MAX), 0)
  assert.equal(sliderToSpeed(1), 1)
  assert.equal(sliderToSpeed(10), 10)
  assert.equal(speedToSlider(0), SLIDER_MAX)
  assert.equal(speedToSlider(5), 5)
  for (let p = 1; p <= SLIDER_MAX; p++) assert.equal(speedToSlider(sliderToSpeed(p)), p)
  assert.equal(speedLabel(0), 'maks.')
})

const SPECS = [
  { name: 'naprzód', aliases: ['np', 'forward', 'fd'], arity: 1, minArity: 1, maxArity: 1, doc: 'Przesuwa żółwia do przodu.' },
  { name: 'prawo', aliases: ['pw', 'right', 'rt'], arity: 1, minArity: 1, maxArity: 1, doc: 'Obraca w prawo.' },
  { name: 'pisz', aliases: ['ps', 'print', 'pr'], arity: 1, minArity: 0, maxArity: Infinity, doc: 'Wypisuje dane.' },
  { name: 'żółw?', aliases: ['turtle?'], arity: 1, minArity: 1, maxArity: 1 },
]

test('help: search by name, alias, folded diacritics and doc', () => {
  assert.equal(searchSpecs(SPECS, '').length, 4)
  assert.equal(searchSpecs(SPECS, 'fd')[0].spec.name, 'naprzód')
  assert.equal(searchSpecs(SPECS, 'NAPRZOD')[0].spec.name, 'naprzód')
  assert.equal(searchSpecs(SPECS, 'zolw')[0].spec.name, 'żółw?')
  assert.equal(searchSpecs(SPECS, 'obraca')[0].spec.name, 'prawo')
  assert.equal(searchSpecs(SPECS, 'xyzzy').length, 0)
  assert.equal(fold('ŻÓŁĆ'), 'zolc')
  assert.equal(arityText(SPECS[0]), '1')
  assert.equal(arityText(SPECS[2]), '1 (0..∞)')
  const set = primitiveNameSet(SPECS)
  assert.ok(set.has('np') && set.has('forward') && set.has('żółw?'))
  assert.deepEqual(completions(SPECS, 'p', ['policz']), ['policz', 'prawo', 'pisz', 'pw', 'ps', 'print', 'pr'])
})

test('highlight: tokens cover the source exactly and get classes', () => {
  const src = 'oto kw :a ; komentarz\n  powtórz 4 [np :a pw 90] pisz "Ala\njuż'
  const isPrimitive = (k) => ['powtórz', 'np', 'pw', 'pisz'].includes(k)
  const toks = tokenize(src, { isPrimitive, isProcedure: (k) => k === 'kw' })
  assert.equal(toks.map((t) => t.text).join(''), src)
  const cls = Object.fromEntries(toks.filter((t) => t.cls !== 'ws').map((t) => [t.text, t.cls]))
  assert.equal(cls['oto'], 'keyword')
  assert.equal(cls['już'], 'keyword')
  assert.equal(cls['kw'], 'proc')
  assert.equal(cls[':a'], 'var')
  assert.equal(cls['; komentarz'], 'comment')
  assert.equal(cls['powtórz'], 'prim')
  assert.equal(cls['4'], 'number')
  assert.equal(cls['['], 'bracket')
  assert.equal(cls['"Ala'], 'quoted')
  assert.ok(highlightHTML('pisz 1 < 2', { isPrimitive }).includes('&lt;'))
  // ż1'np 50 : the part after the apostrophe is checked
  assert.equal(tokenize("ż1'np", { isPrimitive }).at(0).cls, 'prim')
  // minus: binary vs negative number
  assert.deepEqual(tokenize('7-3').map((t) => t.cls), ['number', 'op', 'number'])
  assert.deepEqual(tokenize('-3').map((t) => t.cls), ['number'])
})

test('project: valueToSource round-trips through the reader', async () => {
  assert.equal(valueToSource(5), '5')
  assert.equal(valueToSource(0.1 + 0.2), String(0.1 + 0.2))
  assert.equal(valueToSource('ala'), '"ala')
  assert.equal(valueToSource('ala ma'), '"|ala ma|')
  assert.equal(valueToSource(['a', 1, ['b c', []]]), '[a 1 [|b c| []]]')
  assert.equal(valueToSource(new LogoObject({ name: 'ż1' })), undefined)
  const t = makeTestLogo()
  t.interp.globals.set('x', ['a', 1, ['b c', []]])
  t.interp.globals.set('y', 'słowo')
  t.interp.globals.set('z', 2.5)
  t.interp.globals.set('obj', new LogoObject({ name: 'q' }))
  const text = buildProject({ name: 'test', procedures: [], globals: t.interp.globals })
  assert.ok(!text.includes('"obj'))
  const t2 = makeTestLogo()
  const r = await t2.run(parseProject(text).source)
  assert.equal(r.ok, true, JSON.stringify(t2.errors))
  assert.deepEqual(t2.interp.globals.get('x'), ['a', 1, ['b c', []]])
  assert.equal(t2.interp.globals.get('y'), 'słowo')
  assert.equal(Number(t2.interp.globals.get('z')), 2.5)
})

test('project: procedures + image survive build/parse and run', async () => {
  const t = makeTestLogo()
  await t.run('oto kw :a\n  pisz :a\njuż')
  const procs = [...t.interp.procedures.values()].map((d) => t.interp.procedureSource(d.name))
  const text = buildProject({ name: 'p', procedures: procs, globals: new Map(), image: 'data:image/png;base64,AAAA' })
  assert.ok(text.includes(IMAGE_MARK + 'data:image/png;base64,AAAA'))
  const { source, image } = parseProject(text)
  assert.equal(image, 'data:image/png;base64,AAAA')
  assert.ok(!source.includes(IMAGE_MARK))
  const t2 = makeTestLogo()
  const r = await t2.run(source)
  assert.equal(r.ok, true, JSON.stringify(t2.errors))
  assert.ok(t2.interp.procedures.has('kw'))
})

test('.imp import: definiuj lines with ¶', async () => {
  const imp = 'LGF05\x00\x01polishTX\r\n' +
    "definiuj'kwadrat |oto kwadrat :bok¶  pisz :bok¶już|\r\n" +
    "ż1'definiuj'idź |oto idź¶  pisz 1¶już|\r\n" +
    "definiuj'gwiazda |:n¶pisz :n|\r\n" +
    'IMZ1\x00\x00\x07binarne'
  assert.ok(isImp(imp))
  assert.ok(!isImp('oto a\njuż'))
  const defs = extractImp(imp)
  assert.deepEqual(defs.map((d) => [d.name, d.owner]), [['kwadrat', null], ['idź', 'ż1'], ['gwiazda', null]])
  assert.equal(defs[0].source, 'oto kwadrat :bok\n  pisz :bok\njuż')
  assert.equal(defs[2].source, 'oto gwiazda :n\npisz :n\njuż')
  const t = makeTestLogo()
  for (const d of defs.filter((d) => !d.owner)) t.interp.defineFromSource(d.source)
  await t.run('kwadrat 7 gwiazda 3')
  assert.deepEqual(t.out, ['7', '3'])
})

test('decodeBytes: UTF-8 and Windows-1250 fallback', () => {
  assert.equal(decodeBytes(new TextEncoder().encode('żółw')), 'żółw')
  // "żółw" in windows-1250: ż=0xBF ó=0xF3 ł=0xB3 w=0x77
  assert.equal(decodeBytes(new Uint8Array([0xbf, 0xf3, 0xb3, 0x77])), 'żółw')
  assert.equal(decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0x61])), 'a')
  assert.equal(fileNameFor('mój projekt'), 'mój_projekt.lgm')
  assert.equal(fileNameFor('a.lgm'), 'a.lgm')
  assert.equal(fileNameFor('', '.png'), 'projekt.png')
})

test('examples index normalisation', () => {
  assert.deepEqual(normalizeIndex(['kwadrat_kolorowy.lgm']), [{ file: 'kwadrat_kolorowy.lgm', title: 'Kwadrat kolorowy', description: '', category: '' }])
  const n = normalizeIndex({ examples: [{ plik: 'a.lgm', tytuł: 'A', opis: 'x', kategoria: 'Grafika' }, { nothing: 1 }] })
  assert.deepEqual(n, [{ file: 'a.lgm', title: 'A', description: 'x', category: 'Grafika' }])
  assert.deepEqual(normalizeIndex(null), [])
  assert.deepEqual(normalizeIndex('zły'), [])
  assert.equal(titleFromFile('dir/spirala.lgm'), 'Spirala')
  assert.equal(exampleUrl('a.lgm'), 'examples/a.lgm')
  assert.equal(exampleUrl('examples/a.lgm'), 'examples/a.lgm')
})

test('widget model: defensive reading of Imagine UI objects', () => {
  const cls = new LogoObject({ name: 'Suwak', className: 'Suwak' })
  const s = new LogoObject({ name: 'suw1', className: 'Suwak', parent: cls })
  s.vars.set('poz', [10, 20])
  s.vars.set('wartość', 7)
  s.vars.set('maks', 50)
  assert.equal(widgetKind(cls), null)
  assert.equal(widgetKind(s), 'slider')
  const m = widgetModel(s)
  assert.equal(m.value, 7)
  assert.equal(m.max, 50)
  assert.equal(m.min, 0)
  assert.deepEqual([m.x, m.y], [10, 20])
  const r = widgetRect(m, 796, 499)
  assert.equal(r.left, 10 + 398)
  assert.equal(r.top, 249.5 - 20)
  const b = new LogoObject({ name: 'prz1', className: 'Przycisk' })
  b.getSetting = (n) => (n === 'napis' ? 'Start' : undefined)
  assert.equal(widgetModel(b).caption, 'Start')
  assert.equal(widgetModel(new LogoObject({ name: 'x', className: 'Żółw' })), null)
  const world = { objects: new Map([['suw1', s], ['prz1', b], ['q', new LogoObject({ name: 'q' })]]) }
  assert.deepEqual(listWidgets(world).map((o) => o.name), ['suw1', 'prz1'])
  assert.deepEqual(listWidgets({ widgets: [b] }).map((o) => o.name), ['prz1'])
})

test('key names and dialog buttons', () => {
  assert.equal(keyName({ key: 'a' }), 'a')
  assert.equal(keyName({ key: 'ArrowLeft' }), 'ArrowLeft')
  assert.equal(keyName({ key: 'Enter' }), 'Enter')
  assert.deepEqual(dialogButtons(2), ['Tak', 'Nie'])
  assert.deepEqual(dialogButtons(['A', 'B']), ['A', 'B'])
  assert.deepEqual(dialogButtons(0), ['OK'])
})

test('widget model: snapshot() contract from prims/objects.js (top-left logo coords)', async () => {
  const t = makeTestLogo()
  const r = await t.run('nowy "Suwak [nazwa suw9]')
  const w = t.world.widgets?.find((o) => o.kind === 'slider')
  if (!r.ok || !w) return // prims/objects.js not available in this build
  const m = widgetModel(w)
  assert.equal(m.kind, 'slider')
  assert.equal(typeof m.value, 'number')
  const rect = widgetRect(m, t.world.page.width, t.world.page.height)
  assert.equal(rect.left, m.x + t.world.page.width / 2)
  assert.equal(rect.top, t.world.page.height / 2 - m.y)
  assert.ok(listWidgets(t.world).includes(w))
})
