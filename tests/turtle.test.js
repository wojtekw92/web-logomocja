// Tests for src/prims/turtle.js (PRIMITYWY.md §2, §3, §4). Owner: prims-turtle.
// Uses only this module's primitives (plus whatever else happens to be registered) and checks
// world/turtle state directly.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { makeTestLogo } from './helpers.js'
import { readList } from '../src/core/lexer.js'
import { Registry } from '../src/core/registry.js'
import { register } from '../src/prims/turtle.js'
import { normName } from '../src/core/values.js'

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`)

async function setup() {
  const t = makeTestLogo()
  const ev = async (src) => t.interp.evalList(readList(src), t.interp.rootCtx())
  const ok = async (src) => {
    const r = await t.run(src)
    assert.deepEqual(t.errors, [], `errors for ${src}`)
    return r
  }
  const z1 = t.world.turtles[0]
  return { ...t, ev, ok, z1 }
}

// ---------------------------------------------------------------- completeness vs PRIMITYWY.md

function docRows() {
  const md = readFileSync(new URL('../docs/PRIMITYWY.md', import.meta.url), 'utf8')
  const start = md.indexOf('## 2. Żółw i grafika'), end = md.indexOf('## 5. Zmienne')
  const rows = []
  let inTable = false
  for (const line of md.slice(start, end).split('\n')) {
    if (line.startsWith('| nazwa kanoniczna')) { inTable = true; continue }
    if (!line.startsWith('|')) { inTable = false; continue }
    if (!inTable || line.startsWith('|---')) continue
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    const names = [cells[0], ...cells[1].split(',').map((s) => s.trim()).filter((s) => s && s !== '—')]
    rows.push({ names, arity: cells[2] })
  }
  return rows
}

test('every §2–§4 primitive and alias is registered with the documented arity', () => {
  const reg = new Registry()
  register(reg)
  const rows = docRows()
  assert.ok(rows.length >= 130, `parsed ${rows.length} rows`)
  for (const { names, arity } of rows) {
    const spec = reg.lookup(names[0])
    assert.ok(spec, `missing ${names[0]}`)
    for (const n of names) assert.equal(reg.lookup(n), spec, `alias ${n} of ${names[0]}`)
    const m = /^(\d+)(?: \((\d+)\))?$/.exec(arity)
    assert.ok(m, `arity ${arity}`)
    assert.equal(spec.arity, Number(m[1]), `arity of ${names[0]}`)
    if (m[2]) assert.equal(spec.maxArity, Number(m[2]), `max arity of ${names[0]}`)
  }
  // `pw` is prawo, never pen width
  assert.equal(normName(reg.lookup('pw').name), normName('prawo'))
  assert.equal(reg.lookup('grubość').aliases.includes('pw'), false)
})

// ---------------------------------------------------------------- movement

test('np / ws / pw / lw / wróć move the turtle', async () => {
  const t = await setup()
  await t.ok('np 100 pw 90 np 50')
  assert.deepEqual([t.z1.x, t.z1.y, t.z1.heading], [50, 100, 90])
  await t.ok('lw 390 ws 10')
  assert.equal(t.z1.heading, 60)
  await t.ok('wróć')
  assert.deepEqual([t.z1.x, t.z1.y, t.z1.heading], [0, 0, 0])
  assert.deepEqual(await t.ev('poz'), [0, 0])
  await t.ok('fd 10 rt 90 bk 5 lt 45 home')
  assert.equal(t.z1.y, 0)
})

test('np draws a line with the pen colour; pod stops drawing', async () => {
  const t = await setup()
  await t.ok('ukp 12 np 20')
  const lines = t.surface.ops.filter((o) => o.op === 'line')
  assert.equal(lines.length, 1)
  assert.equal(lines[0].color.css, '#ff0000')
  assert.deepEqual(t.surface.getPixel(0, 10), { r: 255, g: 0, b: 0, css: '#ff0000' })
  await t.ok('pod np 20 opu')
  assert.equal(t.surface.ops.filter((o) => o.op === 'line').length, 1)
  assert.equal(await t.ev('pisak'), 'opu')
  await t.ok('ścieraj')
  assert.equal(await t.ev('pisak'), 'ścier')
  await t.ok('odwracaj')
  assert.equal(await t.ev('pen'), 'odwr')
  await t.ok('ustalPisak "pu')
  assert.equal(await t.ev('pisak'), 'pod')
})

test('wrong input names the primitive as typed', async () => {
  const t = await setup()
  await t.run('ws "abc')
  assert.deepEqual(t.errors, ['ws nie lubi abc jako danej'])
  await t.run('ukp "niekolor')
  assert.equal(t.errors[1], 'ukp nie lubi niekolor jako danej')
  await t.run('ustalPisak "xyz')
  assert.equal(t.errors[2], 'ustalPisak nie lubi xyz jako danej')
})

test('jld inputs use the §1.6 ranges', async () => {
  const t = await setup()
  for (let i = 0; i < 20; i++) {
    await t.ok('wróć np "jld')
    assert.ok(t.z1.y >= 1 && t.z1.y <= 100)
    await t.ok('ustalKierunek 0 pw "jld')
    assert.ok(t.z1.heading >= 1 && t.z1.heading <= 90)
    await t.ok('ugp "jld')
    assert.ok(t.z1.penWidth >= 1 && t.z1.penWidth <= 20)
    await t.ok('ustalPoz [jld jld]')
    assert.ok(Math.abs(t.z1.x) <= 398 && Math.abs(t.z1.y) <= 250)
  }
  await t.ok('ukp "jld ukp [120 jld 70]')
  assert.equal(t.z1.penColor.r, 120)
})

test('positions and heading reporters/setters', async () => {
  const t = await setup()
  await t.ok('ustalPoz [30 40]')
  assert.deepEqual(await t.ev('poz'), [30, 40])
  assert.equal(await t.ev('pozx'), 30)
  assert.equal(await t.ev('ycor'), 40)
  await t.ok('ustalPozx 5 ustalPozy 6')
  assert.deepEqual(await t.ev('pos'), [5, 6])
  await t.ok('ustalXY -1 -2')
  assert.deepEqual(await t.ev('poz'), [-1, -2])
  await t.ok('setX 7 setY 8 naPoz [0 0]')
  assert.deepEqual(await t.ev('poz'), [0, 0])
  await t.ok('ustalKierunek 450')
  assert.equal(await t.ev('kierunek'), 90)
  await t.ok('skieruj 0')
  assert.equal(await t.ev('kierunekDo [10 0]'), 90)
  assert.equal(await t.ev('odległość [3 4]'), 5)
  await t.ok('ustalStanPoczątkowy [[10 20] 90] np 50 wróć')
  assert.deepEqual(await t.ev('stanPoczątkowy'), [[10, 20], 90])
  assert.deepEqual([t.z1.x, t.z1.y, t.z1.heading], [10, 20, 90])
})

test('pozA / ustalPozA / lewyGórny', async () => {
  const t = await setup()
  assert.deepEqual(await t.ev('pozA'), [398, 249])
  assert.deepEqual(await t.ev('lewyGórny'), [-398, 249])
  await t.ok('pod ustalPozA [0 0]')
  assert.deepEqual(await t.ev('poz'), [-398, 249])
  t.world.mouse.x = 12; t.world.mouse.y = -3
  assert.deepEqual(await t.ev('pozMyszy'), [12, -3])
  await t.ok('ustalPozMyszy [1 2]')
  assert.deepEqual(await t.ev('mousePos'), [1, 2])
})

// ---------------------------------------------------------------- multi-turtle

test('commands run on every active turtle, reporters use the first', async () => {
  const t = await setup()
  const z2 = t.world.createTurtle()
  z2.jumpTo(100, 0)
  t.world.activeTurtles = [t.z1, z2]
  await t.ok('np 30 pw 90')
  assert.deepEqual([t.z1.x, t.z1.y, z2.x, z2.y], [0, 30, 100, 30])
  assert.deepEqual(await t.ev('poz'), [0, 30])
  assert.equal(z2.heading, 90)
  // apostrophe syntax: only ż2
  await t.ok("ż2'np 10")
  assert.equal(z2.x, 110)
  assert.equal(t.z1.x, 0)
  assert.deepEqual(await t.interp.evalList(readList("ż2'poz"), t.interp.rootCtx()), [110, 30])
  // ctx.who with names
  const c = t.interp.childCtx(t.interp.rootCtx(), { who: ['ż2'] })
  await t.interp.runList(readList('ws 10'), c)
  assert.equal(z2.x, 100)
})

test('nachodzi? / listaNachodzących / naWierzch / naSpód', async () => {
  const t = await setup()
  const z2 = t.world.createTurtle()
  z2.jumpTo(5, 0)
  const z3 = t.world.createTurtle()
  z3.jumpTo(300, 0)
  assert.equal(await t.ev('nachodzi? "ż2'), 'prawda')
  assert.equal(await t.ev('nachodzi? [ż3]'), 'fałsz')
  assert.deepEqual(await t.ev('listaNachodzących'), ['ż2'])
  await t.ok('naWierzch')
  assert.ok(t.z1.zOrder > z3.zOrder)
  await t.ok('naSpód')
  assert.ok(t.z1.zOrder < z2.zOrder)
})

// ---------------------------------------------------------------- Stop during animation

test('Stop interrupts an animated move', async () => {
  const t = await setup()
  t.world.speed = 1
  t.world.frameDelay = 2
  const p = t.run('np 500')
  await new Promise((r) => setTimeout(r, 20))
  t.interp.abort()
  const r = await p
  assert.ok(r.aborted || r.ok === false, JSON.stringify(r))
  assert.ok(t.z1.y > 0 && t.z1.y < 500, `y=${t.z1.y}`)
})

test('animated moves of several turtles run in parallel', async () => {
  const t = await setup()
  const z2 = t.world.createTurtle()
  t.world.activeTurtles = [t.z1, z2]
  t.world.speed = 10
  t.world.frameDelay = 0
  await t.ok('np 100')
  assert.deepEqual([t.z1.y, z2.y], [100, 100])
})

// ---------------------------------------------------------------- colours

test('pen / fill colours, palette round-trip, naRGB, kolory', async () => {
  const t = await setup()
  await t.ok('ukp "grey9')
  assert.equal(await t.ev('kolPis'), 7)
  assert.equal(await t.ev('kolMal'), 7) // ukp also sets the fill colour (§17.11)
  await t.ok('ukm "żółty')
  assert.equal(await t.ev('kolMal'), 14)
  assert.equal(await t.ev('pc'), 7)
  await t.ok('ukp [1 2 3]')
  assert.deepEqual(await t.ev('kolPis'), [1, 2, 3])
  assert.deepEqual(await t.ev('naRGB "czerwony'), [255, 0, 0])
  assert.deepEqual(await t.ev('toRGB 14'), [255, 255, 0])
  const names = await t.ev('kolory')
  assert.equal(names.length, 18)
  assert.equal(names[0], 'biały')
  await t.ok('ugp 0')
  assert.equal(await t.ev('grubość'), 1)
  await t.ok('ugp 7 uwp 2 uwm 3')
  assert.deepEqual([await t.ev('grubość'), await t.ev('wzórPis'), await t.ev('wzórMal')], [7, 2, 3])
})

test('kolorPodŻółwiem and kolorPunktuW read the drawing layer', async () => {
  const t = await setup()
  assert.equal(await t.ev('kolorPodŻółwiem'), 15)
  await t.ok('ukp 12 np 0')
  assert.equal(await t.ev('kolorPodŻółwiem'), 12)
  assert.equal(await t.ev('dotColor'), 12)
  await t.ok('ugp 5 np 30')
  assert.equal(await t.ev('kolorPunktuW [0 15]'), 12)
  assert.equal(await t.ev('kolorPunktuW [100 100]'), 15)
})

test('zamaluj fills the region around the turtle', async () => {
  const t = await setup()
  // without powtórz (owned by another module) draw the square by hand
  await t.ok('np 40 pw 90 np 40 pw 90 np 40 pw 90 np 40 pw 90')
  await t.ok('pod ustalPoz [20 20] ukm 9 zamaluj')
  assert.equal(await t.ev('kolorPodŻółwiem'), 9)
  assert.equal(await t.ev('kolorPunktuW [100 100]'), 15)
})

// ---------------------------------------------------------------- shapes

test('okrąg / koło / kropka / pkt / elipsa', async () => {
  const t = await setup()
  await t.ok('okrąg 100')
  let e = t.surface.ops.filter((o) => o.op === 'ellipse').at(-1)
  assert.equal(e.rx, 50)
  await t.ok('ukm 12 koło 40')
  e = t.surface.ops.filter((o) => o.op === 'ellipse').at(-1)
  assert.equal(e.rx, 20)
  assert.equal(e.fillColor.css, '#ff0000')
  assert.equal(await t.ev('kolorPodŻółwiem'), 12)
  await t.ok('kropka 6 pod pkt')
  assert.equal(t.surface.ops.at(-1).op, 'line')
  const n = t.surface.ops.length
  await t.ok('okrąg 10 elipsa [10 20]') // pen up: nothing
  assert.equal(t.surface.ops.length, n)
  await t.ok('opu elipsa [10 20] elipsaZamalowana [5 6 0 180]')
  const last = t.surface.ops.at(-1)
  assert.deepEqual([last.rx, last.ry, last.start, last.end], [5, 6, 0, 180])
})

test('wielokąt, rysuj, naPunkty, naWektory, obrys, krzywa', async () => {
  const t = await setup()
  assert.deepEqual(await t.ev('naPunkty [np 10 pw 90 np 10]'), [[0, 0], [0, 10], [10, 10]])
  assert.deepEqual(await t.ev('naPunkty [2 [10 90]]'), [[0, 0], [0, 10], [10, 10]])
  assert.deepEqual(await t.ev('naWektory [np 10 pw 90 np 5]'), [[0, 10], [5, 0]])
  // turtle state untouched, nothing drawn on the real page by naPunkty
  assert.deepEqual([t.z1.x, t.z1.y, t.z1.heading], [0, 0, 0])
  assert.equal(t.surface.ops.filter((o) => o.op === 'line').length, 0)

  await t.ok('pw 90 ukm 12 wielokąt [np 40 pw 90 np 40 pw 90 np 40]')
  const poly = t.surface.ops.at(-1)
  assert.equal(poly.op, 'polygon')
  assert.deepEqual(poly.points, [[0, 0], [40, 0], [40, -40], [0, -40]])
  assert.equal(await t.ev('kolorPunktuW [20 -20]'), 12)
  assert.deepEqual([t.z1.x, t.z1.y, t.z1.heading], [0, 0, 90])

  await t.ok('rysuj [np 30]')
  const ln = t.surface.ops.at(-1)
  assert.deepEqual([ln.x1, ln.y1, ln.x2, ln.y2], [0, 0, 30, 0])
  assert.deepEqual([t.z1.x, t.z1.y], [0, 0])
  await t.ok('rysuj [4 [10 90]]')
  assert.equal(t.surface.ops.filter((o) => o.op === 'line').length, 5)

  await t.ok('skieruj 0 obrys [[0 0] [0 10] [10 10]]')
  assert.equal(t.surface.ops.filter((o) => o.op === 'line').length, 7)
  const k = await t.ev('krzywa [[0 0] [10 10] [20 0]]')
  assert.ok(k.length > 3)
  assert.deepEqual(k[0], [0, 0]); assert.deepEqual(k.at(-1), [20, 0])
  await t.ok('rysujKrzywą [[0 0] [10 10] [20 0]]')
})

test('suń glides along a drawing list', async () => {
  const t = await setup()
  await t.ok('suń [np 20 pw 90 np 10] [co 5]')
  assert.deepEqual([t.z1.x, t.z1.y, t.z1.heading], [10, 20, 90])
  assert.equal(t.surface.ops.filter((o) => o.op === 'line').length, 6)
  await t.ok('wróć pod suń [np 10] [co 10 czekaj 1 rób [pw 1]]')
  assert.deepEqual([t.z1.x, t.z1.y], [0, 10])
})

// ---------------------------------------------------------------- text

test('napisz / napisz2 / czcionka / rozmiarTekstu', async () => {
  const t = await setup()
  await t.ok('napisz [Ala ma kota]')
  const tx = t.surface.ops.at(-1)
  assert.deepEqual([tx.op, tx.str], ['text', 'Ala ma kota'])
  await t.ok('pod napisz "x')
  assert.equal(t.surface.ops.at(-1).str, 'x') // drawn with the pen up too
  assert.deepEqual(await t.ev('czcionka'), [['System'], [0, 400, 0, 0, 0, 1]])
  await t.ok('ustalCzcionkę [[Arial] [20 700 1 0 0 1]]')
  assert.deepEqual(await t.ev('font'), [['Arial'], [20, 700, 1, 0, 0, 1]])
  const [w, h] = await t.ev('rozmiarTekstu "abc')
  assert.ok(w > 0 && h > 0)
  await t.ok('skieruj 0 napisz2 "abc')
  near(t.z1.x, w, 1)
})

// ---------------------------------------------------------------- visibility & range

test('visibility and range style', async () => {
  const t = await setup()
  await t.ok('schowajMnie')
  assert.equal(await t.ev('widoczny'), 'fałsz')
  await t.ok('pż')
  assert.equal(await t.ev('shown?'), 'prawda')
  await t.ok('ustalWidoczny "fałsz')
  assert.equal(t.z1.visible, false)
  assert.equal(await t.ev('stylZakresu'), 'sklej')
  await t.ok('płot')
  assert.equal(await t.ev('stylZakresu'), 'płot')
  assert.equal(t.world.page.wrapMode, 'sklej') // page default untouched
  await t.ok('np 1000')
  near(t.z1.y, 249.5)
  await t.ok('wróć (okno [-10 -10 10 10])')
  assert.deepEqual(await t.ev('zakres'), [-10, -10, 10, 10])
  assert.equal(await t.ev('rangeStyle'), 'okno')
  await t.ok('ustalStylZakresu "bounce')
  assert.equal(await t.ev('stylZakresu'), 'odbij')
  await t.ok('ustalZakres [] sklej wrap')
  assert.deepEqual(await t.ev('zakres'), [])
  await t.ok('wróć np 300')
  near(t.z1.y, 300 - 499)
  assert.equal(await t.ev('wewnątrz? [-10 -300 10 0]'), 'prawda')
  assert.equal(await t.ev('zewnątrz? [[-10 -300] [10 0]]'), 'fałsz')
  await t.ok('ustalWidocznyZakres [0 0 50 50]')
  assert.deepEqual(await t.ev('widocznyZakres'), [0, 0, 50, 50])
})

// ---------------------------------------------------------------- shape, stamp, animation

test('postać / ustalPostać / stempluj / skala / klatka', async () => {
  const t = await setup()
  assert.deepEqual(await t.ev('postać'), [])
  await t.ok('ustalPostać "strzałka')
  assert.equal(t.z1.shape.name, 'strzałka')
  await t.ok('ustalPostać [np 20 pw 120 np 20 pw 120 np 20]')
  assert.equal(t.z1.shape.kind, 'vector')
  assert.deepEqual(await t.ev('postać'), readList('np 20 pw 120 np 20 pw 120 np 20'))
  assert.deepEqual([t.z1.x, t.z1.y, t.z1.heading], [0, 0, 0])
  await t.ok('pod ustalPostać [np 20 pw 120 np 20 pw 120 np 20] opu')
  assert.ok(t.z1.shape.frames[0].paths.length > 0) // pen up does not empty the shape
  await t.ok('ustalPostać [3 [20 120]]')
  assert.equal(t.z1.shape.kind, 'vector')
  await t.ok('ustalPostać [[np 10] [np 20]]')
  assert.equal(t.z1.shape.frames.length, 2)
  await t.ok('ustalKlatkę 1')
  assert.equal(await t.ev('klatka'), 1)
  await t.ok('ustalPostać []')
  assert.equal(t.z1.shape, null)
  await t.ok('stempluj')
  assert.equal(t.surface.ops.at(-1).op, 'stamp')
  await t.ok('ustalSkalęPostaci 2')
  assert.equal(await t.ev('skalaPostaci'), 2)
  await t.ok('ustalSkalęPostaci [1 3]')
  assert.deepEqual(await t.ev('shapeScale'), [1, 3])
  await t.ok('ustalKolPostaci 12')
  assert.equal(await t.ev('kolPostaci'), 12)
  await t.ok('ustalKolPostaci []')
  assert.deepEqual(await t.ev('kolPostaci'), [])
  await t.ok('ustalAnimację "fałsz')
  assert.equal(await t.ev('animacja'), 'fałsz')
  await t.ok('ustalSkalęOpóźnienia 2')
  assert.equal(await t.ev('skalaOpóźnienia'), 2)
  await t.run('ustalPostać "nieMaTakiej')
  assert.deepEqual(t.errors, ['ustalPostać nie lubi nieMaTakiej jako danej'])
})

test('weźObraz / zrzutTła / wstawObraz / stemplujObraz', async () => {
  const t = await setup()
  await t.ok('ukp 12 ugp 9 np 0')
  const img = await t.ev('weźObraz [-5 -5 5 5]')
  assert.equal(img.width, 10)
  assert.ok(img.data.some((v, i) => i % 4 === 1 && v === 0)) // contains red
  await t.ok('pod ustalPoz [100 100]')
  await t.interp.callProcedure('wstawObraz', [img, [100, 100]], t.interp.rootCtx())
  assert.equal(await t.ev('kolorPunktuW [100 100]'), 12)
  const all = await t.ev('zrzutTła []')
  assert.equal(all.width, 796)
  await t.interp.callProcedure('stemplujObraz', [img], t.interp.rootCtx())
  await t.ok('stemplujObraz [np 5]')
})

// ---------------------------------------------------------------- page

test('czyść / zmaż / ustalKolTła / odnowa', async () => {
  const t = await setup()
  await t.ok('np 50 pw 90 ugp 3 ukp 4')
  await t.ok('zmaż')
  assert.deepEqual([t.z1.x, t.z1.y], [0, 50])
  await t.ok('np 10 czyść')
  assert.deepEqual([t.z1.x, t.z1.y, t.z1.heading], [0, 0, 0])
  assert.equal(t.z1.penWidth, 3) // pen untouched
  assert.equal(await t.ev('kolorPunktuW [5 50]'), 15)
  await t.ok('ustalTło 14')
  assert.equal(await t.ev('kolTła'), 14)
  assert.equal(await t.ev('kolorPodŻółwiem'), 14)
  await t.ok('setBg "niebieski cs')
  assert.equal(await t.ev('bg'), 9)
  t.world.createTurtle()
  await t.ok('np 30 odnowa')
  assert.equal(t.world.turtles.length, 1)
  assert.equal(await t.ev('kolTła'), 15)
  assert.equal(t.z1.penWidth, 1)
})

test('rozmiar / ustalRozmiar / początek', async () => {
  const t = await setup()
  assert.deepEqual(await t.ev('rozmiar'), [796, 499])
  await t.ok('ustalRozmiar [400 300]')
  assert.deepEqual(await t.ev('size'), [400, 300])
  assert.equal(t.surface.width, 400)
  assert.deepEqual(await t.ev('początek'), [0, 0])
  await t.ok('ustalPoczątek [10 20]')
  assert.deepEqual(await t.ev('origin'), [10, 20])
})

test('background line primitives', async () => {
  const t = await setup()
  await t.ok('ustalKolLiniiTła 12 ustalGrubośćLiniiTła 3 ustalWzórLiniiTła 0')
  await t.ok('liniaTła [[-100 0] [100 0]]')
  assert.equal(await t.ev('kolorPunktuW [50 0]'), 12)
  await t.ok('ustalKolLiniiTła 9 pełnyProstokątTła [100 100 150 150]')
  assert.equal(await t.ev('kolorPunktuW [125 125]'), 9)
  await t.ok('prostokątTła [-150 100 -100 150] ustalKolLiniiTła 2 zamalujTło [-125 125]')
  assert.equal(await t.ev('kolorPunktuW [-125 125]'), 2)
  await t.ok('ustalKolLiniiTła 13 pełnaElipsaTła [[100 -150] [150 -100]] elipsaTła [-150 -150 -100 -100]')
  assert.equal(await t.ev('kolorPunktuW [125 -125]'), 13)
})

test('pages: nowaStrona / pokażStronę / listaStron / usuńStronę', async () => {
  const t = await setup()
  await t.ok('ukp 12 np 0')
  await t.ok('nowaStrona')
  assert.deepEqual(await t.ev('listaStron'), ['s1', 's2'])
  assert.equal(await t.ev('aktywnaStrona'), 's1')
  await t.ok('pokażStronę "s2')
  assert.equal(await t.ev('activePage'), 's2')
  assert.equal(t.surface.getPixel(0, 0).css, '#ffffff')
  await t.ok('pokażStronę "s1')
  assert.equal(t.surface.getPixel(0, 0).css, '#ff0000') // drawing restored
  assert.equal(t.world.activeTurtles[0], t.z1)
  await t.ok('usuńStronę "s2')
  assert.deepEqual(await t.ev('pageList'), ['s1'])
})

test('main window primitives call the io hooks', async () => {
  const t = await setup()
  const modes = []
  t.logo.io.setScreenMode = (m) => modes.push(m)
  t.interp.io.setScreenMode = (m) => modes.push(m)
  await t.ok('eg ts ss ekranGraficzny')
  assert.deepEqual(modes, ['graphics', 'text', 'split', 'graphics'])
  t.out.push('x')
  await t.ok('ct')
  assert.deepEqual(t.out, [])
  await t.ok('pełnyEkran drukujGrafikę')
})
