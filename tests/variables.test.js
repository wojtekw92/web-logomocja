// Tests for src/prims/variables.js (PRIMITYWY.md §5).
import test from 'node:test'
import assert from 'node:assert/strict'
import { makeTestLogo } from './helpers.js'

async function run(src) {
  const t = makeTestLogo()
  await t.run(src)
  return t
}

test('przypisz / make creates a global; wartość / thing reads it', async () => {
  const t = await run('przypisz "x 5\nmake "Y [1 2]\npisz :x pokaż wartość "y pisz thing "X')
  assert.deepEqual(t.out, ['5', '[1 2]', '5'])
})

test('nazwij / name has reversed inputs', async () => {
  const t = await run('nazwij 7 "a name 8 "b pisz :a + :b')
  assert.deepEqual(t.out, ['15'])
})

test('niech is local to the procedure and dynamically visible', async () => {
  const t = await run('oto wew\npisz :a\njuż\noto p\nniech "a 3\nwew\njuż\np\npisz nazwa? "a')
  assert.deepEqual(t.out, ['3', 'fałsz'])
})

test('niech forms: pairs in parentheses and a list of pairs', async () => {
  const t = await run('oto p\n(niech "a 1 "b 2)\n(niech [c 3 d 4])\npisz (:a + :b + :c + :d)\njuż\np')
  assert.deepEqual(t.out, ['10'])
  assert.deepEqual(t.errors, [])
})

test('niech at top level sets a global', async () => {
  const t = await run('niech "g 9 pisz :g')
  assert.deepEqual(t.out, ['9'])
})

test('przypisz sets an existing local, not a global', async () => {
  const t = await run('oto p\nniech "x 1\nprzypisz "x 2\npisz :x\njuż\np\npisz nazwa? "x')
  assert.deepEqual(t.out, ['2', 'fałsz'])
})

test('lokalna declares locals (word or list)', async () => {
  const t = await run('przypisz "x 1\noto p\nlokalna [x y]\nprzypisz "x 5\n(lokalna "z)\nprzypisz "z 6\npisz :x + :z\njuż\np\npisz :x pisz nazwa? "z')
  assert.deepEqual(t.out, ['11', '1', 'fałsz'])
})

test('undefined variable error', async () => {
  const t = await run('pisz wartość "brak')
  assert.deepEqual(t.errors, ['brak nie ma wartości'])
})

test('zwiększ / zmniejsz', async () => {
  const t = await run('przypisz "i 5 zwiększ "i pisz :i (zwiększ "i 4) pisz :i zmniejsz "i pisz :i (dec "i 10) pisz :i inc "i pisz :i')
  assert.deepEqual(t.out, ['6', '10', '9', '-1', '0'])
})

test('nazwa?', async () => {
  const t = await run('przypisz "q 0 pisz nazwa? "q pisz name? "w')
  assert.deepEqual(t.out, ['prawda', 'fałsz'])
})

test('usuń procedure, list of procedures, variable', async () => {
  const t = await run('oto a\njuż\noto b\njuż\noto c\njuż\nusuń "a erase [b]\npokaż procedury\nprzypisz "v 1 usuń ":v pisz nazwa? "v')
  assert.deepEqual(t.out, ['[c]', 'fałsz'])
  await t.run('usuń "pisz')
  assert.deepEqual(t.errors, ['pisz jest procedurą pierwotną'])
})

test('usuńWszystko removes procedures, variables, property lists', async () => {
  const t = await run('oto a\njuż\nprzypisz "v 1\nustalWłaściwość "l "k 1\nusuńWszystko\npokaż procedury pisz nazwa? "v pokaż wszystkieWłaściwości')
  assert.deepEqual(t.out, ['[]', 'fałsz', '[]'])
})

test('ustaw sets a turtle setting or an object variable', async () => {
  const t = makeTestLogo()
  await t.run('ustaw "kierunek 90\nustaw "mojaZm 5\npisz :mojaZm')
  const z = t.world.turtles[0]
  assert.equal(z.heading, 90)
  assert.equal(z.vars.get('mojazm'), 5)
  assert.deepEqual(t.out, ['5'])
  assert.deepEqual(t.errors, [])
})

test('miejWłasną creates own variable, getter by name and setter ustalNazwa', async () => {
  const t = makeTestLogo()
  const z = t.world.turtles[0]
  await t.run(`${z.name}'miejWłasną "prędkość 3\npisz ${z.name}'prędkość\n${z.name}'ustalPrędkość 8\npisz ${z.name}'prędkość`)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['3', '8'])
  assert.equal(z.vars.get('prędkość'), 8)
  assert.equal(t.interp.globals.has('prędkość'), false)
})

test('miejWspólną puts the variable on the class (parent)', async () => {
  const t = makeTestLogo()
  const z = t.world.turtles[0]
  await t.run(`${z.name}'miejWspólną "liczba 4\npisz ${z.name}'liczba`)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['4'])
  const holder = z.parent && z.parent.vars instanceof Map ? z.parent : z
  assert.equal(holder.vars.get('liczba'), 4)
})

test('property lists', async () => {
  const t = await run(
    [
      'ustalWłaściwość "kot "kolor "rudy',
      'pProp "kot "wiek 3',
      'pisz właściwość "kot "kolor',
      'pokaż gProp "kot "brak',
      'pokaż listaWłaściwości "kot',
      'usuńWłaściwość "kot "kolor',
      'pokaż pList "kot',
      'ustalListęWłaściwości "pies [imię Burek]',
      'pokaż wszystkieWłaściwości',
      'remProp "kot "wiek',
      'pokaż props',
    ].join('\n'),
  )
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['rudy', '[]', '[kolor rudy wiek 3]', '[wiek 3]', '[kot pies]', '[pies]'])
})
