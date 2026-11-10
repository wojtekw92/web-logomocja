// Tests for src/prims/objects.js: objects & classes (§12), events & processes (§13), widgets (§14).
import test from 'node:test'
import assert from 'node:assert/strict'
import { makeTestLogo } from './helpers.js'
import { Widget, eventKey, checkCollisions } from '../src/prims/objects.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function logo(src) {
  const t = makeTestLogo()
  t.world.speed = 0
  if (src) await t.run(src)
  return t
}
/** Wait for event/process handlers that are not infinite. */
const settle = (t) => t.interp.waitForProcesses()

// ------------------------------------------------------------------ §12.1

test('kto / słuchaj / wszystkie', async () => {
  const t = await logo(`
    pisz kto
    nowy "Żółw [poz [100 0]]
    nowy "Żółw []
    pokaż wszystkie
    słuchaj "ż2 pisz kto
    słuchaj [ż1 ż3] pokaż kto
    słuchaj wszystkie pokaż kto
    tell "ż1 pisz who
    ustalKto "ż3 pisz kto
  `)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['ż1', '[ż1 ż2 ż3]', 'ż2', '[ż1 ż3]', '[ż1 ż2 ż3]', 'ż1', 'ż3'])
})

test('słuchaj: errors', async () => {
  const t = await logo('słuchaj "ż9')
  assert.deepEqual(t.errors, ['Nie ma obiektu ż9'])
  const t2 = await logo('nowy "Przycisk [] słuchaj [ż1 prz1]')
  assert.deepEqual(t2.errors, ['słuchaj nie lubi [ż1 prz1] jako danej'])
  assert.match(t2.errorTexts[0], /Obiekty są niezgodne/)
})

test('proszę: runs for the objects, value of the first, apostrophe path', async () => {
  const t = await logo(`
    nowy "Żółw []
    proszę "ż2 [ustalPoz [10 20]]
    pokaż ż2'poz
    pisz proszę [ż1 ż2] [pozx]
    pisz kto
    proszę "s1 [pisz mojaNazwa]
    proszę "s1'ż2 [pisz mojaNazwa]
    proszęKażdego [ż1 ż2] [pisz kto]
  `)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['[10 20]', '0', 'ż1', 's1', 'ż2', 'ż1', 'ż2'])
})

test('każdy: active turtles one by one, kto = current turtle', async () => {
  const t = await logo('nowy "Żółw [] słuchaj wszystkie każdy [pisz kto] pokaż kto')
  assert.deepEqual(t.out, ['ż1', 'ż2', '[ż1 ż2]'])
})

test('ktoNaStronie, wszystkieZ', async () => {
  const t = await logo(`
    nowaKlasa "Żółw "Ptak []
    nowy "Ptak [] nowy "Ptak [] nowy "Żółw []
    pokaż wszystkieZ "Ptak
    pokaż wszystkieZ "Żółw
    pisz ktoNaStronie
  `)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['[ż2 ż3]', '[ż1 ż2 ż3 ż4]', 'ż1'])
})

// ------------------------------------------------------------------ §12.2

test('nowy: P/F — as a command, as a value, several on one line, inside a procedure', async () => {
  const t = await logo(`
    nowy "Żółw [poz [100 0] kierunek 90 pisak pod]
    niech "a nowy "Żółw []
    pisz :a
    pisz nowy "Żółw []
    nowy "Żółw [] nowy "Żółw []
    oto zrób
      nowy "Żółw []
      pisz "ok
    już
    zrób
    pisz (nowy "turtle [])
    pisz ostatniObiekt
    powtórz 3 [nowy "Żółw []]
    jeśli "prawda [nowy "Żółw []]
    pisz ostatniObiekt
  `)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['ż3', 'ż4', 'ok', 'ż8', 'ż8', 'ż12'])
  const z2 = t.world.getObject('ż2')
  assert.equal(z2.x, 100)
  assert.equal(z2.heading, 90)
  assert.equal(z2.pen, 'pod')
  // a real unused value is still an error
  const t2 = await logo('nowy "Żółw [] 5')
  assert.deepEqual(t2.errors, ['Nie wiem co zrobić z 5'])
})

test('nowy: settings with expressions, jld, variables, own vars, pw = penWidth, name', async () => {
  const t = await logo(`
    niech "p [5 6]
    nowy "Żółw [nazwa Kot poz :p pw 4 kierunek jld promień 20 kolPis (2 + 2)]
    pisz Kot'grubość
    pokaż Kot'poz
    pisz Kot'promień
    proszę "Kot [pisz :promień]
  `)
  assert.deepEqual(t.errors, [])
  const k = t.world.getObject('kot')
  assert.equal(k.name, 'Kot')
  assert.ok(k.heading >= 0 && k.heading < 360)
  assert.equal(k.penWidth, 4)
  assert.deepEqual(t.out.slice(1), ['[5 6]', '20', '20'])
})

test('nowy: errors', async () => {
  const t = await logo('nowy "Pies []')
  assert.deepEqual(t.errors, ['Nie ma obiektu Pies'])
  const t2 = await logo('nowy "Żółw [nazwa ż1]')
  assert.deepEqual(t2.errors, ['Obiekt ż1 już istnieje'])
})

test('nowyObiekt with pairs; prototype instance; klonuj', async () => {
  const t = await logo(`
    (nowyObiekt "Żółw "poz [30 40] "kierunek 180)
    pokaż ż2'poz
    ż2'ustalPoz [1 2]
    nowy "ż2 [pisak pod]
    pokaż ż3'poz
    pisz ż3'mójRodzic
    pisz klonuj "ż2
    pokaż ż4'poz
    pisz ż4'kierunek
    pisz (klonuj "ż2 [poz [9 9]])
    pokaż ż5'poz
  `)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['[30 40]', '[1 2]', 'ż2', 'ż4', '[1 2]', '180', 'ż5', '[9 9]'])
  assert.equal(t.world.getObject('ż3').parent, t.world.getObject('ż2'))
  assert.equal(t.world.getObject('ż3').pen, 'pod')
  // own variables are inherited by prototype instances and copied by klonuj
  t.world.getObject('ż2').vars.set('x', 7)
  await t.run('nowy "ż2 [] pokaż ż6\'zmienne pisz proszę "ż6 [:x] klonuj "ż2 pokaż ż7\'zmienne')
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out.slice(8), ['[]', '7', '[x]'])
})

test('nowaKlasa: defaults, inherited events and methods, zwykle', async () => {
  const t = await logo(`
    nowaKlasa "Żółw "Ptaszek [kierunek 90 pisak pod gdyKlik [pisz mojaNazwa]]
    nowy "Ptaszek []
    pisz ż2'kierunek
    pisz ż2'pisak
    pisz klasa? "Ptaszek
    pisz klasa? "ż2
    pisz (jest? "Ptaszek "ż2)
    pisz (jest? "Żółw "ż2)
    pisz (jest? "Ptaszek "ż1)
    pokaż potomkowie "Ptaszek
    pisz obiekt? "ż2
    pisz obiekt? "nic
  `)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['90', 'pod', 'prawda', 'fałsz', 'prawda', 'prawda', 'fałsz', '[ż2]', 'prawda', 'fałsz'])
  // methods on the class, overridden by an instance's own procedure, with zwykle
  const cls = t.world.classes.get('ptaszek')
  t.interp.defineFromSource('oto kim\n wynik "ptaszek\njuż', { object: cls })
  t.interp.defineFromSource('oto kim\n wynik zdanie "mały zwykle\njuż', { object: t.world.getObject('ż2') })
  await t.run('pokaż ż2\'kim')
  assert.deepEqual(t.errors, [])
  assert.equal(t.out.at(-1), '[mały ptaszek]')
})

test('usuńObiekt / usuńCałkowicie / zniszcz', async () => {
  const t = await logo(`
    nowaKlasa "Żółw "Ptak []
    nowy "Ptak [] nowy "Ptak [] nowy "Żółw []
    usuńObiekt "ż4
    pokaż wszystkie
    usuńObiekt wszystkieZ "Ptak
    pokaż wszystkie
    nowy "Ptak []
    usuńCałkowicie "Ptak
    pisz klasa? "Ptak
    nowy "Żółw [] ż2'zniszcz
    pokaż wszystkie
  `)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['[ż1 ż2 ż3]', '[ż1]', 'fałsz', '[ż1]'])
  const t2 = await logo('usuńObiekt "s1')
  assert.deepEqual(t2.errors, ['usuńObiekt nie lubi s1 jako danej'])
  const t3 = await logo('usuńObiekt "Żółw')
  assert.deepEqual(t3.errors, ['usuńObiekt nie lubi Żółw jako danej'])
})

// ------------------------------------------------------------------ §12.3

test('introspection: mojaNazwa, mojaStrona, obiekty, zmienne, nazwy, adresat', async () => {
  const t = await logo(`
    pisz mojaNazwa
    pisz mojaStrona
    pisz mojeMiejsce
    pisz s1'mojaNazwa
    nowy "Żółw [wiek 3]
    pokaż ż2'zmienne
    pokaż ż2'nazwy
    pisz adresat
    pisz ż2'adresat
    pokaż obiekty
  `)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out.slice(0, 8), ['ż1', 's1', 's1', 's1', '[wiek]', '[wiek]', 'oknoGłówne', 'ż2'])
  assert.deepEqual(t.out[8], '[s1 ż1 ż2]')
})

test('behaviours: dodajZachowanie / mojeZachowania / usuńZachowanie', async () => {
  const t = await logo(`
    nowaKlasa "Główne "Skoczek []
    dodajZachowanie "Skoczek
    pokaż mojeZachowania
    pisz jest? "Skoczek
  `)
  assert.deepEqual(t.errors, [])
  t.interp.defineFromSource('oto hop\n pisz "hop\njuż', { object: t.world.classes.get('skoczek') })
  await t.run('hop usuńZachowanie "Skoczek pokaż mojeZachowania hop')
  assert.deepEqual(t.out, ['[Skoczek]', 'prawda', 'hop', '[]'])
  assert.deepEqual(t.errors, ['Nie wiem jak wykonać hop'])
})

test('ustalStan and freeze', async () => {
  const t = await logo(`
    ustalStan [poz [10 10] kierunek 45 kolor 3]
    pokaż poz pisz kierunek pisz :kolor
    pisz zamrożony? zamroźMnie pisz zamrożony? odmroźMnie pisz zamrożony?
  `)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['[10 10]', '45', '3', 'fałsz', 'prawda', 'fałsz'])
})

// ------------------------------------------------------------------ §13.2/13.3 events

test('event names: PL and EN aliases', () => {
  assert.equal(eventKey('gdyKlik'), eventKey('onClick'))
  assert.equal(eventKey('GDYKLIK'), 'gdyklik')
  assert.equal(eventKey('onChanged'), 'gdypozmianie')
  assert.equal(eventKey('przyKliknięciu'), undefined)
})

test('ustalZdarzenie / zdarzenie / zdarzenia / usuńZdarzenie / uruchomZdarzenie', async () => {
  const t = await logo(`
    ustalZdarzenie "gdyKlik [pisz "klik]
    ż1'setEvent "onDoubleClick [pisz "dwa]
    pokaż zdarzenie "onClick
    pokaż zdarzenia
    pisz zdarzenie? "gdyKlik
    uruchomZdarzenie "gdyKlik
    usuńZdarzenie "gdyKlik
    pisz zdarzenie? "gdyKlik
    pokaż zdarzenie "gdyKlik
  `)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['[pisz "klik]', '[gdyKlik gdyDwuklik]', 'prawda', 'klik', 'fałsz', '[]'])
  await t.run('ustalZdarzenie "przyKliknięciu []')
  assert.deepEqual(t.errors, ['ustalZdarzenie nie lubi przyKliknięciu jako danej'])
})

test('pointer click: turtle under pointer runs its gdyKlik as a process; else the page', async () => {
  const t = await logo(`
    nowy "Żółw [poz [100 100] gdyKlik [pisz mojaNazwa pisz kto np 10]]
    s1'ustalZdarzenie "gdyKlik [pisz "strona pisz mojaNazwa]
  `)
  let procs = t.world.dispatchEvent('klik', { x: 102, y: 98, button: 0 })
  assert.equal(procs.length, 1)
  await settle(t)
  assert.deepEqual(t.out, ['ż2', 'ż2'])
  assert.equal(t.world.getObject('ż2').y, 110)
  assert.equal(t.world.getObject('ż1').y, 0)
  procs = t.world.dispatchEvent('click', { x: -200, y: -100 })
  await settle(t)
  assert.deepEqual(t.out.slice(2), ['strona', 's1'])
  assert.equal(t.world.mouse.x, -200)
  // world.pointer (canonical path) works as well
  t.world.pointer('click', 100, 100, 0)
  await settle(t)
  assert.equal(t.out.at(-1), 'ż2')
})

test('turtle without handler: click goes to the page; frozen turtle does not react', async () => {
  const t = await logo(`
    nowy "Żółw [poz [100 100]]
    nowy "Żółw [poz [-100 100] gdyKlik [pisz "ż3]]
    ustalZdarzenie "gdyKlik [pisz "ż1]
    s1'ustalZdarzenie "gdyKlik [pisz "strona]
  `)
  t.world.dispatchEvent('klik', { x: 100, y: 100 })
  await settle(t)
  assert.deepEqual(t.out, ['strona'])
  await t.run('ż3\'zamroźMnie')
  t.world.dispatchEvent('klik', { x: -100, y: 100 })
  await settle(t)
  assert.deepEqual(t.out, ['strona', 'strona'])
})

test('mouse down/up/move, enter/leave, drag', async () => {
  const t = await logo(`
    ustalZdarzenie "gdyLewyWciśnięty [pisz "w]
    ustalZdarzenie "gdyLewyPuszczony [pisz "p]
    ustalZdarzenie "gdyPrawyWciśnięty [pisz "pw]
    ustalZdarzenie "gdyMyszWchodzi [pisz "we]
    ustalZdarzenie "gdyMyszWychodzi [pisz "wy]
    ustalZdarzenie "gdyCiągnięty [pisz "c]
  `)
  t.world.dispatchEvent('ruch', { x: 1, y: 1 }); await settle(t)
  t.world.dispatchEvent('wciśnięcie', { x: 1, y: 1, button: 0 }); await settle(t)
  t.world.dispatchEvent('ruch', { x: 2, y: 2 }); await settle(t)
  t.world.dispatchEvent('puszczenie', { x: 2, y: 2, button: 0 }); await settle(t)
  t.world.dispatchEvent('ruch', { x: 300, y: 200 }); await settle(t)
  t.world.dispatchEvent('down', { x: 0, y: 0, button: 2 }); await settle(t)
  assert.deepEqual(t.out, ['we', 'w', 'c', 'p', 'wy', 'pw'])
})

test('gdyKlawisz: main window / page / turtles; ostatni klawisz stored by the world', async () => {
  const t = await logo('ustalZdarzenie "gdyKlawisz [pisz "klawisz]')
  t.world.dispatchEvent('klawisz', { key: 'a' })
  await settle(t)
  assert.deepEqual(t.out, ['klawisz'])
  assert.equal(t.world.keys.last, 'a')
  await t.run('oknoGłówne\'ustalZdarzenie "onKeyDown [pisz "okno]')
  t.world.key('b')
  await settle(t)
  assert.deepEqual(t.out.slice(1).sort(), ['klawisz', 'okno'])
})

test('gdyCzyść fires on czyść (via world.clearScreen)', async () => {
  const t = await logo('s1\'ustalZdarzenie "gdyCzyść [pisz "czysto]')
  t.world.clearScreen()
  await settle(t)
  assert.deepEqual(t.out, ['czysto'])
})

test('gdyUtworzony runs after nowy with self = the new object', async () => {
  const t = await logo('nowaKlasa "Żółw "Jajo [gdyUtworzony [pisz mojaNazwa]] nowy "Jajo []')
  await settle(t)
  assert.deepEqual(t.out, ['ż2'])
})

test('gdyZderzenie for czuły turtles', async () => {
  const t = await logo(`
    nowy "Żółw [poz [100 0] czuły prawda gdyZderzenie [pisz "bum]]
  `)
  checkCollisions(t.world)
  await settle(t)
  assert.deepEqual(t.out, [])
  await t.run('ż2\'ustalPoz [5 0]')
  checkCollisions(t.world)
  checkCollisions(t.world) // still overlapping: no second event
  await settle(t)
  assert.deepEqual(t.out, ['bum'])
})

test('event handler error is reported, other handlers still work', async () => {
  const t = await logo('s1\'ustalZdarzenie "gdyKlik [pisz :nic]')
  t.world.dispatchEvent('klik', { x: 300, y: 200 })
  await settle(t)
  assert.deepEqual(t.errors, ['nic nie ma wartości'])
})

// ------------------------------------------------------------------ §13.1 processes

test('równolegle / skończony? / wszystkieProcesy', async () => {
  const t = await logo('(równolegle [czekaj 30 pisz "a] "p1) pisz skończony? "p1 pokaż wszystkieProcesy pisz "b')
  assert.deepEqual(t.out, ['fałsz', '[p1]', 'b'])
  await settle(t)
  assert.deepEqual(t.out, ['fałsz', '[p1]', 'b', 'a'])
  await t.run('pisz skończony? "p1')
  assert.equal(t.out.at(-1), 'prawda')
})

test('co (every) and anuluj', async () => {
  const t = await logo('niech "n 0 (co 10 [zwiększ "n] "licz)')
  await sleep(80)
  await t.run('anuluj "licz')
  const n = t.interp.globals.get('n')
  assert.ok(n >= 3, `n=${n}`)
  await sleep(40)
  assert.equal(t.interp.globals.get('n'), n)
  assert.deepEqual(t.errors, [])
  await t.run('pisz skończony? "licz')
  assert.equal(t.out.at(-1), 'prawda')
})

test('bezKońca runs in its own process; zatrzymajWszystko stops it', async () => {
  const t = await logo('niech "n 0 bezKońca [zwiększ "n czekaj 5] pisz "dalej')
  assert.deepEqual(t.out, ['dalej'])
  await sleep(50)
  assert.ok(t.interp.globals.get('n') > 2)
  await t.run('zatrzymajWszystko')
  assert.deepEqual(t.errors, ['Zatrzymano!'].slice(0, t.errors.length))
  await sleep(10)
  assert.equal(t.interp.processes.size, 0)
  const n = t.interp.globals.get('n')
  await sleep(30)
  assert.equal(t.interp.globals.get('n'), n)
})

test('poCzasie runs once after the delay', async () => {
  const t = await logo('poCzasie 20 [pisz "teraz] pisz "najpierw')
  assert.deepEqual(t.out, ['najpierw'])
  await settle(t)
  assert.deepEqual(t.out, ['najpierw', 'teraz'])
})

test('zatrzymajMnie ends only the current process', async () => {
  const t = await logo('równolegle [pisz "a zatrzymajMnie pisz "b] równolegle [czekaj 10 pisz "c]')
  await settle(t)
  assert.deepEqual(t.out, ['a', 'c'])
  assert.deepEqual(t.errors, [])
})

test('a process has its own kto; słuchaj inside it does not change the main one', async () => {
  const t = await logo('nowy "Żółw [] równolegle [słuchaj "ż2 np 10 pisz kto]')
  await settle(t)
  await t.run('pisz kto')
  assert.deepEqual(t.out, ['ż2', 'ż1'])
  assert.equal(t.world.getObject('ż2').y, 10)
  assert.equal(t.world.getObject('ż1').y, 0)
})

test('wstrzymajWszystko / wznówWszystko', async () => {
  const t = await logo('niech "n 0 (co 5 [zwiększ "n] "p)')
  await sleep(30)
  await t.run('wstrzymajWszystko')
  await sleep(20)
  const n = t.interp.globals.get('n')
  await sleep(40)
  assert.equal(t.interp.globals.get('n'), n)
  t.world.dispatchEvent('wznów', {})
  await sleep(40)
  assert.ok(t.interp.globals.get('n') > n)
  t.interp.abort()
})

test('Stop ends a pause', async () => {
  const t = await logo('wstrzymajWszystko')
  t.logo.stop()
  await t.run('niech "n 0 (co 5 [zwiększ "n] "p)')
  await sleep(40)
  assert.ok(t.interp.globals.get('n') > 0)
  t.interp.abort()
})

// ------------------------------------------------------------------ §14 widgets

test('widgets: created by nowy, registered, model for the UI', async () => {
  const t = await logo(`
    nowy "Przycisk [napis Start poz [-100 100] gdyWciśnięty [pisz "start]]
    nowy "Suwak [min 10 maks 50 wartość 20]
    nowy "PoleTekstowe [rozmiar [200 80]]
    nowy "Button []
  `)
  assert.deepEqual(t.errors, [])
  const [b, s, p, b2] = t.world.widgets
  assert.ok(b instanceof Widget)
  assert.deepEqual([b.kind, b.name, b.caption, b.x, b.y], ['button', 'prz1', 'Start', -100, 100])
  assert.deepEqual([s.kind, s.name, s.min, s.max, s.value], ['slider', 'suw1', 10, 50, 20])
  assert.deepEqual([p.kind, p.name, p.width, p.height], ['textbox', 'pt1', 200, 80])
  assert.equal(b2.name, 'prz2')
  assert.equal(t.world.getObject('suw1'), s)
  const snap = s.snapshot()
  assert.equal(snap.kind, 'slider')
  assert.equal(snap.value, 20)
  assert.ok(t.world.widgetsVersion > 0)
})

test('slider: name used as a word gives its value; ustalZawartość clamps; UI change events', async () => {
  const t = await logo(`
    nowy "Suwak [maks 100 wartość 30 gdyZmieniasz [pisz zawartość] gdyPoZmianie [pisz "koniec]]
    pisz suw1
    np suw1
    suw1'ustalZawartość 500
    pisz suw1'zawartość
    suw1'ustalMin 5 suw1'ustalMaks 60
    pisz suw1
  `)
  assert.deepEqual(t.errors, [])
  assert.deepEqual(t.out, ['30', '100', '60'])
  assert.equal(t.world.getObject('ż1').y, 30)
  t.world.dispatchEvent('gdyZmieniasz', { target: 'suw1', value: 42 })
  await settle(t)
  t.world.dispatchEvent('onChanged', { target: t.world.getObject('suw1'), value: 43 })
  await settle(t)
  assert.deepEqual(t.out.slice(3), ['42', 'koniec'])
  assert.equal(t.world.getObject('suw1').value, 43)
})

test('text box: ustalZawartość, zawartość, piszDoPola, gdyPoZmianie from the UI', async () => {
  const t = await logo(`
    nowy "PoleTekstowe [gdyPoZmianie [pisz zawartość]]
    nowy "Suwak [wartość 7]
    pt1'ustalZawartość suw1
    pisz pt1'zawartość
    piszDoPola "pt1 [ala ma kota]
  `)
  assert.deepEqual(t.errors, [])
  assert.equal(t.out[0], '7')
  assert.equal(t.world.getObject('pt1').text, '7\nala ma kota')
  t.world.dispatchEvent('gdyPoZmianie', { target: 'pt1', value: 'nowy tekst' })
  await settle(t)
  assert.equal(t.out.at(-1), 'nowy tekst')
})

test('button: napis, ustalNapis, gdyWciśnięty runs with the active turtles', async () => {
  const t = await logo(`
    nowy "Przycisk [gdyWciśnięty [np 25 pisz mojaNazwa]]
    pisz prz1'napis
    prz1'ustalNapis "Naprzód
    pisz prz1'napis
  `)
  assert.deepEqual(t.out, ['prz1', 'Naprzód'])
  t.world.dispatchEvent('gdyWciśnięty', { target: 'prz1' })
  await settle(t)
  assert.equal(t.out.at(-1), 'prz1')
  assert.equal(t.world.getObject('ż1').y, 25)
})

test('widget primitives on a wrong object', async () => {
  const t = await logo('ustalZawartość 5')
  assert.deepEqual(t.errors, ['ustalZawartość nie lubi ż1 jako danej'])
  const t2 = await logo('nowy "Suwak [] suw1\'ustalNapis "x')
  assert.deepEqual(t2.errors, ['ustalNapis nie lubi suw1 jako danej'])
})

test('button bar: ustalPrzyciski / pokażPrzyciski / schowajPrzyciski / UI click', async () => {
  const t = await logo('ustalPrzyciski [Raz [pisz 1] Dwa [pisz 2]]')
  assert.deepEqual(t.world.buttonBar.buttons.map((b) => b.caption), ['Raz', 'Dwa'])
  assert.equal(t.world.buttonBar.visible, true)
  await t.run('schowajPrzyciski')
  assert.equal(t.world.buttonBar.visible, false)
  await t.run('pokażPrzyciski')
  assert.equal(t.world.buttonBar.visible, true)
  t.world.dispatchEvent('przyciskPaska', { index: 1 })
  await settle(t)
  assert.deepEqual(t.out, ['2'])
})

test('notifyWidgets hook is called on widget changes', async () => {
  const t = makeTestLogo()
  let n = 0
  t.world.notifyWidgets = () => { n++ }
  await t.run('nowy "Suwak [] suw1\'ustalZawartość 5')
  assert.ok(n >= 2)
})

test('settings work through ustaw-like setSetting for widgets; widget removal', async () => {
  const t = await logo('nowy "Przycisk [] usuńObiekt "prz1')
  assert.deepEqual(t.errors, [])
  assert.equal(t.world.widgets.length, 0)
  assert.equal(t.world.getObject('prz1'), undefined)
})
