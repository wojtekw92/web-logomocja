// Tests for src/prims/math.js (PRIMITYWY.md §8, §9). Uses an isolated Registry with only the
// prims-data modules plus a minimal `pisz`, so it does not depend on other prims owners.
import test from 'node:test'
import assert from 'node:assert/strict'
import { Registry } from '../src/core/registry.js'
import { Interpreter } from '../src/core/interpreter.js'
import { formatValue } from '../src/core/values.js'
import { OutputSignal } from '../src/core/errors.js'
import * as math from '../src/prims/math.js'
import * as words from '../src/prims/words.js'

function setupData() {
  const out = []
  const errors = []
  const t1 = { name: 'ż1', isTurtle: true, vars: new Map(), procs: new Map(), events: new Map(), parent: null }
  const world = {
    turtles: [t1], activeTurtles: [t1], objects: new Map([['ż1', t1]]),
    async yield() {}, abort() {}, clearAbort() {}, checkAbort() {},
  }
  const io = {
    print: (s) => out.push(String(s)),
    printError: (text, err) => errors.push(err?.message ?? text),
  }
  const reg = new Registry()
  math.register(reg)
  words.register(reg)
  reg.define(['pisz', 'print'], { arity: 1, minArity: 0, maxArity: Infinity, fn: async (ctx, ...a) => { io.print(a.map((x) => formatValue(x, { top: true })).join(' ')) } })
  reg.define(['pokaż', 'show'], { arity: 1, minArity: 0, maxArity: Infinity, fn: async (ctx, ...a) => { io.print(a.map((x) => formatValue(x)).join(' ')) } })
  reg.define(['wynik', 'output'], { arity: 1, fn: async (ctx, v) => { throw new OutputSignal(v) } })
  const interp = new Interpreter({ registry: reg, world, io })
  /** Run source, return printed lines (and errors). */
  const run = async (src) => {
    out.length = 0
    errors.length = 0
    await interp.run(src)
    return { out: [...out], errors: [...errors] }
  }
  /** `pokaż <expr>` -> printed text; throws if there was an error. */
  const show = async (expr) => {
    const r = await run('pokaż ' + expr)
    if (r.errors.length) throw new Error(`${expr}: ${r.errors[0]}`)
    return r.out[0]
  }
  /** Error message produced by running src. */
  const err = async (src) => (await run(src)).errors[0]
  return { interp, reg, run, show, err }
}

const L = setupData()
const eq = async (expr, expected) => assert.equal(await L.show(expr), expected, expr)

test('arithmetic prefix forms', async () => {
  await eq('suma 2 3', '5')
  await eq('sum 2 3', '5')
  await eq('(suma 1 2 3 4)', '10')
  await eq('(suma)', '0')
  await eq('różnica 7 10', '-3')
  await eq('difference 7 3', '4')
  await eq('iloczyn 6 7', '42')
  await eq('(product 2 3 4)', '24')
  await eq('iloraz 7 2', '3.5')
  await eq('quotient 1 3', '0.333333')
  await eq('suma [25 17 50] [10 10 10]', '[35 27 60]')
  await eq('różnica [25 17 50] [10 10 10]', '[15 7 40]')
  await eq('iloczyn 2 [1 2 3]', '[2 4 6]')
  await eq('suma "2 "3', '5')
})

test('ilorazc, reszta, int, abs, zaokrąglij', async () => {
  await eq('ilorazc 11 4', '2')
  await eq('div 11.9 4.9', '2')
  await eq('ilorazc -7 2', '-3')
  await eq('reszta 11 3', '2')
  await eq('mod -11 3', '-2')
  await eq('reszta 11 -3', '2')
  await eq('reszta [11 12 13] 5', '[1 2 3]')
  await eq('abs -5', '5')
  await eq('int -99.9', '-99')
  await eq('int 3.7', '3')
  await eq('zaokrąglij 2.5', '3')
  await eq('round -2.5', '-3')
  await eq('zaokrąglij 2.4', '2')
})

test('division by zero', async () => {
  assert.equal(await L.err('pokaż iloraz 1 0'), 'Nie można dzielić przez zero')
  assert.equal(await L.err('pokaż ilorazc 1 0.5'), 'Nie można dzielić przez zero')
  assert.equal(await L.err('pokaż reszta 1 0'), 'Nie można dzielić przez zero')
})

test('roots, powers, logs, trig', async () => {
  await eq('pwk 2', '1.41421')
  await eq('sqrt 16', '4')
  await eq('potęga 2 10', '1024')
  await eq('power 9 0.5', '3')
  await eq('exp 0', '1')
  await eq('ln 1', '0')
  await eq('log 1000', '3')
  await eq('log10 100', '2')
  await eq('sin 30', '0.5')
  await eq('sin 180', '0')
  await eq('cos 90', '0')
  await eq('cos 60', '0.5')
  await eq('tg 45', '1')
  await eq('tan 0', '0')
  await eq('arctg 1', '45')
  await eq('arctan 0', '0')
  await eq('pi', '3.14159')
  assert.equal(await L.show('(sin 30) = 0.5'), 'prawda')
})

test('bad inputs use the typed name', async () => {
  assert.equal(await L.err('pokaż pwk -1'), 'pwk nie lubi -1 jako danej')
  assert.equal(await L.err('pokaż sqrt -4'), 'sqrt nie lubi -4 jako danej')
  assert.equal(await L.err('pokaż ln 0'), 'ln nie lubi 0 jako danej')
  assert.equal(await L.err('pokaż suma "a 1'), 'suma nie lubi a jako danej')
  assert.equal(await L.err('pokaż sum 1 "b'), 'sum nie lubi b jako danej')
  assert.equal(await L.err('pokaż losowa -3'), 'losowa nie lubi -3 jako danej')
  assert.equal(await L.err('pokaż tg 90'), 'tg nie lubi 90 jako danej')
})

test('losowa, losujOdNowa, jld', async () => {
  for (let i = 0; i < 50; i++) {
    const v = Number(await L.show('losowa 10'))
    assert.ok(Number.isInteger(v) && v >= 0 && v < 10)
  }
  await eq('losowa 1', '0')
  await eq('losowa 0.4', '0')
  const lst = JSON.parse((await L.show('losowa [256 256 256]')).replace(/ /g, ','))
  assert.equal(lst.length, 3)
  const seeded = async (src) => {
    const r = await L.run(src)
    assert.deepEqual(r.errors, [], src)
    assert.ok(r.out[0] && r.out[0].length > 2, src)
    return r.out[0]
  }
  const a = await seeded('(losujOdNowa 42)\npokaż (lista losowa 1000 losowa 1000 losowa 1000 los [a b c d e f g])')
  const b = await seeded('(randomize 42) pokaż (lista losowa 1000 losowa 1000 losowa 1000 los [a b c d e f g])')
  const c = await seeded('(losujOdNowa 43) pokaż (lista losowa 1000 losowa 1000 losowa 1000 los [a b c d e f g])')
  assert.equal(a, b)
  assert.notEqual(a, c)
  assert.deepEqual((await L.run('(losujOdNowa)')).errors, [])
  await eq('jld', 'jld')
  await eq('any', 'jld')
  const n = Number(await L.show('suma jld 0'))
  assert.ok(n >= 0 && n < 100)
})

test('vectors and bits', async () => {
  await eq('obróć [0 10] 90', '[10 0]')
  await eq('rotate [10 0] 90', '[0 -10]')
  await eq('kątWektorów [1 0] [0 1]', '90')
  await eq('vectorAngle [1 1] [1 1]', '0')
  await eq('kątWektorów [1 0] [-1 0]', '180')
  await eq('bitI 12 10', '8')
  await eq('bitLub 12 10', '14')
  await eq('bitAlbo 12 10', '6')
  await eq('bitNie 0', '-1')
  await eq('bitAnd 7 3', '3')
})

test('comparisons, maks, min', async () => {
  await eq('równe? 1 1', 'prawda')
  await eq('equal? "Ala "ala', 'prawda')
  await eq('(równe? 2 2 2)', 'prawda')
  await eq('(równe? 2 2 3)', 'fałsz')
  await eq('równe? [1 [2]] [1 [2]]', 'prawda')
  await eq('większe? 3 2', 'prawda')
  await eq('greater? 2 3', 'fałsz')
  await eq('mniejsze? 2 3', 'prawda')
  await eq('less? 3 2', 'fałsz')
  await eq('maks 3 7', '7')
  await eq('(maks 1 9 4)', '9')
  await eq('(max [4 8 2])', '8')
  await eq('min 3 7', '3')
  await eq('(min [4 8 2])', '2')
})

test('logic', async () => {
  await eq('(i 2>1 5>4 7>0)', 'prawda')
  await eq('i "prawda "fałsz', 'fałsz')
  await eq('and "true "true', 'prawda')
  await eq('lub "fałsz "prawda', 'prawda')
  await eq('or "false "false', 'fałsz')
  await eq('albo "prawda "prawda', 'fałsz')
  await eq('xor "prawda "fałsz', 'prawda')
  await eq('(albo "prawda "prawda "prawda)', 'prawda')
  await eq('nie "prawda', 'fałsz')
  await eq('not 1=2', 'prawda')
  await eq('prawda', 'prawda')
  await eq('true', 'prawda')
  await eq('fałsz', 'fałsz')
  await eq('false', 'fałsz')
  await eq('(i)', 'prawda')
  await eq('(lub)', 'fałsz')
  await eq('i 1 0', 'fałsz')
  // list input is evaluated lazily
  await eq('i "fałsz [iloraz 1 0]', 'fałsz')
  await eq('lub "prawda [iloraz 1 0]', 'prawda')
  await eq('i "prawda [1 < 2]', 'prawda')
  assert.equal(await L.err('pokaż nie "kot'), 'nie nie lubi kot jako danej')
})

test('extension prims may be redefined, core ones not', async () => {
  const r = await L.run('oto maks :a :b\nwynik 99\njuż\npokaż maks 1 2')
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.out, ['99'])
  for (const n of ['potęga', 'log', 'pi', 'maks', 'min']) assert.ok(L.reg.lookup(n).extension, n)
  assert.ok(!L.reg.lookup('suma').extension)
})
