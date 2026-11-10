// Core tests: reader, parser, evaluator. Uses its own tiny primitives on a fresh Registry and a
// fake world, so it does not depend on prims/* or graphics/*.
import test from 'node:test'
import assert from 'node:assert/strict'

import { Registry } from '../src/core/registry.js'
import { Interpreter } from '../src/core/interpreter.js'
import { readLines, readList, runparse, T } from '../src/core/lexer.js'
import { parse, needsMoreInput } from '../src/core/parser.js'
import { OutputSignal, StopSignal, LogoError } from '../src/core/errors.js'
import { formatValue, toBool, toNumber, LogoObject, normName } from '../src/core/values.js'

function makeTurtle(name) {
  const t = new LogoObject({ name, className: 'Żółw' })
  t.isTurtle = true
  t.heading = 0
  t.dist = 0
  return t
}

function setup({ yieldFn } = {}) {
  const out = []
  const errors = []
  const texts = []
  const log = []
  const t1 = makeTurtle('ż1')
  const t2 = makeTurtle('ż2')
  const world = {
    turtles: [t1, t2],
    activeTurtles: [t1],
    objects: new Map([
      ['ż1', t1],
      ['ż2', t2],
    ]),
    yields: 0,
    async yield() {
      this.yields++
      if (yieldFn) await yieldFn()
      else await new Promise((r) => setImmediate(r))
    },
  }
  const io = {
    print: (s) => out.push(String(s)),
    printError: (text, err) => {
      texts.push(text)
      errors.push(err?.message ?? text)
    },
  }
  const reg = new Registry()
  const fmt = (args, top) => args.map((a) => formatValue(a, { top })).join(' ')
  reg.define(['pisz', 'print', 'pr'], { arity: 1, minArity: 0, maxArity: Infinity, fn: async (ctx, ...a) => { io.print(fmt(a, true)) } })
  reg.define(['pokaż', 'show'], { arity: 1, minArity: 0, maxArity: Infinity, fn: async (ctx, ...a) => { io.print(fmt(a, false)) } })
  reg.define(['suma', 'sum'], {
    arity: 2, minArity: 0, maxArity: Infinity,
    fn: async (ctx, ...a) => a.reduce((s, x) => s + toNumber(x), 0),
  })
  reg.define(['lista', 'list'], { arity: 2, minArity: 0, maxArity: Infinity, fn: async (ctx, ...a) => a })
  reg.define(['pierw', 'first'], { arity: 1, fn: async (ctx, x) => (Array.isArray(x) ? x[0] : String(x)[0]) })
  reg.define(['nie', 'not'], { arity: 1, fn: async (ctx, x) => (toBool(x) ? 'fałsz' : 'prawda') })
  reg.define(['powtórz', 'repeat'], {
    arity: 2,
    fn: async (ctx, n, list) => {
      const k = Math.round(toNumber(n))
      for (let i = 1; i <= k; i++) await ctx.interp.execList(list, ctx.interp.childCtx(ctx, { repcount: i }))
    },
  })
  reg.define(['numpow', 'repcount'], { arity: 0, fn: async (ctx) => ctx.repcount ?? -1 })
  reg.define(['pętla', 'loop'], {
    arity: 1,
    fn: async (ctx, list) => {
      for (;;) await ctx.interp.execList(list, ctx)
    },
  })
  reg.define(['jeśli', 'if'], {
    arity: 2, maxArity: 3,
    fn: async (ctx, c, a, b) => {
      if (toBool(c)) return ctx.interp.runList(a, ctx)
      if (b !== undefined) return ctx.interp.runList(b, ctx)
    },
  })
  reg.define(['jeżeli', 'ifelse'], {
    arity: 3,
    fn: async (ctx, c, a, b) => ctx.interp.runList(toBool(c) ? a : b, ctx),
  })
  reg.define(['wynik', 'output', 'op'], { arity: 1, fn: async (ctx, v) => { throw new OutputSignal(v) } })
  reg.define(['stop'], { arity: 0, fn: async () => { throw new StopSignal() } })
  reg.define(['niech', 'let'], { arity: 2, fn: async (ctx, n, v) => ctx.interp.makeLocal(n, ctx, v) })
  reg.define(['przypisz', 'make'], { arity: 2, fn: async (ctx, n, v) => ctx.interp.setVar(n, v, ctx) })
  reg.define(['nazwa?', 'name?'], { arity: 1, fn: async (ctx, n) => (ctx.interp.hasVar(n, ctx) ? 'prawda' : 'fałsz') })
  reg.define(['uruchom', 'run'], { arity: 1, fn: async (ctx, l) => ctx.interp.runList(l, ctx) })
  reg.define(['np', 'forward', 'fd'], {
    arity: 1,
    fn: async (ctx, d) => {
      const t = ctx.turtle
      t.dist += toNumber(d)
      log.push(`${t.name} np ${d}`)
    },
  })
  reg.define(['kierunek', 'heading'], { arity: 0, fn: async (ctx) => ctx.turtle.heading })
  reg.define(['pozx', 'xcor'], { arity: 0, fn: async () => 10 })
  reg.define(['mojaNazwa', 'myName'], { arity: 0, fn: async (ctx) => ctx.self?.name })
  reg.define(['czekaj', 'wait'], { arity: 1, fn: async (ctx, ms) => ctx.interp.sleep(toNumber(ms), ctx) })
  reg.define(['równolegle', 'launch'], { arity: 1, fn: async (ctx, l) => { ctx.interp.spawnProcess(l, ctx) } })
  reg.define(['zwykle', 'usual'], { arity: 0, minArity: 0, maxArity: Infinity, fn: async (ctx, ...a) => ctx.interp.callUsual(ctx, a) })
  const interp = new Interpreter({ registry: reg, world, io })
  return { interp, world, out, errors, texts, log, t1, t2, reg, run: (s) => interp.run(s) }
}

// ---------------------------------------------------------------------------- reader

test('reader: words, numbers, lists, quotes, vars, comments, continuation', () => {
  const lines = readLines('pisz "kot :x [a [b c] 12 1.50 007] ; komentarz\npisz 1 ~\n  2\n')
  assert.equal(lines.length, 2)
  assert.deepEqual(lines[0].items, ['pisz', '"kot', ':x', ['a', ['b', 'c'], 12, '1.50', '007']])
  assert.deepEqual(lines[1].items, ['pisz', 1, 2])
  assert.equal(lines[1].line, 2)
})

test('reader: lists keep raw words and span lines; parens split', () => {
  const l = readList('[7-3 a+b\n x] (pisz 1)')
  assert.deepEqual(l, [['7-3', 'a+b', 'x'], '(', 'pisz', 1, ')'])
})

test('reader: vertical bars, escapes, ¶', () => {
  const l = readList('[|J. R.| ab\\-9 "|a b|] "x\\13\\10y')
  assert.deepEqual(l, [['J. R.', 'ab-9', '"a b'], '"x¶y'])
})

test('reader: bracket errors', () => {
  assert.throws(() => readLines('pisz [1 2'), (e) => e instanceof LogoError && e.message === 'Brakuje ]')
  assert.throws(() => readLines('pisz 1]'), (e) => e.message === 'Nieoczekiwany ]')
})

test('runparse: minus rule and infix splitting', () => {
  const kinds = (src) => runparse(readList(src)).map((t) => (t.t === T.OP ? t.v : t.t === T.NUM ? t.v : t.t))
  assert.deepEqual(kinds('7-3'), [7, '-', 3])
  assert.deepEqual(kinds('7 - 3'), [7, '-', 3])
  assert.deepEqual(kinds('7 -3'), [7, -3])
  assert.deepEqual(kinds('7 -:x'), [7, 'neg', 'var'])
  assert.deepEqual(kinds(':a*2<=b'), ['var', '*', 2, '<=', 'word'])
  assert.deepEqual(kinds('3*-2'), [3, '*', -2])
  assert.deepEqual(kinds('0,6'), [0.6])
  assert.deepEqual(kinds('"a+b'), ['quote'])
  assert.deepEqual(kinds("ż1'np"), ['word'])
  assert.deepEqual(kinds('1e-3'), [0.001])
})

test('parser: definitions with sourceText, params, aliases', () => {
  const src = 'pisz 1\noto kwadrat :bok\n  powtórz 4 [np :bok pw 90]\njuż\nTO dbl :x [:y 2] [:r]\n wynik :x\nEND\n'
  const p = parse(src)
  assert.equal(p.definitions.length, 2)
  const [a, b] = p.definitions
  assert.equal(a.name, 'kwadrat')
  assert.deepEqual(a.params, ['bok'])
  assert.equal(a.sourceText, 'oto kwadrat :bok\n  powtórz 4 [np :bok pw 90]\njuż')
  assert.deepEqual(a.lines, [['powtórz', 4, ['np', ':bok', 'pw', 90]]])
  assert.equal(b.name, 'dbl')
  assert.deepEqual(b.optionalParams, [{ name: 'y', default: [2] }])
  assert.equal(b.restParam, 'r')
  assert.equal(b.minArity, 1)
  assert.equal(b.maxArity, Infinity)
  assert.deepEqual(p.bodyLines.map((l) => l.items), [['pisz', 1]])
  assert.throws(() => parse('już'), (e) => e.message === 'już bez oto')
  assert.equal(needsMoreInput('oto a :x'), true)
  assert.equal(needsMoreInput('pisz [1'), true)
  assert.equal(needsMoreInput('oto a\npisz 1\njuż'), false)
})

// ---------------------------------------------------------------------------- expressions

test('infix precedence and minus', async () => {
  const { run, out, errors } = setup()
  await run(`pisz 2 + 3 * 4
pisz (2 + 3) * 4
pisz 10 - 2 - 3
pisz 2 ^ 3 ^ 2
pisz -2 ^ 2
pisz 7-3
pisz 7 - 3
pisz 3 - -2
pisz 5 * -2
pisz 1 + 2 = 3
pisz suma 2 3 * 4
pisz 0,5 + 1
pisz 10 / 4
pisz 3 < 5
pisz "abc < "abd
pisz "Ala = "ALA
pisz 1 <> 2
pisz - 3 + 1
pisz (pozx + 5)`)
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['14', '20', '5', '512', '4', '4', '4', '5', '-10', 'prawda', '14', '1.5', '2.5', 'prawda', 'prawda', 'prawda', 'prawda', '-2', '15'])
})

test('`pisz 7 -3` prints 7 then complains about -3', async () => {
  const { run, out, errors, texts } = setup()
  const r = await run('pisz 7 -3')
  assert.equal(r.ok, false)
  assert.deepEqual(out, ['7'])
  assert.deepEqual(errors, ['Nie wiem co zrobić z -3'])
  assert.equal(texts[0], 'Nie wiem co zrobić z -3\nNie powiedziałeś co zrobić z wynikiem')
})

test('vector arithmetic and negation', async () => {
  const { run, out, errors } = setup()
  await run('pokaż [25 17 50] - [10 10 10]\npokaż 2 * [1 2]\nprzypisz "x 4\npisz -:x\npokaż -[1 2]')
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['[15 7 40]', '[2 4]', '-4', '[-1 -2]'])
})

test('parenthesised variadic calls', async () => {
  const { run, out, errors } = setup()
  await run('(pisz 1 2 3)\npisz (suma 1 2 3 4)\npisz (suma)\n(pisz)\npisz (suma 1 2) * 3')
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['1 2 3', '10', '0', '', '9'])
})

test('errors: exact Polish messages', async () => {
  const cases = [
    ['pisz Ala', 'Nie wiem jak wykonać Ala'],
    ['pw40', 'Nie wiem jak wykonać pw40'],
    ['pisz', 'Za mało danych dla pisz'],
    ['pisz 3 +', 'Za mało danych dla +'],
    ['pisz 1 / 0', 'Nie można dzielić przez zero'],
    ['pisz :nic', 'nic nie ma wartości'],
    ['(pierw [1] [2])', 'Za dużo danych dla pierw'],
    ['pisz (1 + 2', 'Brakuje )'],
    ['pisz 1)', 'Nieoczekiwany )'],
    ['pisz [1', 'Brakuje ]'],
    ['wynik 5', 'wynik może wystąpić tylko wewnątrz funkcji'],
    ['pisz "a + 1', '+ nie lubi a jako danej'],
    ['pisz suma "a 1', 'suma nie lubi a jako danej'],
    ['pisz nie "kot', 'nie nie lubi kot jako danej'],
    ['5', 'Nie wiem co zrobić z 5'],
    ['[1 2]', 'Nie wiem co zrobić z [1 2]'],
    ['powtórz 2 [5]', 'Nie wiem co zrobić z 5'],
    ['oto pisz\njuż', 'pisz jest procedurą pierwotną'],
    ["ż9'np 5", 'Nie ma obiektu ż9'],
  ]
  for (const [src, msg] of cases) {
    const { run, errors } = setup()
    const r = await run(src)
    assert.equal(r.ok, false, src)
    assert.deepEqual(errors, [msg], src)
  }
})

test('unknown word prints the hint on the second line', async () => {
  const { run, texts } = setup()
  await run('pisz Ala')
  assert.equal(texts[0], 'Nie wiem jak wykonać Ala\nSprawdź pisownię. Może to nowe nieokreślone słowo')
})

test('`pisz "Jan "Kowalski` prints Jan then the error', async () => {
  const { run, out, errors } = setup()
  await run('pisz "Jan "Kowalski')
  assert.deepEqual(out, ['Jan'])
  assert.deepEqual(errors, ['Nie wiem co zrobić z Kowalski'])
})

// ---------------------------------------------------------------------------- procedures

test('procedures: recursion with output, stop, commands', async () => {
  const { run, out, errors, log } = setup()
  await run(`oto silnia :n
  wynik jeżeli :n < 2 [1] [:n * silnia :n - 1]
już
oto fib :n
  jeśli :n < 2 [wynik :n]
  wynik (fib :n - 1) + fib :n - 2
już
oto licz :n
  jeśli :n > 3 [stop]
  pisz :n
  licz :n + 1
już
oto kwadrat :bok
  powtórz 4 [np :bok]
już
pisz silnia 10
pisz fib 15
licz 1
kwadrat 25`)
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['3628800', '610', '1', '2', '3'])
  assert.deepEqual(log, ['ż1 np 25', 'ż1 np 25', 'ż1 np 25', 'ż1 np 25'])
})

test('dynamic scope: callee sees caller inputs and locals', async () => {
  const { run, out, errors } = setup()
  await run(`oto a :x
  niech "y 7
  b
już
oto b
  pisz :x + :y
już
a 5`)
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['12'])
})

test('niech inside powtórz makes a procedure-local variable', async () => {
  const { run, out, errors } = setup()
  await run(`oto p
  powtórz 2 [niech "z numpow]
  pisz :z
już
p
pisz nazwa? "z
przypisz "g 1
oto q
  przypisz "g 2
  niech "h 3
już
q
pisz :g
pisz nazwa? "h`)
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['2', 'fałsz', '2', 'fałsz'])
})

test('jeśli takes an optional third literal list', async () => {
  const { run, out, errors } = setup()
  await run('jeśli 1 > 2 [pisz "a] [pisz "b]\njeśli "prawda [pisz "c]\npisz jeśli 1 = 1 ["tak] ["nie]')
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['b', 'c', 'tak'])
})

test('procedure that gives no output used as input', async () => {
  const { run, errors } = setup()
  await run('oto k\n  pisz 1\njuż\npisz k')
  assert.deepEqual(errors, ['k nie dał wyniku dla pisz'])
})

test('errors report the procedure name', async () => {
  const { run, errors, texts, interp } = setup()
  const r = await run('oto zle\n  pisz 1\n  foo\njuż\nzle')
  assert.deepEqual(errors, ['Nie wiem jak wykonać foo'])
  assert.equal(r.error.procedure, 'zle')
  assert.equal(r.error.line, 3)
  assert.match(texts[0], /^Nie wiem jak wykonać foo w procedurze zle\n/)
  assert.equal(interp.lastError, r.error)
})

test('optional and rest inputs', async () => {
  const { run, out, errors } = setup()
  await run(`oto podwój :co :ile [1]
  pokaż (lista :co :ile)
już
oto ucb :a [:b :a * 2] [:reszta]
  pokaż (lista :a :b :reszta)
już
podwój 5
(podwój 5 6)
ucb 1
(ucb 1 5)
(ucb 1 5 6 7)`)
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['[5 ]', '[5 6]', '[1 2 []]', '[1 5 []]', '[1 5 [6 7]]'])
})

test('case-insensitive names with Polish letters', async () => {
  const { run, out, errors } = setup()
  await run('oto ŻÓŁW\n  pisz "ok\njuż\nżółw\nŻółW\nprzypisz "ĄĆ 3\npisz :ąć\nPISZ "x')
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['ok', 'ok', '3', 'x'])
})

test('uruchom keeps bar words and quoted words intact', async () => {
  const { run, out, errors } = setup()
  await run('uruchom [pisz |a+b|]\npisz "a+b\npisz uruchom [2 + 3]\npokaż [7-3 x]')
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['a+b', 'a+b', '5', '[7-3 x]'])
})

test('deep recursion: tail calls do not grow, legit depth works, runaway gives Polish error', async () => {
  const { run, out, errors, interp } = setup()
  await run('oto licz :n\n  jeśli :n = 0 [pisz "koniec stop]\n  licz :n - 1\njuż\nlicz 50000')
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['koniec'])
  out.length = 0
  await run('oto g :n\n  jeśli :n = 0 [wynik 0]\n  wynik 1 + g :n - 1\njuż\npisz g 3000')
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['3000'])
  interp.maxDepth = 2000
  await run('oto f\n  f\n  pisz 1\njuż\nf')
  assert.deepEqual(errors, ['Za mało pamięci (za głęboka rekurencja) w f'])
})

test('tail call keeps caller locals visible when not shadowed', async () => {
  const { run, out, errors } = setup()
  await run('oto a :x\n  niech "w 9\n  b 1\njuż\noto b :q\n  pisz :x + :w + :q\njuż\na 5')
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['15'])
})

test('defineProcedure, defineFromSource, defineFromList, text, procedureSource', async () => {
  const { interp, run, out, errors } = setup()
  interp.defineFromSource('oto x1 :a\n  pisz :a\njuż')
  interp.defineFromList('x2', [[':a', 'b'], ['pisz', ':a', '+', ':b']])
  await run('x1 4\nx2 1 2')
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['4', '3'])
  assert.deepEqual(interp.text('x2'), [['a', 'b'], ['pisz', ':a', '+', ':b']])
  assert.equal(interp.procedureSource('X1'), 'oto x1 :a\n  pisz :a\njuż')
  assert.match(interp.procedureSource('x2'), /^oto x2 :a :b\n {2}pisz :a \+ :b\njuż$/)
  assert.ok(interp.procedures.has('x1'))
  interp.eraseProcedure('x1')
  assert.ok(!interp.procedures.has('x1'))
})

// ---------------------------------------------------------------------------- objects

test("apostrophe syntax: obj'cmd, obj'function, obj'var", async () => {
  const { run, out, errors, log, t2, interp } = setup()
  t2.heading = 90
  t2.vars.set('x', 42)
  await run("ż2'np 50\npisz ż2'kierunek\npisz :ż2'x\nż2'pisz ż2'mojaNazwa\npisz mojaNazwa\nnp 5")
  assert.deepEqual(errors, [])
  assert.deepEqual(log, ['ż2 np 50', 'ż1 np 5'])
  assert.deepEqual(out, ['90', '42', 'ż2', 'ż1'])
  // obj'cmd args are evaluated in the caller's context
  await run("przypisz \"d 7\nż2'np :d")
  assert.equal(log.at(-1), 'ż2 np 7')
  assert.equal(interp.findObject('Ż2'), t2)
})

test('resolution order: own proc > class proc > global proc > primitive > self var', async () => {
  const { run, out, errors, interp, t1, t2 } = setup()
  const klasa = new LogoObject({ name: 'Ptak' })
  t1.parent = klasa
  t2.parent = klasa
  interp.defineFromSource('oto skacz\n  pisz "klasa\njuż', { object: klasa })
  interp.defineFromSource('oto skacz\n  pisz "własna\n  zwykle\njuż', { object: t1 })
  interp.defineFromSource('oto leć\n  pisz "globalna\njuż')
  interp.defineFromSource('oto leć\n  pisz "ptasia\njuż', { object: klasa })
  t1.vars.set('promień', 20)
  await run("skacz\nż2'skacz\nleć\npisz promień\npisz :promień")
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['własna', 'klasa', 'klasa', 'ptasia', '20', '20'])
  // configurable: move user procedures before object procedures
  const steps = interp.resolveSteps
  const user = steps.find((s) => s.name === 'userProc')
  interp.resolveSteps = [user, ...steps.filter((s) => s !== user)]
  out.length = 0
  await run('leć')
  assert.deepEqual(out, ['globalna'])
})

test('self follows the active turtle and a value-object resolves to its value', async () => {
  const { run, out, errors, world, t2 } = setup()
  world.activeTurtles = [t2]
  const suw = new LogoObject({ name: 'suw1' })
  suw.logoValue = () => 33
  world.objects.set('suw1', suw)
  await run('pisz mojaNazwa\npisz suw1 + 1')
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['ż2', '34'])
})

// ---------------------------------------------------------------------------- async

test('abort stops an infinite loop and prints Zatrzymano!', async () => {
  const { run, interp, errors } = setup()
  const p = run('pętla [przypisz "i 1]')
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(interp.running, true)
  interp.abort()
  const r = await p
  assert.equal(r.ok, false)
  assert.equal(r.aborted, true)
  assert.deepEqual(errors, ['Zatrzymano!'])
  assert.equal(interp.running, false)
  // next run works again
  const r2 = await run('przypisz "j 1')
  assert.equal(r2.ok, true)
})

test('abort wakes a sleeping czekaj', async () => {
  const { run, interp } = setup()
  const t0 = Date.now()
  const p = run('czekaj 10000')
  setTimeout(() => interp.abort(), 20)
  const r = await p
  assert.equal(r.aborted, true)
  assert.ok(Date.now() - t0 < 2000)
})

test('long loops yield to the world', async () => {
  const { run, world, interp } = setup()
  interp.yieldIntervalMs = 0
  await run('powtórz 5000 [przypisz "i numpow]')
  assert.ok(world.yields > 0)
})

test('spawnProcess runs concurrently and is abortable', async () => {
  const { run, interp, out, errors } = setup()
  await run('równolegle [powtórz 3 [pisz "p]]\npisz "główny')
  assert.equal(out[0], 'główny')
  await interp.waitForProcesses()
  assert.deepEqual(out, ['główny', 'p', 'p', 'p'])
  const proc = interp.spawnProcess(['pętla', ['przypisz', '"k', 1]], null, { name: 'bez' })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(interp.processes.has(proc), true)
  interp.abort()
  await proc.promise
  assert.equal(proc.done, true)
  assert.deepEqual(errors, [])
  // errors in processes are reported
  const p2 = interp.spawnProcess(['blah'])
  await p2.promise
  assert.deepEqual(errors, ['Nie wiem jak wykonać blah'])
})

test('callProcedure, evalList, runList helpers', async () => {
  const { interp, out } = setup()
  interp.defineFromSource('oto dodaj :a :b\n  wynik :a + :b\njuż')
  assert.equal(await interp.callProcedure('dodaj', [2, 3]), 5)
  assert.equal(await interp.callProcedure('suma', [2, 3, 4]), 9)
  assert.equal(await interp.evalList([1, '+', 1]), 2)
  assert.equal(await interp.runList('pisz 5'), undefined)
  assert.deepEqual(out, ['5'])
  await assert.rejects(() => interp.evalList(['pisz', 1], null, 'jeśli'), (e) => e.message === 'pisz nie dał wyniku dla jeśli')
  await assert.rejects(() => interp.callProcedure('dodaj', [1]), (e) => e.message === 'Za mało danych dla dodaj')
  const ctx = interp.rootCtx()
  interp.makeLocal('q', ctx, 1)
  assert.equal(interp.getVar('Q', ctx), 1)
  const c2 = interp.childCtx(ctx, { newFrame: true })
  c2.scope.vars.set('lv', 5)
  assert.equal(interp.getVar('lv', c2), 5)
  assert.equal(interp.hasVar('lv', ctx), false)
})

test('comments and line continuation in programs', async () => {
  const { run, out, errors } = setup()
  await run('; tylko komentarz\npisz 1 ; po kodzie\n(pisz 2 ~\n 3)\npisz [a\n b]')
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['1', '2 3', 'a b'])
})

test('normName is used for keys', () => {
  assert.equal(normName('ŻÓŁW'), 'żółw')
})

test('facade: createLogomocja with the real World (via helpers)', async () => {
  const { makeTestLogo } = await import('./helpers.js')
  const t = makeTestLogo()
  // prims may still be stubs: use only the evaluator here
  const r = await t.run('oto podwój :x\n  podwój2 :x\njuż')
  assert.deepEqual(t.errors, [])
  assert.equal(r.ok, true)
  t.interp.defineFromList('trzy', [[], [3]])
  t.interp.defineProcedure({ name: 'dodaj', params: ['a', 'b'], lines: [] })
  assert.equal(await t.interp.evalList(['(', 2, '+', 1, ')', '*', 2]), 6)
  const ctx = t.interp.rootCtx()
  assert.equal(ctx.turtle, t.world.turtles[0])
  assert.equal(ctx.self, t.world.turtles[0])
  assert.equal(t.interp.findObject('Ż1'), t.world.turtles[0])
  t.logo.stop()
  const r2 = await t.run('dodaj 1 2')
  assert.equal(r2.ok, true)
  const r3 = await t.run('trzy')
  assert.deepEqual(t.errors, ['Nie wiem co zrobić z 3'])
  assert.equal(r3.error.procedure, 'trzy')
  t.logo.reset()
})

test('jeśli third list works even if registered with arity 2 only', async () => {
  const { interp, run, out, errors, reg } = setup()
  reg.define(['jeśli', 'if'], {
    arity: 2,
    fn: async (ctx, c, a, b) => ctx.interp.runList(toBool(c) ? a : b ?? [], ctx),
  })
  await run('jeśli 1 = 2 [pisz "a] [pisz "b]')
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['b'])
  assert.ok(interp)
})

test('extension primitives may be redefined by the user; others may not', async () => {
  const { run, out, errors, reg } = setup()
  reg.define(['potęga', 'power'], { arity: 2, extension: true, fn: async (c, a, b) => Math.pow(a, b) })
  await run('oto potęga :a :b\n  wynik 99\njuż\npisz potęga 2 3')
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['99'])
  await run('oto suma :a :b\n  wynik 1\njuż')
  assert.deepEqual(errors, ['suma jest procedurą pierwotną'])
})

test('one-line oto: instructions after the inputs become the body (integration extension)', async () => {
  const { run, errors, out } = setup()
  await run('oto kw :b powtórz 4 [np :b] już\noto starter pisz "start już\nstarter')
  assert.deepEqual(errors, [])
  assert.deepEqual(out, ['start'])
  // header lists are still accepted before the first instruction
  await run('oto x :a [1] pisz :a już\n(x 7)')
  assert.deepEqual(out, ['start', '7'])
})

test('a stopped context cannot spawn processes', async () => {
  const { interp } = setup()
  const ctx = interp.rootCtx()
  interp.abort()
  assert.throws(() => interp.spawnProcess(['pisz', 1], ctx), (e) => e.kind === 'abort')
  assert.equal(interp.processes.size, 0)
})
