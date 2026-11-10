// Tests for src/prims/io.js (PRIMITYWY.md §11 and czyśćTekst from §4).
import test from 'node:test'
import assert from 'node:assert/strict'
import { makeTestLogo } from './helpers.js'
import { noteToMidi } from '../src/prims/io.js'

async function run(src, opts) {
  const t = makeTestLogo(opts)
  await t.run(src)
  return t
}

test('pisz: top-level list without brackets, variadic with spaces, empty', async () => {
  const t = await run('pisz [bardzo [złożona [lista]]]\n(pisz "a "b [c d])\n(pisz)\nprint 1.5\npr "x')
  assert.deepEqual(t.out, ['bardzo [złożona [lista]]', 'a b c d', '', '1.5', 'x'])
})

test('pokaż keeps brackets', async () => {
  const t = await run('pokaż [1 [2]]\n(show "a [b])\nsh "c')
  assert.deepEqual(t.out, ['[1 [2]]', 'a [b]', 'c'])
})

test('wpisz buffers until the next line', async () => {
  const t = await run('wpisz "a wpisz [b c] pisz "d\n(type "x "y) pisz "')
  assert.deepEqual(t.out, ['ab cd', 'x y'])
})

test('wpisz uses io.write when present', async () => {
  const t = makeTestLogo()
  const raw = []
  t.interp.io.write = (s) => raw.push(s)
  await t.run('wpisz "a pisz "b')
  assert.deepEqual(raw, ['a', 'b\n'])
})

test('piszWiersz flattens all brackets', async () => {
  const t = await run('piszWiersz [a [b [c]] d]\n(pl "x [y])')
  assert.deepEqual(t.out, ['a b c d', 'x y'])
})

test('czyśćTekst calls io.clearText', async () => {
  const t = await run('pisz 1 czyśćTekst pisz 2\nct clearText pisz 3')
  assert.deepEqual(t.out, ['3'])
})

test('czytajListę / czytajSłowo use io.readLine', async () => {
  const t = await run('pokaż czytajListę\npokaż rl\npisz czytajSłowo + 1\npokaż rw', {
    input: ['ala [ma kota] 3', '', '41', 'tekst ze spacją'],
  })
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['[ala [ma kota] 3]', '[]', '42', 'tekst ze spacją'])
})

test('czytajListę passes the CL: prompt', async () => {
  const t = makeTestLogo()
  const prompts = []
  t.interp.io.readLine = async (p) => {
    prompts.push(p)
    return 'x'
  }
  await t.run('zignoruj cl')
  assert.deepEqual(prompts, ['CL: '])
})

test('keyboard: klawisz?, klawisz, czytajZnak, ostatniKlawisz', async () => {
  const t = makeTestLogo()
  await t.run('pisz klawisz? pokaż klawisz')
  t.world.key('a')
  t.world.key('b')
  await t.run('pisz key? pisz klawisz pisz czytajZnak pisz klawisz? pisz ostatniKlawisz')
  assert.deepEqual(t.out, ['fałsz', '', 'prawda', 'a', 'b', 'fałsz', 'b'])
})

test('czytajZnak / czytajKlawisz wait for a key', async () => {
  const t = makeTestLogo()
  setTimeout(() => t.world.key('ArrowLeft'), 30)
  setTimeout(() => t.world.key('z'), 60)
  await t.run('pisz czytajKlawisz pisz rc')
  assert.deepEqual(t.out, ['ArrowLeft', 'z'])
})

test('stanMyszy', async () => {
  const t = makeTestLogo()
  t.world.mouse.buttons = 1
  await t.run('pisz stanMyszy')
  assert.deepEqual(t.out, ['1'])
})

test('data, czas, zegar, zerujZegar', async () => {
  const t = await run('pisz count.ok\noto count.ok\nwynik 1\njuż')
  await t.run('pokaż data pokaż czas')
  const d = new Date()
  assert.equal(t.out[1], `[${d.getDate()} ${d.getMonth() + 1} ${d.getFullYear()}]`)
  assert.match(t.out[2], /^\[\d+ \d+ \d+\]$/)
  await t.run('zerujZegar czekaj 40 pisz zegar')
  const ms = Number(t.out[3])
  assert.ok(ms >= 30 && ms < 1000, String(ms))
  await t.run('resetT pisz timer < 30')
  assert.equal(t.out[4], 'prawda')
})

test('komunikat, oknoDialogowe, zapytaj via io hooks', async () => {
  const t = makeTestLogo()
  const seen = []
  t.interp.io.message = (s) => seen.push(['m', s])
  t.interp.io.dialog = (s, title, n) => {
    seen.push(['d', s, title, n])
    return 2
  }
  t.interp.io.ask = (s) => {
    seen.push(['a', s])
    return 'Ola'
  }
  await t.run('komunikat [Witaj świecie]\npisz (oknoDialogowe "Pytanie "Tytuł 3)\npisz zapytaj "Imię?')
  assert.deepEqual(seen, [['m', 'Witaj świecie'], ['d', 'Pytanie', 'Tytuł', 3], ['a', 'Imię?']])
  assert.deepEqual(t.out, ['2', 'Ola'])
})

test('komunikat / oknoDialogowe fall back to printing in Node', async () => {
  const t = await run('message "hej\npisz dialogBox "pytanie')
  assert.deepEqual(t.out, ['hej', 'pytanie', '1'])
})

test('zapytaj falls back to readLine', async () => {
  const t = await run('pisz zapytaj "Ile?', { input: ['12'] })
  assert.deepEqual(t.out, ['12'])
})

test('zapytaj is redefinable (rozszerzenie); others are not', async () => {
  const t = await run('oto zapytaj :x\nwynik 1\njuż\noto pisz :x\njuż')
  assert.deepEqual(t.errors, ['pisz jest procedurą pierwotną'])
})

test('powiedz, grajPlik, pokażDokument are silent no-ops without a browser', async () => {
  const t = await run('powiedz "dzień grajPlik "a.wav\npokażDokument "https://example.com\npisz "ok')
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['ok'])
})

test('pokażDokument uses io.openUrl', async () => {
  const t = makeTestLogo()
  const urls = []
  t.interp.io.openUrl = (u) => urls.push(u)
  await t.run('showDoc "https://example.com')
  assert.deepEqual(urls, ['https://example.com'])
})

test('nuta, pauza, graj take their time', async () => {
  const t = makeTestLogo()
  const t0 = Date.now()
  await t.run('nuta 60 30 pauza 20 graj [c [e 20] p [g5 10] 64]')
  // 30 + 20 + 250 + 20 + 250 + 10 + 250
  assert.ok(Date.now() - t0 >= 780, String(Date.now() - t0))
  assert.deepEqual(t.errors, [])
  await t.run('nuta "xyz 10')
  assert.deepEqual(t.errors, ['nuta nie lubi xyz jako danej'])
})

test('noteToMidi', () => {
  assert.equal(noteToMidi('c'), 60)
  assert.equal(noteToMidi('a'), 69)
  assert.equal(noteToMidi('cis'), 61)
  assert.equal(noteToMidi('h'), 71)
  assert.equal(noteToMidi('c5'), 72)
  assert.equal(noteToMidi(64), 64)
  assert.equal(noteToMidi('kot'), null)
})

test('zapiszTekst / ładujTekst (in-memory fallback)', async () => {
  const t = await run('zapiszTekst "notatka [ala ma kota]\npisz ładujTekst "notatka\npisz loadText "NOTATKA')
  assert.deepEqual(t.out, ['ala ma kota', 'ala ma kota'])
  await t.run('pisz ładujTekst "brak')
  assert.deepEqual(t.errors, ['ładujTekst nie lubi brak jako danej'])
})

test('piszDo redirects to a file and back', async () => {
  const t = await run('piszDo "wynik.txt\npisz "a\npokaż [b]\npiszDo []\npisz "c\npokaż ładujTekst "wynik.txt')
  assert.deepEqual(t.out, ['c', '|a\n[b]\n|'.replace(/\|/g, '')])
})

test('zapiszProjekt / ładujProjekt round-trip and .imp import with starter', async () => {
  const t = await run('oto kw :x\npisz :x * :x\njuż\n(zapiszProjekt "p.lgm)\nusuńWszystko\nładujProjekt "p.lgm\nkw 3')
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['9'])
  t.interp.io.loadProject = async () => "LGF05 polishTX\ndefiniuj'Starter |oto starter¶pisz \"start¶już|\ndefiniuj'Dwa |oto dwa¶wynik 2¶już|\n"
  await t.run('ładujProjekt "x.imp pisz dwa')
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['9', 'start', '2'])
})

test('unfinished wpisz text becomes part of the input prompt', async () => {
  const t = makeTestLogo()
  const prompts = []
  t.interp.io.readLine = async (p) => {
    prompts.push(p)
    return '5'
  }
  await t.run('wpisz "|Ile? | pisz czytajSłowo')
  assert.deepEqual(prompts, ['Ile? '])
  assert.deepEqual(t.out, ['5'])
})
