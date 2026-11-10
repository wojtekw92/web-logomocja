// Regression tests for verified defects (fixer pass). Owner: fixer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTestLogo } from './helpers.js'
import { buildProject, parseProject, globalsSource, repairMissingEnds } from '../src/ui/project.js'
import { ProcedureEditor } from '../src/ui/editor.js'
import { parse } from '../src/core/parser.js'

async function logo(src) {
  const t = makeTestLogo()
  if (src) await t.run(src)
  return t
}

// ---------------------------------------------------------------- graphics: clipping to the range

test('okno with a turtle range: the line is clipped to the range', async () => {
  const t = await logo('ugp 3 ustalZakres [-50 -50 50 50] okno np 80 pisz kolorPunktuW [0 70] pisz kolorPunktuW [0 40] pokaż poz')
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['15', '0', '[0 80]'])
})

test('one-step shapes are clipped to the turtle range (koło, wielokąt, okrąg, kropka)', async () => {
  let t = await logo('ugp 3 ustalZakres [-50 -50 50 50] ukm 12 koło 200 pisz kolorPunktuW [0 80] pisz kolorPunktuW [0 40]')
  assert.deepEqual(t.out, ['15', '12'])
  t = await logo('ustalZakres [-50 -50 50 50] ukm 12 wielokąt [4 [200 90]] pisz kolorPunktuW [150 150] pisz kolorPunktuW [10 10]')
  assert.deepEqual(t.out, ['15', '12'])
  t = await logo('ustalZakres [-50 -50 50 50] ugp 3 okrąg 160 pisz kolorPunktuW [0 80] pisz kolorPunktuW [0 -80]')
  assert.deepEqual(t.out, ['15', '15'])
  t = await logo('ustalZakres [-50 -50 50 50] ukp 4 kropka 300 pisz kolorPunktuW [100 0] pisz kolorPunktuW [20 0]')
  assert.deepEqual(t.out, ['15', '4'])
  // without a range nothing changes
  t = await logo('ukm 12 koło 200 pisz kolorPunktuW [0 80]')
  assert.deepEqual(t.out, ['12'])
})

test('koło and elipsaZamalowana draw nothing with the pen up (API_NOTES)', async () => {
  let t = await logo('pod ukm 12 koło 50 pisz kolorPodŻółwiem')
  assert.deepEqual(t.out, ['15'])
  t = await logo('pod ukm 12 elipsaZamalowana [20 30] pisz kolorPodŻółwiem')
  assert.deepEqual(t.out, ['15'])
  t = await logo('ukm 12 koło 50 pisz kolorPodŻółwiem')
  assert.deepEqual(t.out, ['12'])
})

// ---------------------------------------------------------------- pages

test('pokażStronę fires gdyPokazanaStrona of the shown page', async () => {
  const t = await logo('nowaStrona s2\'ustalZdarzenie "gdyPokazanaStrona [pisz "show] pokażStronę "s2 czekaj 20')
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['show'])
})

// ---------------------------------------------------------------- core

test('apostrophe call: inputs are evaluated by the addressee (§1.3, like proszę)', async () => {
  let t = await logo('nowy "Żółw [kierunek 90] ż2\'pisz kierunek proszę "ż2 [pisz kierunek]')
  assert.deepEqual(t.out, ['90', '90'])
  t = await logo('nowy "Żółw [] ż2\'pisz mojaNazwa')
  assert.deepEqual(t.out, ['ż2'])
  t = await logo('nowy "Żółw [poz [5 0]] pod ż2\'ustalPoz poz pokaż ż2\'poz')
  assert.deepEqual(t.out, ['[5 0]'])
  // caller's local variables are still visible
  t = await logo('nowy "Żółw []\noto f :d\n  ż2\'pod ż2\'np :d pokaż ż2\'poz\njuż\nf 30')
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['[0 30]'])
})

test('slider settings readable with apostrophe: min, maks/max, wartość, pionowy', async () => {
  const t = await logo(`nowy "Suwak [min 5 maks 50 wartość 30]
pisz suw1'wartość
pisz suw1'min
pisz suw1'max
pisz suw1'maks
pisz suw1'pionowy
proszę "suw1 [pisz pionowy]
pisz min 3 4`)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['30', '5', '50', '50', 'fałsz', 'fałsz', '3'])
})

test('unmatched ) is reported before anything on the line runs', async () => {
  let t = await logo('pisz 1)')
  assert.deepEqual(t.out, [])
  assert.deepEqual(t.errors, ['Nieoczekiwany )'])
  t = await logo('pisz suma 1 2)')
  assert.deepEqual(t.out, [])
  assert.deepEqual(t.errors, ['Nieoczekiwany )'])
  t = await logo('uruchom [pisz 1 pisz 2)]')
  assert.deepEqual(t.out, [])
  assert.deepEqual(t.errors, ['Nieoczekiwany )'])
  t = await logo('pisz (suma 1 2 3)')
  assert.deepEqual(t.out, ['6'])
})

test('parens inside list literals stay in the words', async () => {
  const t = await logo(`pokaż [(a b)]
pisz długość [(suma 1 2)]
uruchom [pisz (suma 1 2 3)]
powtórz 1 [pisz 5 -(3)]
nowy "Żółw [kolPis (2 + 2)] pisz ż2'kolPis`)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['[(a b)]', '3', '6', '2', '4'])
})

test('parens after quoted or bar words inside lists still close the expression', async () => {
  const t = await logo(`uruchom [pisz (słowo "a "b)]
powtórz 1 [(pisz "a "b)]
uruchom [pisz (słowo "a |x y|)]
oto f :n
  jeśli :n > 0 [wynik (lista "x "y)]
  wynik []
już
pokaż f 1
pokaż [(a "b)]
uruchom [pisz (słowo "a "\\))]`)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['ab', 'a b', 'ax y', '[x y]', '[(a "b )]', 'a)'])
})

test('missing już at the end: stored source is complete and projects round-trip', async () => {
  const t = await logo('oto d\n  pisz 4\n')
  assert.equal(t.interp.procedureSource('d'), 'oto d\n  pisz 4\njuż')
  await t.run('przypisz "zm 7')
  const text = buildProject({ name: 'p', procedures: [t.interp.procedureSource('d'), 'oto e\npisz 5\njuż'], globals: t.interp.globals })
  const t2 = await logo(parseProject(text).source + '\nd e pisz :zm')
  assert.deepEqual(t2.errors, [])
  assert.deepEqual(t2.out, ['4', '5', '7'])
})

test('old saves with a missing już still load (repairMissingEnds)', async () => {
  const old = 'oto d\n  pisz 4\n\noto e pisz 5 już\n\noto f\npisz 6\njuż\n'
  assert.throws(() => parse(old))
  const fixed = repairMissingEnds(old)
  const p = parse(fixed)
  assert.deepEqual(p.definitions.map((d) => d.name), ['d', 'e', 'f'])
  assert.equal(repairMissingEnds('oto a\npisz 1\njuż\n'), 'oto a\npisz 1\njuż\n')
  const t = await logo(parseProject(old).source + '\nd e f')
  assert.deepEqual(t.out, ['4', '5', '6'])
})

test('globals restore keeps multi-line word values whole (globalsSource)', async () => {
  const t = await logo('przypisz "q (słowo "a znak 10 "b) przypisz "r 5')
  const text = buildProject({ procedures: ['oto g\n  przypisz "x 1\njuż'], globals: t.interp.globals })
  const src = globalsSource(parseProject(text).source)
  const t2 = await logo(src)
  assert.deepEqual(t2.errors, [])
  assert.equal(t2.interp.globals.get('q'), 'a\nb')
  assert.equal(t2.interp.globals.get('r'), 5)
  assert.equal(t2.interp.globals.has('x'), false) // procedure bodies are not run
})

test('parser error is printed with a single "w procedurze"', async () => {
  const t = await logo('oto d\n  pisz 4\n\noto e pisz 5 już\n')
  assert.deepEqual(t.errors, ['Brakuje już w procedurze d'])
  assert.equal(t.errorTexts[0].split('\n')[0], 'Brakuje już w procedurze d')
})

test('deep paren nesting and bare : give clean messages', async () => {
  let t = await logo('pisz ' + '('.repeat(3000) + '1' + ')'.repeat(3000))
  assert.deepEqual(t.errors, ['Za mało pamięci (za głęboka rekurencja)'])
  t = await logo('pisz ' + '('.repeat(300) + '1' + ')'.repeat(300))
  assert.deepEqual(t.out, ['1'])
  t = await logo('pisz :')
  assert.deepEqual(t.errors, ['Nie wiem jak wykonać :'])
})

// ---------------------------------------------------------------- io / ui

test('czytajKlawisz uses io.readKey (key name), czytajZnak maps Enter to \\r on every path', async () => {
  const t = makeTestLogo()
  const keys = ['ArrowLeft', 'Enter', '\n']
  t.logo.io.readKey = async () => keys.shift()
  t.logo.io.readChar = async () => keys.shift()
  if (t.interp.io !== t.logo.io) { t.interp.io.readKey = t.logo.io.readKey; t.interp.io.readChar = t.logo.io.readChar }
  await t.run('pokaż czytajKlawisz pisz ascii czytajZnak pisz ascii czytajZnak')
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['ArrowLeft', '13', '13'])
})

test('editor newProcedure escapes regex characters in the name', () => {
  const fakeEl = () => ({ value: '', innerHTML: '', textContent: '', addEventListener() {}, focus() {}, setSelectionRange() {}, closest: () => null })
  const t = makeTestLogo()
  const ed = new ProcedureEditor({ textarea: fakeEl(), pre: fakeEl(), status: fakeEl(), interp: t.interp, isPrimitive: () => false })
  ed.highlight = () => {}
  assert.doesNotThrow(() => ed.newProcedure('f('))
  assert.match(ed.ta.value, /oto f\(\n/)
  ed.newProcedure('f(')
  assert.match(ed.ta.value, /oto f\(2\n/)
})
