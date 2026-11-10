// Runs every example program from examples/ headlessly, the way the UI loads it: run the file
// (definitions + body), then `starter` when it is defined. Interactive examples get simulated
// events (keys, clicks, slider, buttons). Long-running ones (processes) are stopped after a while.
// Before the stop no error may be printed; after it only `Zatrzymano!` is allowed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeTestLogo } from './helpers.js'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'examples')
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.lgm')).sort()
const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** Wait for the processes started by world.dispatchEvent / pointer / key. */
async function settle(procs) {
  const list = (Array.isArray(procs) ? procs : [procs]).filter((p) => p && p.promise)
  await Promise.all(list.map((p) => p.promise))
}
const turtleNames = (t) => t.world.turtles.map((x) => x.name)

/** Per-example simulation and checks, run after `starter`. */
const interact = {
  '01_kwadrat_wielokaty.lgm': async (t) => {
    assert.deepEqual(t.out, ['Kwadrat, wielokąty foremne i zamalowywanie gotowe.'])
    // the orange square was filled
    const c = t.surface.getPixel(-300, 150)
    assert.deepEqual([c.r, c.g, c.b], [255, 128, 0])
  },
  '04_platek_kocha.lgm': async (t) => {
    const inside = t.surface.getPixel(0, 0)
    const outside = t.surface.getPixel(-350, -230)
    assert.deepEqual([inside.r, inside.g, inside.b], [0, 255, 255])
    assert.deepEqual([outside.r, outside.g, outside.b], [255, 255, 255])
  },
  '07_zegar.lgm': async (t) => {
    assert.ok(t.interp.processes.size >= 1, 'the clock process runs')
    // wait (up to 4 s) for at least one tick of `co 1000` after the first drawing
    const ops = t.surface.ops.length
    const deadline = Date.now() + 4000
    while (t.surface.ops.length === ops && Date.now() < deadline) await sleep(50)
    assert.ok(t.surface.ops.length > ops, 'the clock hands were redrawn')
    assert.equal(t.interp.getVar('poprzedni', t.interp.rootCtx()).length, 3)
  },
  '08_wyscig_zolwi.lgm': async (t) => {
    assert.equal(t.out.length, 1)
    assert.match(t.out[0], /^Wygrał ż[123]$/)
    assert.deepEqual(turtleNames(t), ['ż1', 'ż2', 'ż3'])
  },
  '09_gra_lapanie.lgm': async (t) => {
    const cel = t.world.getObject('cel')
    assert.ok(cel, 'turtle cel exists')
    const ż1 = t.world.getObject('ż1')
    for (const k of ['ArrowUp', 'ArrowLeft', 'w', 'd', 'ArrowDown', 's']) await settle(t.world.key(k))
    assert.notDeepEqual([ż1.x, ż1.y, ż1.heading], [0, 0, 0], 'keys steer ż1')
    await settle(t.world.pointer('click', cel.x, cel.y, 0))
    assert.ok(t.interp.globals.get('punkty') >= 1, 'click on the star scores')
    assert.ok(t.out.some((s) => /^Punkty: \d+$/.test(s)))
  },
  '10_suwak_kat.lgm': async (t) => {
    for (const v of [90, 170, 1, 179]) {
      t.surface.ops.length = 0
      await settle(t.world.dispatchEvent('gdyZmieniasz', { target: 'suw1', value: v }))
      assert.ok(t.surface.ops.some((o) => o.op === 'text' && o.str === `Kąt obrotu: ${v}`), `redrawn for ${v}`)
    }
  },
  '11_przyciski.lgm': async (t) => {
    const buttons = t.world.widgets.filter((w) => w.kind === 'button')
    assert.equal(buttons.length, 5)
    for (let round = 0; round < 2; round++) {
      for (const b of buttons) await settle(t.world.dispatchEvent('gdyWciśnięty', { target: b.name }))
    }
  },
  '12_slowa_i_listy.lgm': async (t) => {
    assert.deepEqual(t.out, [
      'Logomocja wspak: ajcomogoL',
      'kajak to palindrom? prawda',
      'żółw to palindrom? fałsz',
      '[1 3 3 5 7 9]',
      '[banan ćma gruszka jabłko śliwka]',
      'Samogłoski w słowie Konstantynopolitańczykowianeczka: 13',
      'szyfr: orjrprfmd -> logomocja',
      '[1 4 9 16 25]',
      '[8 9 6]',
      '[ala ma kota i psa]',
      '[[ala ma] kota]',
    ])
  },
  '13_logia_szachownica.lgm': async (t) => {
    assert.deepEqual(t.out, ['Liczby od 1 do 100 o sumie cyfr 10:', '19 28 37 46 55 64 73 82 91'])
    const ll = t.surface.getPixel(-190, -190) // lower-left field is black
    const next = t.surface.getPixel(-140, -190)
    assert.deepEqual([ll.r, ll.g, ll.b], [0, 0, 0])
    assert.deepEqual([next.r, next.g, next.b], [255, 255, 255])
  },
  '15_pilki.lgm': async (t) => {
    const p = t.world.getObject('piłka1')
    const before = [p.x, p.y]
    await sleep(300)
    assert.notDeepEqual([p.x, p.y], before, 'balls move in the background process')
  },
  '16_rekurencja_liczby.lgm': async (t) => {
    assert.equal(t.out[0], '1! = 1')
    assert.equal(t.out[9], '10! = 3628800')
  },
  '17_motyle.lgm': async (t) => {
    const count = () => t.world.turtles.filter((x) => x.parent?.name === 'Motyl').length
    assert.equal(count(), 8)
    const m = t.world.turtles.find((x) => x.parent?.name === 'Motyl')
    await settle(t.world.pointer('click', m.x, m.y, 0))
    assert.equal(count(), 7, 'clicked butterfly is removed')
    await sleep(150)
  },
}

test('examples: index.json and the .lgm files match (12–20 examples)', () => {
  assert.ok(Array.isArray(index))
  const listed = index.map((e) => e.file).sort()
  assert.deepEqual(listed, files)
  assert.ok(files.length >= 12 && files.length <= 20, `${files.length} examples`)
  for (const e of index) {
    assert.equal(typeof e.title, 'string')
    assert.ok(e.title.length > 0)
    assert.equal(typeof e.description, 'string')
    assert.ok(e.description.length > 0)
  }
})

for (const [file, speed] of [...files.map((f) => [f, 0]), ...files.map((f) => [f, 10])]) {
  test(`example ${file} runs without errors (speed ${speed})`, async () => {
    const t = makeTestLogo()
    // 0 = instant (the UI default, like the original); 10 = animated path with no frame delay
    t.world.speed = speed
    t.world.frameDelay = 0
    const src = fs.readFileSync(path.join(dir, file), 'utf8')
    // safety net: a hanging example is stopped (and then fails on the error check below)
    const guard = setTimeout(() => t.logo.stop(), 8000)
    try {
      const r = await t.run(src)
      assert.ok(r.ok, `${file}: ${t.errorTexts.join(' | ')}`)
      assert.ok(t.interp.getProcedure('starter'), `${file} defines starter`)
      const rs = await t.run('starter')
      assert.ok(rs.ok, `${file} starter: ${t.errorTexts.join(' | ')}`)
      await sleep(50) // let event handlers / processes started by starter make progress
      if (interact[file]) await interact[file](t)
      assert.deepEqual(t.errorTexts, [], `${file}: errors before stop`)
      if (file !== '12_slowa_i_listy.lgm') assert.ok(t.surface.ops.length > 0, `${file} draws something`)
    } finally {
      clearTimeout(guard)
      const n = t.errors.length
      t.logo.stop()
      await t.interp.waitForProcesses()
      const after = t.errors.slice(n)
      assert.ok(after.every((e) => e === 'Zatrzymano!'), `${file}: after stop ${after.join(' | ')}`)
    }
  })
}
