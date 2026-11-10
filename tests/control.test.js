// Tests for src/prims/control.js (PRIMITYWY.md §6, §7) and the name coverage of §5/§6/§7/§11.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { makeTestLogo } from './helpers.js'
import { Registry } from '../src/core/registry.js'
import { register as regControl } from '../src/prims/control.js'
import { register as regVars } from '../src/prims/variables.js'
import { register as regIo } from '../src/prims/io.js'

async function run(src, opts) {
  const t = makeTestLogo(opts)
  await t.run(src)
  return t
}

// ------------------------------------------------------------------ name coverage

function tableNames(section) {
  const md = readFileSync(new URL('../docs/PRIMITYWY.md', import.meta.url), 'utf8')
  const start = md.indexOf(`\n## ${section}`)
  const end = md.indexOf('\n## ', start + 5)
  const rows = []
  for (const line of md.slice(start, end).split('\n')) {
    if (!line.startsWith('| ') || line.startsWith('| nazwa') || line.startsWith('|---')) continue
    const cells = line.split(/(?<!\\)\|/).map((c) => c.trim())
    const canon = cells[1]
    const aliases = cells[2] === '—' ? [] : cells[2].split(',').map((s) => s.trim()).filter(Boolean)
    rows.push([canon, aliases])
  }
  return rows
}

test('every name and alias of §5, §6, §7, §11 (+ czyśćTekst) is registered under its canonical name', () => {
  const reg = new Registry()
  regControl(reg)
  regVars(reg)
  regIo(reg)
  const rows = [
    ...tableNames('5. Zmienne'),
    ...tableNames('6. Sterowanie'),
    ...tableNames('7. Procedury').filter(([c]) => c !== 'oto' && c !== 'już'),
    ...tableNames('11. Wejście/wyjście'),
    ['czyśćTekst', ['ct', 'clearText']],
  ]
  assert.ok(rows.length > 80, `parsed ${rows.length} rows`)
  for (const [canon, aliases] of rows) {
    for (const n of [canon, ...aliases]) {
      assert.equal(reg.lookup(n)?.name, canon, `${n} -> ${canon}`)
    }
  }
})

test('full system: none of my names is overwritten by another prims module', () => {
  const mine = new Registry()
  regControl(mine)
  regVars(mine)
  regIo(mine)
  const all = makeTestLogo().logo.registry
  for (const [key, spec] of mine.table) {
    const o = all.lookup(key)
    assert.ok(o && o.name === spec.name && o.doc === spec.doc, `${key} overridden by ${o?.name}`)
  }
})

// ------------------------------------------------------------------ loops

test('powtórz with numpow, rounding, n < 1', async () => {
  const t = await run('powtórz 3 [pisz numpow]\npowtórz 2.5 [pisz "x]\npowtórz 0 [pisz "nie]\npowtórz -2 [pisz "nie]')
  assert.deepEqual(t.out, ['1', '2', '3', 'x', 'x', 'x'])
  assert.deepEqual(t.errors, [])
})

test('repeat alias, nested loops, repcount of nearest loop', async () => {
  const t = await run('repeat 2 [powtórz 2 [wpisz repcount] pisz npw]')
  assert.deepEqual(t.out, ['121', '122'])
})

test('numpow inside a procedure called from a loop; -1 outside', async () => {
  const t = await run('oto p\npisz numpow\njuż\npowtórz 2 [p]\npisz numpow')
  assert.deepEqual(t.out, ['1', '2', '-1'])
})

test('powtórz body leaving a value is an error', async () => {
  const t = await run('powtórz 2 [5]')
  assert.deepEqual(t.errors, ['Nie wiem co zrobić z 5'])
})

test('powtórz bad count', async () => {
  const t = await run('powtórz "abc [pisz 1]')
  assert.deepEqual(t.errors, ['powtórz nie lubi abc jako danej'])
})

test('dopóki', async () => {
  const t = await run('przypisz "i 0\ndopóki [:i < 3] [zwiększ "i pisz :i]')
  assert.deepEqual(t.out, ['1', '2', '3'])
})

test('dla: up, down, step, step 0, from = to, expressions, wrong sign', async () => {
  const t = await run(
    [
      'dla "x [1 5 3] [wpisz :x] pisz "',
      'dla "x [3 1] [wpisz :x] pisz "',
      'dla "x [1 3] [wpisz numpow] pisz "',
      'dla "x [2 9 0] [wpisz :x] pisz "',
      'dla "x [4 4] [wpisz :x] pisz "',
      'przypisz "n 3 dla "x [0 :n - 1] [wpisz :x] pisz "',
      'dla "x [1 5 -1] [wpisz :x] pisz "',
      'dla "x [0 1 0.25] [wpisz :x wpisz "| |] pisz "',
    ].join('\n'),
  )
  assert.deepEqual(t.out, ['14', '321', '123', '2', '4', '012', '', '0 0.25 0.5 0.75 1 '])
  assert.deepEqual(t.errors, [])
})

test('dla loop variable is local to the loop', async () => {
  const t = await run('dla "q [1 2] []\npisz nazwa? "q')
  assert.deepEqual(t.out, ['fałsz'])
})

test('dlaKażdego over list and word (Polish letters), with npw', async () => {
  const t = await run('dlaKażdego "e [a [b c] 3] [pokaż :e]\ndlaKażdego "z "żółw [wpisz :z wpisz npw] pisz "')
  assert.deepEqual(t.out, ['a', '[b c]', '3', 'ż1ó2ł3w4'])
})

test('pętla with stop inside procedure', async () => {
  const t = await run('oto p\nprzypisz "i 0\npętla [zwiększ "i jeśli :i > 4 [stop]]\njuż\np pisz :i')
  assert.deepEqual(t.out, ['5'])
})

test('wynik from inside a loop', async () => {
  const t = await run('oto f\npowtórz 10 [jeśli numpow = 3 [wynik numpow * 10]]\nwynik 0\njuż\npisz f')
  assert.deepEqual(t.out, ['30'])
})

// ------------------------------------------------------------------ conditionals

test('jeśli with and without else; as function', async () => {
  const t = await run('jeśli 1 < 2 [pisz "tak]\njeśli 1 > 2 [pisz "tak]\njeśli 1 > 2 [pisz "a] [pisz "b]\npisz jeśli "prawda [1] [2]')
  assert.deepEqual(t.out, ['tak', 'b', '1'])
})

test('jeśli: bad condition', async () => {
  const t = await run('jeśli "kot [pisz 1]')
  assert.deepEqual(t.errors, ['jeśli nie lubi kot jako danej'])
})

test('jeśli: condition as list, numeric probability', async () => {
  const t = await run('jeśli [2 > 1] [pisz 1]\njeśli 1 [pisz 2]\njeśli 0 [pisz 3]')
  assert.deepEqual(t.out, ['1', '2'])
})

test('jeżeli / ifElse as function (silnia)', async () => {
  const t = await run('oto silnia :n\nwynik jeżeli :n < 2 [1] [:n * silnia :n - 1]\njuż\npisz silnia 5\nifElse "fałsz [pisz 1] [pisz 2]')
  assert.deepEqual(t.out, ['120', '2'])
})

test('test / jeśliTak / jeśliNie in a procedure and at top level across lines', async () => {
  const t = await run('oto p :x\ntest :x > 0\njeśliTak [pisz "plus]\njeśliNie [pisz "minus]\njuż\np 3 p -3')
  assert.deepEqual(t.out, ['plus', 'minus'])
  await t.run('test 1 = 1')
  await t.run('ift [pisz "ok] iff [pisz "zle]')
  assert.deepEqual(t.out, ['plus', 'minus', 'ok'])
})

test('wybierz: several selectors, default, value', async () => {
  const t = await run(
    'oto jaki :x\nwybierz :x [1 [pisz "jeden] 2 3 [pisz "dwatrzy] [pisz "inne]]\njuż\njaki 1 jaki 3 jaki 9\npisz wybierz "b [a ["A] b ["B]]\ncase "x [y [pisz 1]]',
  )
  assert.deepEqual(t.out, ['jeden', 'dwatrzy', 'inne', 'B'])
})

// ------------------------------------------------------------------ run / wait / stop

test('uruchom list and word, as function', async () => {
  const t = await run('uruchom [pisz 1 pisz 2]\npisz uruchom [3 + 4]\nrun "|pisz 5|')
  assert.deepEqual(t.out, ['1', '2', '7', '5'])
})

test('czekaj waits (ms)', async () => {
  const t = makeTestLogo()
  const t0 = Date.now()
  await t.run('czekaj 60 pisz 1')
  assert.ok(Date.now() - t0 >= 50)
  assert.deepEqual(t.out, ['1'])
})

test('czekaj is interrupted by Stop', async () => {
  const t = makeTestLogo()
  const t0 = Date.now()
  const p = t.run('czekaj 5000 pisz 1')
  setTimeout(() => t.logo.stop(), 20)
  const r = await p
  assert.ok(Date.now() - t0 < 2000)
  assert.equal(r.aborted, true)
  assert.deepEqual(t.out, [])
})

test('stop at top level ends quietly; stop ends procedure', async () => {
  const t = await run('oto p\npisz 1\nstop\npisz 2\njuż\np\npisz 3 stop pisz 4')
  assert.deepEqual(t.out, ['1', '3'])
  assert.deepEqual(t.errors, [])
})

test('wynik outside a function is an error', async () => {
  const t = await run('wynik 5')
  assert.deepEqual(t.errors, ['wynik może wystąpić tylko wewnątrz funkcji'])
})

test('procedure without wynik used as input', async () => {
  const t = await run('oto p\njuż\npisz p')
  assert.deepEqual(t.errors, ['p nie dał wyniku dla pisz'])
})

// ------------------------------------------------------------------ catch / throw / errors

test('złap / rzuć with value and without', async () => {
  const t = await run('pisz złap "x [(rzuć "x 42) pisz "nie]\nzłap "y [rzuć "y pisz "nie]\npisz "po')
  assert.deepEqual(t.out, ['42', 'po'])
  assert.deepEqual(t.errors, [])
})

test('złap passes through non-matching tags; uncaught throw is an error', async () => {
  const t = await run('złap "a [złap "b [rzuć "a] pisz "nie]\npisz "ok\nrzuć "zz')
  assert.deepEqual(t.out, ['ok'])
  assert.equal(t.errors.length, 1)
})

test('złap "błąd catches errors; błąd lists details', async () => {
  const t = await run('złap "błąd [pisz 1 / 0 pisz "nie]\npokaż pierwszy.błąd\noto pierwszy.błąd\nwynik uruchom [błąd]\njuż')
  assert.deepEqual(t.errors, [])
  assert.equal(t.out.length, 1)
  assert.match(t.out[0], /^\[0 \|?Nie można dzielić przez zero/)
})

test('zgłośBłąd: message, number 100, catchable', async () => {
  const t = await run('zgłośBłąd "|Zły kąt|')
  assert.deepEqual(t.errors, ['Zły kąt'])
  await t.run('catch "error [throwError "Ups] pisz uruchom [błąd]')
  assert.equal(t.out.length, 1)
  assert.match(t.out[0], /^100 Ups/)
  await t.run('złap "błąd [(zgłośBłąd "Inny 7)] pisz uruchom [błąd]')
  assert.match(t.out[1], /^7 Inny/)
})

test('rzuć "błąd raises an error', async () => {
  const t = await run('(rzuć "błąd "|Coś nie tak|)')
  assert.deepEqual(t.errors, ['Coś nie tak'])
})

test('złap "błąd does not swallow stop / wynik', async () => {
  const t = await run('oto f\nzłap "błąd [wynik 7]\nwynik 0\njuż\npisz f')
  assert.deepEqual(t.out, ['7'])
})

test('złap "błąd does not swallow Stop button', async () => {
  const t = makeTestLogo()
  const p = t.run('złap "błąd [pętla [czekaj 5]] pisz "nie')
  setTimeout(() => t.logo.stop(), 30)
  const r = await p
  assert.equal(r.aborted, true)
  assert.deepEqual(t.out, [])
})

test('zignoruj', async () => {
  const t = await run('zignoruj 5 ignore [1 2] pisz "ok')
  assert.deepEqual(t.out, ['ok'])
})

test('poziomGłówny and zakończ stop everything', async () => {
  const t = await run('oto p\npoziomGłówny\npisz "nie\njuż\np\npisz "nie')
  assert.deepEqual(t.out, [])
  assert.equal(t.errors.length, 0) // silent abort: no `Zatrzymano!`
  await t.run('pisz "dalej')
  assert.deepEqual(t.out, ['dalej'])
  await t.run('bye pisz "nie')
  assert.deepEqual(t.out, ['dalej'])
  assert.equal(t.errors.length, 0)
})

test('czekajAż', async () => {
  const t = makeTestLogo()
  setTimeout(() => t.interp.globals.set('gotowe', 'prawda'), 30)
  await t.run('przypisz "gotowe "fałsz czekajAż [:gotowe] pisz "jest')
  assert.deepEqual(t.out, ['jest'])
})

// ------------------------------------------------------------------ procedures (§7)

test('definiuj with list, tekst round-trip', async () => {
  const t = await run('definiuj "dwa [[:a :b] [pisz :a + :b]]\ndwa 2 3\npokaż tekst "dwa')
  assert.deepEqual(t.out, ['5', '[[a b] [pisz :a + :b]]'])
})

test('definiuj with source word (.imp form)', async () => {
  const t = await run('definiuj "kw "|oto kw :x¶pisz :x * :x¶już|\nkw 4')
  assert.deepEqual(t.out, ['16'])
})

test('definiuj of a primitive is an error', async () => {
  const t = await run('definiuj "pisz [[] [stop]]')
  assert.deepEqual(t.errors, ['pisz jest procedurą pierwotną'])
})

test('zdefiniowana?, pierwotna?, procedury', async () => {
  const t = await run('oto aa\njuż\noto bb :x\njuż\npisz zdefiniowana? "aa pisz defined? "zz pisz pierwotna? "powtórz pisz primitive? "aa\npokaż procedury')
  assert.deepEqual(t.out, ['prawda', 'fałsz', 'prawda', 'fałsz', '[aa bb]'])
})

test('tekst of unknown procedure', async () => {
  const t = await run('pokaż tekst "brak')
  assert.deepEqual(t.errors, ['tekst nie lubi brak jako danej'])
})

test('zastosuj: name and lambda', async () => {
  const t = await run('oto suma2 :a :b\nwynik :a + :b\njuż\npisz zastosuj "suma2 [2 5]\npisz apply [[x] :x * 10] [4]\nzastosuj "pisz [hej]')
  assert.deepEqual(t.out, ['7', '40', 'hej'])
})

test('redaguj calls io.edit when present', async () => {
  const t = makeTestLogo()
  const seen = []
  t.interp.io.edit = (n) => seen.push(n)
  await t.run('oto kw\njuż\n(redaguj "kw)\nred')
  assert.deepEqual(seen, ['kw', undefined])
  assert.deepEqual(t.errors, [])
})

test('zwykle calls the inherited version (global proc behind object method)', async () => {
  const t = makeTestLogo()
  await t.run('oto hej :x\n(pisz "global :x)\njuż')
  const z = t.world.turtles[0]
  t.interp.defineFromSource('oto hej :x\n(pisz "własna :x)\nzwykle\njuż', { object: z })
  await t.run(`${z.name}'hej 5`)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['własna 5', 'global 5'])
})
