import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveColor, colorToLogo, toRGBList, IMAGINE_COLOR_NAMES, PALETTE } from '../src/graphics/colors.js'
import { HeadlessSurface, floodFill } from '../src/graphics/surface.js'
import { World } from '../src/graphics/world.js'
import { Turtle, normHeading } from '../src/graphics/turtle.js'
import { LogoObject, formatValue } from '../src/core/values.js'
import { LogoError, AbortSignal } from '../src/core/errors.js'
import { compactToPoints, shapeFromOps, getShape, createVectorShape } from '../src/graphics/shapes.js'

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`)
const rgb = (c) => [c.r, c.g, c.b]
const mkWorld = () => new World({ surface: new HeadlessSurface() })

// ---------- colours ----------
test('colours: palette numbers and names', () => {
  assert.deepEqual(rgb(resolveColor(0)), [0, 0, 0])
  assert.deepEqual(rgb(resolveColor('14')), [255, 255, 0])
  assert.deepEqual(rgb(resolveColor(15)), [255, 255, 255])
  assert.deepEqual(rgb(resolveColor('czerwony')), [255, 0, 0])
  assert.deepEqual(rgb(resolveColor('Red')), [255, 0, 0])
  assert.deepEqual(rgb(resolveColor('czerwony6')), [255, 0, 0])
  assert.deepEqual(rgb(resolveColor('zielony')), [0, 0xc0, 0]) // §3.3 name, not palette 10
  assert.deepEqual(rgb(resolveColor(10)), [0, 255, 0])
  assert.deepEqual(rgb(resolveColor([128, 128, 0])), [128, 128, 0])
  assert.deepEqual(rgb(resolveColor(['12', 300, -5])), [12, 255, 0])
  assert.equal(resolveColor('biały').css, '#ffffff')
  assert.equal(IMAGINE_COLOR_NAMES.length, 18)
  assert.equal(PALETTE.length, 16)
})

test('colours: brightness suffix control values (§3.4)', () => {
  const r8 = resolveColor('czerwony8')
  assert.ok(Math.abs(r8.r - 255) <= 3 && Math.abs(r8.g - 104) <= 3 && Math.abs(r8.b - 104) <= 3)
  const pb = resolveColor('jasnoniebieski8')
  ;[104, 208, 248].forEach((v, i) => assert.ok(Math.abs(rgb(pb)[i] - v) <= 6))
  assert.deepEqual(rgb(resolveColor('szary9')), [192, 192, 192])
  assert.deepEqual(rgb(resolveColor('grey9')), [192, 192, 192])
  assert.deepEqual(rgb(resolveColor('szary1')), [0, 0, 0])
  assert.deepEqual(rgb(resolveColor('szary12')), [255, 255, 255])
  assert.deepEqual(rgb(resolveColor('jasnoszary')), [192, 192, 192])
  // HSL approximation: darker / lighter keep hue
  const r3 = resolveColor('red3'), r11 = resolveColor('czerwony11')
  assert.ok(r3.r < 255 && r3.g === 0 && r3.b === 0)
  assert.ok(r11.r === 255 && r11.g > 180 && r11.g === r11.b)
  const n2 = resolveColor('ciemnoniebieski2')
  assert.ok(n2.b > 0 && n2.r === 0)
})

test('colours: colorToLogo, toRGB, errors, jld', () => {
  assert.equal(colorToLogo(resolveColor('yellow')), 14)
  assert.equal(colorToLogo(resolveColor('grey9')), 7)
  assert.equal(colorToLogo(resolveColor('czarny')), 0)
  assert.deepEqual(colorToLogo(resolveColor('czerwony8')), [255, 104, 104])
  assert.deepEqual(toRGBList('black'), [0, 0, 0])
  assert.throws(() => resolveColor('niebieskawy', 'ustalKolPis'), (e) => e instanceof LogoError && e.message === 'ustalKolPis nie lubi niebieskawy jako danej')
  assert.throws(() => resolveColor(16), LogoError)
  assert.throws(() => resolveColor([1, 2]), LogoError)
  assert.throws(() => resolveColor('czerwony13'), LogoError)
  const r = resolveColor('jld')
  assert.ok(r.r >= 0 && r.r <= 255)
  const p = resolveColor([120, 'jld', 70])
  assert.equal(p.r, 120); assert.equal(p.b, 70)
})

// ---------- world & naming ----------
test('world defaults (§17.3–4)', () => {
  const w = mkWorld()
  assert.equal(w.page.name, 's1')
  assert.equal(w.page.width, 796)
  assert.equal(w.page.height, 499)
  assert.equal(w.page.wrapMode, 'sklej')
  assert.equal(w.page.background.css, '#ffffff')
  assert.equal(w.turtles.length, 1)
  const t = w.turtles[0]
  assert.ok(t instanceof Turtle && t instanceof LogoObject)
  assert.equal(t.name, 'ż1')
  assert.deepEqual(w.activeTurtles, [t])
  assert.deepEqual([t.x, t.y, t.heading], [0, 0, 0])
  assert.equal(t.pen, 'opu'); assert.equal(t.penDown, true)
  assert.equal(colorToLogo(t.penColor), 0)
  assert.equal(t.penWidth, 1)
  assert.equal(t.visible, true)
  assert.equal(w.getObject('Ż1'), t)
  assert.equal(w.getObject('s1'), w.page)
  assert.equal(t.parent, w.turtleClass)
  assert.equal(t.className, 'Żółw')
})

test('turtle naming and removal', () => {
  const w = mkWorld()
  const t2 = w.createTurtle()
  const t3 = w.createTurtle()
  assert.equal(t2.name, 'ż2'); assert.equal(t3.name, 'ż3')
  w.removeTurtle('ż2')
  assert.equal(w.getObject('ż2'), undefined)
  assert.equal(w.turtles.length, 2)
  assert.equal(w.createTurtle().name, 'ż2')
  assert.equal(w.createTurtle('Ptak').name, 'Ptak')
  assert.throws(() => w.createTurtle('ptak'), LogoError)
  w.activeTurtles = [...w.turtles]
  w.reset()
  assert.equal(w.turtles.length, 1)
  assert.equal(w.turtles[0].name, 'ż1')
  assert.deepEqual(w.activeTurtles.map((t) => t.name), ['ż1'])
})

// ---------- movement ----------
test('movement math and float snapping', async () => {
  const w = mkWorld(); const t = w.turtles[0]
  await t.forward(100)
  assert.deepEqual(t.pos, [0, 100])
  await t.right(90)
  await t.forward(50)
  assert.deepEqual(t.pos, [50, 100])
  assert.equal(formatValue(t.y), '100')
  await t.right(90); await t.forward(100)
  assert.deepEqual(t.pos, [50, 0])
  assert.equal(Object.is(t.x, -0), false)
  await t.back(30)
  assert.deepEqual(t.pos, [50, 30])
  await t.left(450)
  assert.equal(t.heading, 90)
  await t.left(390)
  assert.equal(t.heading, 60)
  await t.right(-30)
  assert.equal(t.heading, 30)
  t.setHeading(-90)
  assert.equal(t.heading, 270)
  assert.equal(normHeading(720), 0)
  t.home()
  assert.deepEqual([t.x, t.y, t.heading], [0, 0, 0])
  await t.setPos(30, 40)
  assert.equal(t.distance(0, 0), 50)
  assert.equal(t.towards(0, 0), normHeading(180 + 36.86989764584402))
  near(t.towards(30, 100), 0)
  near(t.towards(100, 40), 90)
  await t.setX(-10); assert.deepEqual(t.pos, [-10, 40])
  await t.setY(-20); assert.deepEqual(t.pos, [-10, -20])
  assert.equal(t.heading, 0) // setPos keeps heading
})

test('drawing records lines with pen state', async () => {
  const s = new HeadlessSurface(); const w = new World({ surface: s }); const t = w.turtles[0]
  s.ops.length = 0
  await t.forward(10)
  t.penUp(); await t.forward(10)
  t.penDownCmd(); t.setPenWidth(0.3); assert.equal(t.penWidth, 1)
  const lines = s.ops.filter((o) => o.op === 'line')
  assert.equal(lines.length, 1)
  assert.deepEqual([lines[0].x1, lines[0].y1, lines[0].x2, lines[0].y2], [0, 0, 0, 10])
  // np 0 draws a 1px point
  await t.forward(0)
  assert.deepEqual(rgb(s.getPixel(0, 20)), [0, 0, 0])
  // pkt draws even with the pen up
  t.penUp(); await t.setPos(100, 100); t.dot()
  assert.deepEqual(rgb(s.getPixel(100, 100)), [0, 0, 0])
  assert.deepEqual(rgb(s.getPixel(50, 50)), [255, 255, 255])
})

test('wrap (sklej) splits lines at edges', async () => {
  const s = new HeadlessSurface(); const w = new World({ surface: s }); const t = w.turtles[0]
  t.setHeading(90)
  s.ops.length = 0
  await t.forward(1000)
  const lines = s.ops.filter((o) => o.op === 'line')
  assert.equal(lines.length, 2)
  assert.deepEqual([lines[0].x1, lines[0].x2], [0, 398])
  assert.deepEqual([lines[1].x1, lines[1].x2], [-398, 204])
  assert.deepEqual(t.pos, [204, 0])
  // many wraps vertically
  t.home()
  await t.forward(499 * 3 + 10)
  assert.deepEqual(t.pos, [0, 10])
  // diagonal through a corner terminates
  t.home(); t.setHeading(45)
  await t.forward(5000)
  assert.ok(Math.abs(t.x) <= 398 && Math.abs(t.y) <= 249.5)
  // backward wrap
  t.home(); t.setHeading(0)
  await t.back(300)
  assert.deepEqual(t.pos, [0, 199])
})

test('okno, płot, odbij range styles', async () => {
  const s = new HeadlessSurface(); const w = new World({ surface: s }); const t = w.turtles[0]
  w.wrapMode = 'okno'
  await t.forward(1000)
  assert.deepEqual(t.pos, [0, 1000])
  t.home(); w.wrapMode = 'fence'
  assert.equal(t.rangeStyle, 'płot')
  await t.forward(1000)
  assert.deepEqual(t.pos, [0, 249.5])
  w.fenceError = true
  await assert.rejects(() => t.forward(10), LogoError)
  w.fenceError = false
  t.home(); w.wrapMode = 'odbij'
  t.setHeading(90)
  await t.forward(500)
  assert.deepEqual(t.pos, [296, 0])
  assert.equal(t.heading, 270)
  t.home(); t.setHeading(45)
  await t.forward(Math.hypot(300, 300))
  near(t.x, 300, 1e-6); near(t.y, 2 * 249.5 - 300, 1e-6)
  assert.equal(t.heading, 135)
  // per-turtle range
  t.home(); w.wrapMode = 'sklej'; t.setRange([-50, -50, 50, 50]); t.setHeading(90)
  await t.forward(120)
  assert.deepEqual(t.pos, [20, 0])
  assert.throws(() => { w.wrapMode = 'zawijaj' }, LogoError)
})

// ---------- fill & pixels ----------
test('flood fill on headless surface and colour under turtle', async () => {
  const s = new HeadlessSurface(); const w = new World({ surface: s }); const t = w.turtles[0]
  for (let i = 0; i < 4; i++) { await t.forward(40); await t.right(90) }
  t.penUp(); await t.setPos(20, 20)
  t.setFillColor('czerwony')
  const n = t.fill()
  assert.ok(n > 1000 && n < 1700, `filled ${n}`)
  assert.deepEqual(rgb(s.getPixel(20, 20)), [255, 0, 0])
  assert.deepEqual(rgb(s.getPixel(5, 35)), [255, 0, 0])
  assert.deepEqual(rgb(s.getPixel(60, 60)), [255, 255, 255])
  assert.deepEqual(rgb(s.getPixel(0, 20)), [0, 0, 0]) // border untouched
  assert.equal(colorToLogo(t.colorUnder()), 12)
  // §17.11: pen colour also sets fill colour
  t.setPenColor('niebieski')
  assert.equal(t.fillColor.css, '#0000ff')
  // turtle on the line repaints the line
  await t.setPos(0, 20); t.setFillColor(14); t.fill()
  assert.deepEqual(rgb(s.getPixel(0, 30)), [255, 255, 0])
  // filling the outside (big region) works without recursion
  await t.setPos(200, 200); t.setFillColor(2)
  assert.ok(t.fill() > 300000)
})

test('floodFill respects bounds box', () => {
  const data = new Uint8ClampedArray(10 * 10 * 4).fill(255)
  const n = floodFill(data, 10, 10, 5, 5, { r: 0, g: 0, b: 0 }, [2, 2, 6, 6])
  assert.equal(n, 25)
})

test('circles take a diameter; erase pen; clean vs clearScreen', async () => {
  const s = new HeadlessSurface(); const w = new World({ surface: s }); const t = w.turtles[0]
  t.setPenColor('czerwony'); t.setFillColor('żółty')
  t.filledCircle(40)
  assert.deepEqual(rgb(s.getPixel(0, 0)), [255, 255, 0])
  assert.deepEqual(rgb(s.getPixel(0, 30)), [255, 255, 255])
  t.circle(100)
  assert.deepEqual(rgb(s.getPixel(50, 0)), [255, 0, 0])
  t.penErase(); t.point(100)
  assert.deepEqual(rgb(s.getPixel(0, 0)), [255, 255, 255])
  t.penDownCmd()
  await t.forward(50)
  w.clean()
  assert.deepEqual(t.pos, [0, 50])
  assert.deepEqual(rgb(s.getPixel(0, 25)), [255, 255, 255])
  const events = []
  w.eventHandler = (name, data) => events.push([name, data.target.name])
  await t.right(90)
  w.clearScreen()
  assert.deepEqual([t.x, t.y, t.heading], [0, 0, 0])
  assert.deepEqual(events, [['gdyCzyść', 's1']])
  assert.equal(colorToLogo(t.penColor), 12) // pen untouched
  w.setBackground('niebieski')
  assert.deepEqual(rgb(s.getPixel(10, 10)), [0, 0, 255])
})

test('reverse pen toggles pixels', async () => {
  const s = new HeadlessSurface(); const w = new World({ surface: s }); const t = w.turtles[0]
  t.penReverse()
  await t.forward(20)
  assert.deepEqual(rgb(s.getPixel(0, 10)), [0, 0, 0])
  await t.back(20)
  assert.deepEqual(rgb(s.getPixel(0, 10)), [255, 255, 255])
})

test('labels, settings, shapes', async () => {
  const s = new HeadlessSurface(); const w = new World({ surface: s }); const t = w.turtles[0]
  t.label('Ala')
  const op = s.ops.find((o) => o.op === 'text')
  assert.equal(op.str, 'Ala'); assert.equal(op.heading, 0)
  t.label2('abc')
  assert.ok(t.x > 0 && t.y === 0)
  assert.deepEqual(t.getSetting('poz'), [t.x, 0])
  assert.equal(t.setSetting('pw', 5), true); assert.equal(t.penWidth, 5)
  t.setSetting('kolpis', 'yellow'); assert.equal(t.getSetting('pc'), 14)
  t.setSetting('widoczny', 'fałsz'); assert.equal(t.getSetting('shown'), 'fałsz')
  t.setSetting('pisak', 'pu'); assert.equal(t.getSetting('pisak'), 'pod')
  assert.equal(t.setSetting('nieznane', 1), false)
  t.setShape('strzałka'); assert.equal(t.shape, getShape('arrow'))
  t.setShape([]); assert.equal(t.shape, null)
  assert.throws(() => t.setShape('smok'), LogoError)
  assert.deepEqual(compactToPoints([4, [100, 90]]).at(-1), [0, 0])
  assert.equal(compactToPoints([4, [100, 90]]).length, 5)
  // shape from a recorded drawing list
  const rec = new HeadlessSurface({ pixels: false })
  const rw = new World({ surface: rec }); const rt = rw.turtles[0]
  rec.ops.length = 0
  for (let i = 0; i < 3; i++) { await rt.forward(30); await rt.right(120) }
  const sh = shapeFromOps(rec.ops)
  assert.equal(sh.kind, 'vector')
  assert.equal(sh.frames[0].paths.length, 1)
  assert.equal(sh.frames[0].paths[0].points.length, 4)
  t.setShape(sh); t.stamp()
  assert.ok(s.ops.some((o) => o.op === 'stamp' && o.shape === sh))
  assert.ok(createVectorShape([{ points: [[0, 0], [10, 0]] }]).radius >= 10)
})

test('pointer events hit turtles', () => {
  const w = mkWorld(); const got = []
  w.eventHandler = (name, data) => { got.push([name, data.target?.name, data.x, data.y]); return 'ok' }
  assert.equal(w.pointer('click', 3, 2), 'ok')
  w.pointer('click', 200, 200)
  w.pointer('down', 0, 0, 2)
  assert.equal(w.mouse.buttons, 4)
  w.key('a')
  assert.deepEqual(got.slice(0, 3), [['gdyKlik', 'ż1', 3, 2], ['gdyKlik', 's1', 200, 200], ['gdyPrawyWciśnięty', 'ż1', 0, 0]])
  assert.equal(w.keys.last, 'a')
  const [x, y] = w.pixelToLogo(398.5, 249.5)
  assert.deepEqual([x, y], [0, 0])
})

// ---------- speed / yield ----------
test('yield is cheap at max speed and still lets macrotasks run', async () => {
  const w = mkWorld()
  let ticks = 0
  const iv = setInterval(() => ticks++, 1)
  const start = Date.now()
  let n = 0
  while (Date.now() - start < 120) { await w.yield(); n++ }
  clearInterval(iv)
  assert.ok(n > 1000, `only ${n} yields`)
  assert.ok(ticks >= 2, `timer starved (${ticks})`)
})

test('speed > 0 animates in steps and ends in the same place', async () => {
  const s = new HeadlessSurface(); const w = new World({ surface: s }); const t = w.turtles[0]
  w.speed = 1; w.frameDelay = 0
  let frames = 0
  const orig = w.frame.bind(w)
  w.frame = async () => { frames++; return orig() }
  s.ops.length = 0
  await t.forward(20)
  assert.equal(frames, 20)
  assert.deepEqual(t.pos, [0, 20])
  assert.equal(s.ops.filter((o) => o.op === 'line').length, 20)
  frames = 0
  await t.right(90)
  assert.ok(frames > 1)
  assert.equal(t.heading, 90)
  w.speed = 0; frames = 0
  await t.forward(100)
  assert.equal(frames, 0)
})

test('abort reaches animation and yield', async () => {
  const w = mkWorld(); const t = w.turtles[0]
  w.speed = 1; w.frameDelay = 0
  setTimeout(() => w.abort(), 5)
  await assert.rejects(() => t.forward(100000), (e) => e instanceof AbortSignal)
  w.clearAbort()
  w.abortCheck = () => { throw new AbortSignal() }
  await assert.rejects(() => w.yield(), (e) => e instanceof AbortSignal)
  w.abortCheck = null
  await w.yield()
})

test('onRender is throttled', async () => {
  const w = mkWorld(); let calls = 0
  const off = w.onRender(() => calls++)
  for (let i = 0; i < 50; i++) w.requestRender()
  await new Promise((r) => setTimeout(r, 40))
  assert.equal(calls, 1)
  off()
  w.requestRender()
  await new Promise((r) => setTimeout(r, 40))
  assert.equal(calls, 1)
})
