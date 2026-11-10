// Tests for src/prims/words.js (PRIMITYWY.md §10). Isolated registry (see math.test.js).
import test from 'node:test'
import assert from 'node:assert/strict'
import { Registry } from '../src/core/registry.js'
import { Interpreter } from '../src/core/interpreter.js'
import { formatValue } from '../src/core/values.js'
import { OutputSignal } from '../src/core/errors.js'
import * as math from '../src/prims/math.js'
import * as words from '../src/prims/words.js'
import { charCode, codeChar } from '../src/prims/words.js'

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

test('pierw, ost, bezPierw, bezOst', async () => {
  await eq('pierw "kotek', 'k')
  await eq('first [a b c]', 'a')
  await eq('pierw 123', '1')
  await eq('pierw [[a b] c]', '[a b]')
  await eq('ost "kotek', 'k')
  await eq('ostw [a b c]', 'c')
  await eq('last "żółw', 'w')
  await eq('bezPierw "kotek', 'otek')
  await eq('bp [a b c]', '[b c]')
  await eq('bf [a]', '[]')
  await eq('bezOst "kotek', 'kote')
  await eq('bo [a b c]', '[a b]')
  await eq('butLast "ąę', 'ą')
  assert.equal(await L.err('pokaż pierw []'), 'pierw nie lubi [] jako danej')
  assert.equal(await L.err('pokaż bp "'), 'bp nie lubi " jako danej')
})

test('element, bezElNum, bezElementu, zastąp', async () => {
  await eq('element 4 "kotek', 'e')
  await eq('item 2 [a [b c] d]', '[b c]')
  await eq('element [2 4] "kotek', 'ote')
  await eq('element [2 3] [a b c d]', '[b c]')
  assert.equal(await L.err('pokaż element 7 "kotek'), 'element nie lubi 7 jako danej')
  await eq('bezElNum 2 [a b c]', '[a c]')
  await eq('ben 1 "kot', 'ot')
  await eq('butItem 3 "kot', 'ko')
  await eq('bezElementu "a [a b a c]', '[b c]')
  await eq('be "a "banana', 'bnn')
  await eq('butMember 1 [1 2 1]', '[2]')
  await eq('zastąp 2 [a b c] "x', '[a x c]')
  await eq('replace 1 "kot "b', 'bot')
  await eq('zastąp 2 [a b c] [x y]', '[a [x y] c]')
})

test('elementGłęboki, zastąpGłęboko', async () => {
  await eq('elementGłęboki [2 1] [a [b c] d]', 'b')
  await eq('deepItem [2 2 1] [a [b [c d]] e]', 'c')
  await eq('elementGłęboki 3 [a b c]', 'c')
  await eq('zastąpGłęboko [2 1] [a [b c] d] "x', '[a [x c] d]')
  await eq('deepReplace [1] [a b] "z', '[z b]')
})

test('los, długość, membership', async () => {
  for (let i = 0; i < 20; i++) assert.ok(['a', 'b', 'c'].includes(await L.show('los [a b c]')))
  assert.ok('kot'.includes(await L.show('pick "kot')))
  await eq('długość [[a b] [98 87]]', '2')
  await eq('count "żółw', '4')
  await eq('długość "', '0')
  await eq('długość 3.5', '3')
  await eq('element? "a "trasa', 'prawda')
  await eq('member? "x "trasa', 'fałsz')
  await eq('element? "b [a b c]', 'prawda')
  await eq('element? "B [a b c]', 'prawda')
  await eq('element? [b] [a [b] c]', 'prawda')
  await eq('numel "dc "abcdedcba', '6')
  await eq('member "c [a b c]', '3')
  await eq('numel "z "abc', '0')
  await eq('odElementu "c [a b c d]', '[c d]')
  await eq('fromMember "de "abcdef', 'def')
  await eq('odElementu "z [a b]', '[]')
})

test('predicates', async () => {
  await eq('puste? "', 'prawda')
  await eq('empty? []', 'prawda')
  await eq('puste? [a]', 'fałsz')
  await eq('liczba? 12', 'prawda')
  await eq('number? "12', 'prawda')
  await eq('liczba? "a', 'fałsz')
  await eq('lista? [a]', 'prawda')
  await eq('list? "a', 'fałsz')
  await eq('słowo? "a', 'prawda')
  await eq('word? 12', 'prawda')
  await eq('słowo? []', 'fałsz')
})

test('constructors', async () => {
  await eq('lista [x y] "d', '[[x y] d]')
  await eq('(list 1 2 3)', '[1 2 3]')
  await eq('(lista)', '[]')
  await eq('zdanie [x y] "d', '[x y d]')
  await eq('(se "a [b [c]] "d)', '[a b [c] d]')
  await eq('zd [] []', '[]')
  await eq('słowo "kot "ek', 'kotek')
  await eq('(word "a 1 "b)', 'a1b')
  assert.equal(await L.err('pokaż słowo "a [b]'), 'słowo nie lubi [b] jako danej')
  await eq('nap "a [b c]', '[a b c]')
  await eq('fPut "k "ot', 'kot')
  await eq('nak "a [b c]', '[b c a]')
  await eq('nak "kot "łos', 'łoskot')
  await eq('lPut [x] [a]', '[a [x]]')
})

test('wspak, tasuj, sortuj', async () => {
  await eq('wspak "kotek', 'ketok')
  await eq('reverse [1 [2 3] 4]', '[4 [2 3] 1]')
  const t = await L.show('tasuj [1 2 3 4 5]')
  assert.deepEqual(t.slice(1, -1).split(' ').sort(), ['1', '2', '3', '4', '5'])
  assert.equal([...(await L.show('shuffle "abc'))].sort().join(''), 'abc')
  await eq('sortuj [c 10 a 2 b]', '[2 10 a b c]')
  await eq('sort [żaba zebra ćma cebula łódź lis]', '[cebula ćma lis łódź zebra żaba]')
  await eq('sortuj [3 -1 2.5]', '[-1 2.5 3]')
  await eq('sortuj "dcba', 'abcd')
})

test('generuj, mapuj, filtruj', async () => {
  await eq('generuj 3 [:%+1] 100', '[100 101 102]')
  await eq('generate 4 [:% * 2] 1', '[1 2 4 8]')
  await eq('generuj 0 [:%] 1', '[]')
  await eq('mapuj [:% * :%] [1 2 3]', '[1 4 9]')
  await eq('map [słowo :% "!] [a b]', '[a! b!]')
  await eq('filtruj [:% > 5] [1 2 3 4 5 6 7 8]', '[6 7 8]')
  await eq('filter [element? :% "aeiou] "programowanie', 'oaoaie')
  const r = await L.run('oto kw :x\nwynik :x * :x\njuż\npokaż mapuj "kw [1 2 3]')
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.out, ['[1 4 9]'])
})

test('ascii and znak use Windows-1250', async () => {
  await eq('ascii "a', '97')
  await eq('ascii "Ala', '65')
  await eq('znak 65', 'A')
  await eq('char 97', 'a')
  await eq('ascii "ą', '185')
  await eq('ascii "ł', '179')
  await eq('ascii "ż', '191')
  await eq('ascii "Ś', '140')
  await eq('ascii "ę', '234')
  await eq('ascii "Ż', '175')
  await eq('znak 185', 'ą')
  await eq('znak 163', 'Ł')
  await eq('znak 156', 'ś')
  await eq('ascii "€', '128')
  await eq('ascii "☺', String('☺'.codePointAt(0)))
  await eq('znak 9786', '☺')
  for (const ch of 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ') assert.equal(codeChar(charCode(ch)), ch)
  assert.equal(await L.err('pokaż ascii "'), 'ascii nie lubi " jako danej')
  assert.equal(await L.err('pokaż znak "x'), 'znak nie lubi x jako danej')
})

test('wielkie, małe', async () => {
  await eq('wielkie "żółw', 'ŻÓŁW')
  await eq('uppercase [ala [ma]]', '[ALA [MA]]')
  await eq('małe "KOT', 'kot')
  await eq('lowercase "ĄĘ', 'ąę')
  assert.ok(L.reg.lookup('wielkie').extension && L.reg.lookup('małe').extension)
})
