// Cross-module behaviour added at integration (core flags used by prims, RNG hook, widgets).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTestLogo } from './helpers.js'
import { parse, needsMoreInput } from '../src/core/parser.js'

test('tail call through jeśli / jeżeli / uruchom runs in constant depth', async () => {
  const t = makeTestLogo()
  await t.run('oto r :n\njeśli :n > 0 [r :n - 1]\njuż\nr 30000 pisz "a')
  await t.run('oto q :n\njeżeli :n > 0 [q :n - 1] [pisz "b]\njuż\nq 30000')
  await t.run('oto u :n\nuruchom [jeśli :n > 0 [u :n - 1]]\njuż\nu 30000 pisz "c')
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['a', 'b', 'c'])
  // condition given as a list (with a tail-capable primitive inside) keeps working
  await t.run('oto dod? :n\nwynik :n > 0\njuż\noto w :n\njeśli [jeżeli :n > -1 [dod? :n] [fałsz]] [w :n - 1]\njuż\nw 30000 pisz "d')
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['a', 'b', 'c', 'd'])
  t.out.length = 0
  t.out.push('a', 'b', 'c')
  // not in tail position: still ordinary recursion with its output order
  await t.run('oto s :n\njeśli :n > 0 [s :n - 1 pisz :n]\njuż\ns 3')
  assert.deepEqual(t.out, ['a', 'b', 'c', '1', '2', '3'])
})

test('discardable: nowy as a command, also inside jeśli/uruchom; its value still usable', async () => {
  const t = makeTestLogo()
  await t.run('nowy "Żółw [] jeśli prawda [nowy "Żółw []] uruchom [nowy "Żółw []] pokaż wszystkie')
  await t.run('pokaż nowy "Żółw []')
  await t.run('"ż9')
  assert.deepEqual(t.out, ['[ż1 ż2 ż3 ż4]', 'ż5'])
  assert.deepEqual(t.errors, ['Nie wiem co zrobić z ż9'])
})

test('niech [a 1 b 2] without parentheses; redaguj "x / zapiszProjekt "x take the quoted word', async () => {
  const t = makeTestLogo()
  const edited = []
  t.logo.io.edit = (n) => edited.push(n)
  await t.run('oto p\nniech [a 1 b 2]\npisz :a + :b\njuż\np')
  await t.run('redaguj "kw pisz "dalej')
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['3', 'dalej'])
  assert.deepEqual(edited, ['kw'])
})

test('poziomGłówny is silent', async () => {
  const t = makeTestLogo()
  await t.run('oto p\npoziomGłówny\npisz "nie\njuż\np')
  assert.deepEqual(t.errors, [])
  await t.run('pisz "tak')
  assert.deepEqual(t.out, ['tak'])
})

test('losujOdNowa makes jld everywhere reproducible (core, colours, turtle ranges)', async () => {
  const t = makeTestLogo()
  const prog = '(losujOdNowa 7) pokaż (lista losowa 1000 naRGB jld jld + 0) np jld pw jld pokaż poz pokaż kierunek'
  await t.run(prog)
  const first = [...t.out]
  t.out.length = 0
  await t.run('wróć ' + prog)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, first)
})

test('one-line oto … już and needsMoreInput', () => {
  const p = parse('oto kw :b powtórz 4 [np :b pw 90] już\nkw 10')
  assert.equal(p.definitions.length, 1)
  assert.deepEqual(p.definitions[0].params, ['b'])
  assert.equal(p.bodyLines.length, 1)
  assert.equal(needsMoreInput('oto a pisz 1 już'), false)
  assert.equal(needsMoreInput('oto a :x'), true)
})

test("widgets: prz1'ustalPoz / poz / schowajMnie use the widget; its own handler drives the turtle", async () => {
  const t = makeTestLogo()
  await t.run('nowy "Przycisk [poz [10 10] gdyWciśnięty [ustalPoz [5 5]]]')
  await t.run("prz1'ustalPoz [50 60] pokaż poz pokaż prz1'poz prz1'schowajMnie pokaż widoczny pokaż prz1'widoczny")
  assert.deepEqual(t.out, ['[0 0]', '[50 60]', 'prawda', 'fałsz'])
  const ps = t.world.dispatchEvent('gdyWciśnięty', { target: 'prz1' })
  await Promise.all((ps || []).map((p) => p.promise))
  await t.run('pokaż poz')
  assert.equal(t.out.at(-1), '[5 5]')
  assert.deepEqual(t.errors, [])
})

test('ustaw "postać with a drawing list; page settings through Page#setSetting', async () => {
  const t = makeTestLogo()
  await t.run('ustaw "postać [powtórz 4 [np 10 pw 90]] pokaż lista? postać')
  await t.run("s1'ustaw \"kolTła \"żółty pokaż kolTła")
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['prawda', '14'])
  assert.equal(t.world.page.setSetting('rozmiar', [400, 300]), true)
  assert.deepEqual([t.world.page.width, t.world.page.height], [400, 300])
})
