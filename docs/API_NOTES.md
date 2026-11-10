# API notes from core & graphics authors (binding for prims/UI authors)



---

The graphics module is written and its tests pass: `node --test` reports pass 19, fail 0. One blocker for everyone: the documented test command `node --test tests/` fails on Node v25.9.0 with MODULE_NOT_FOUND, because the directory form doesn't work there. Plain `node --test` and `node --test tests/*.test.js` both work. package.json belongs to core, so core needs to change the script.

**Files written** (I edited nothing outside these):
- /Users/wojciechwozniak/projekty/komeniusz-imagine/src/graphics/colors.js
- /Users/wojciechwozniak/projekty/komeniusz-imagine/src/graphics/surface.js
- /Users/wojciechwozniak/projekty/komeniusz-imagine/src/graphics/canvasSurface.js
- /Users/wojciechwozniak/projekty/komeniusz-imagine/src/graphics/shapes.js
- /Users/wojciechwozniak/projekty/komeniusz-imagine/src/graphics/turtle.js
- /Users/wojciechwozniak/projekty/komeniusz-imagine/src/graphics/world.js
- /Users/wojciechwozniak/projekty/komeniusz-imagine/tests/graphics.test.js

## Exported API

**colors.js**
- `resolveColor(v, who?) -> {r,g,b,css}` accepts:
  - a number or numeric word 0–15 (palette §3.2);
  - a PL/EN name with optional suffix 1–12 (§3.3/3.4);
  - an `[r g b]` list, whose elements may be `jld`;
  - `jld` / `any`;
  - an `{r,g,b}` object or `'#rrggbb'`.
- On bad input it throws LogoError `<who> nie lubi X jako danej`.
- `colorToLogo(c)` returns the palette number 0–15 when the colour is exactly in the palette, otherwise `[r g b]`. It never returns a name, because §3.1 doesn't specify one.
- Also exported: `toRGBList(v, who)`, `colorFromName(name)`, `paletteIndex(c)`, `makeColor(r,g,b)`, `sameColor`, `PALETTE`, `IMAGINE_COLOR_NAMES` (the 18 names for `kolory`), `SUFFIX_L`, `BLACK`, `WHITE`.

**surface.js**
- `HeadlessSurface({width=796, height=499, pixels=true, background})` records every call in `ops` and draws into an in-memory RGBA buffer.
- Surface methods (all take Logo coordinates and resolved colours):
  - `resize(w,h)`, `clear(color?)`, `setBackground(c)`
  - `line(x1,y1,x2,y2,{color,width,mode:'paint'|'erase'|'reverse',background,pattern,dashOffset})`
  - `polygon(points,{fillColor,color,width})`
  - `ellipse(x,y,rx,ry,{rotation,start,end,color,width,fillColor})`
  - `arc(x,y,r,start,end,style)`
  - `fill(x,y,color,{bounds}) -> pixelsFilled`
  - `getPixel(x,y) -> {r,g,b,css}`
  - `text(x,y,str,{font,size,color,heading,bold,italic})`, `measureText(str,style) -> {width,height}`
  - `image(img,x,y,opts)`, `stamp(shape,x,y,opts)`, `drawTurtles(turtles)`
- Helpers: `logoToPixel`, `pixelToLogo`, `floodFill(data,w,h,sx,sy,color,box?)` (iterative scanline fill), `ellipsePoints`, `penDash`.
- Angles are Logo headings (0 = north, clockwise). For ellipses, `rx` runs across the heading and `ry` along it.

**canvasSurface.js**
- `new CanvasSurface({container | canvas+overlay, width, height, dpr})` has the same methods as above.
- It uses a drawing canvas plus an overlay canvas for turtles, scaled for HiDPI.
- Flood fill and `getPixel` work on `ImageData`; the XOR pen is done in software through a mask.
- Extras: `clientToLogo(clientX, clientY)` and `toDataURL()`.
- It doesn't touch the DOM at import time, so the module loads in Node.

**shapes.js**
- `TURTLE_SHAPE` (the green vector turtle), `defaultShape()`, `getShape(name)`, `shapeNames()`, `BUILTIN_SHAPES`.
- Built-in names: żółw/turtle, strzałka/arrow, trójkąt/triangle, kwadrat/square, gwiazda/star, koło/circle, kursor/cursor.
- Builders: `createVectorShape(paths, opts)`, `createImageShape(images, opts)`, `createAnimatedShape(shapes)`, `shapeFromOps(ops, {originX, originY, heading})`, `compactToPoints([n [d a…]])`, `shapeFromCompact(list, opts)`.
- Rendering: `drawShape(ctx, shape, {x, y, heading, scale, frame, color})`, `shapeRadius(shape, scale)`.

**turtle.js** — `class Turtle extends LogoObject`
- Fields:
  - `name, x, y, heading, homeState{x,y,heading}`
  - `pen` ('opu'|'pod'|'ścier'|'odwr'), `penColor, penWidth, penPattern, fillColor, fillPattern`
  - `visible, shape` (null = default turtle), `shapeScale, shapeColor, frame`
  - `range` (null or `[x1 y1 x2 y2]`), `rangeStyle` (getter/setter), `font, world, page`
  - `penDown` — a boolean getter/setter, not a method.
- Async (must be awaited): `forward(d)`, `back(d)`, `right(a)`, `left(a)`, `setPos(x,y)`, `setX`, `setY`, `setXY`, `moveBy(dx,dy)`.
- Sync:
  - `setHeading(h)`, `towards(x,y)`, `distance(x,y)`, `home()`, `jumpTo(x,y)`
  - `penUp()`, `penDownCmd()`, `penErase()`, `penReverse()`, `setPen(word)`
  - `setPenColor(c)` (also sets the fill colour, §17.11), `setFillColor`, `setPenWidth` (values below 1 become 1), `setPenPattern`, `setFillPattern`
  - `show()`, `hide()`, `setVisible(b)`, `setShape(s)`, `setHomeState(x,y,h)`, `setRange(r)`
  - `fill()`, `circle(diam)`, `filledCircle(diam)`, `point(diam)`, `dot()` (draws even with the pen up)
  - `ellipse(a, b, {start, end, filled})`, `arc(angle, r)`, `polygon(points)`
  - `label(t)`, `label2(t)`, `textSize(t)`, `stamp()`, `colorUnder()`
  - `getSetting(name)`, `setSetting(name, v) -> bool`, `resetState()`
- Helpers: `snap`, `normHeading`, `parsePenWord`, `parseRangeStyle`, `DEFAULT_FONT`.
- `np 0` with the pen down draws a 1px point.
- Positions and headings are rounded to 1e-9 and -0 becomes 0, so `pw 90 np 100` gives exact integers.

**world.js** — `class World({surface?, width, height})` and `class Page extends LogoObject`
- Page fields: `width, height, background, wrapMode`. Page has `getSetting` but no `setSetting` yet.
- World state:
  - `turtles`, `objects` (Map normName → LogoObject, including `s1`), `activeTurtles`, `page`, `pages`
  - `classes`, `turtleClass`, `pageClass`
  - `speed`, `frameDelay=16`, `yieldInterval=16`, `fenceError=false`
  - `timers=[]`, `processes=[]` (empty placeholders)
  - `eventHandler`, `abortCheck`, `mouse{x,y,buttons}`, `keys{buffer,last}`
- Objects: `createTurtle(name?, {parent}) -> Turtle` (smallest free ż<n>; throws if the name exists), `removeTurtle(t|name)`, `registerObject`, `unregisterObject`, `getObject(name)`, `nextName(prefix)`, `turtlesOf(page)`.
- Page commands: `clean()` (zmaż), `clearScreen()` (czyść: also homes the page's turtles and fires gdyCzyść), `setBackground(c)` (sets and clears), `resize(w,h)`, `reset()` (odnowa), the `wrapMode` getter/setter.
- Scheduling: `async yield()`, `async frame()`, `abort()`, `clearAbort()`, `checkAbort()`, `stepPixels()`, `stepDegrees()`.
- Rendering and input: `onRender(cb) -> unsubscribe`, `requestRender()`, `renderNow()`, `dispatchEvent(name, data)`, `turtleAt(x,y)`, `pointer(type,x,y,button)`, `key(k)`, `pixelToLogo(px,py)`.

## What other agents must know

- **Interpreter, Stop button:** `Interpreter.abort()` must call `world.abort()`, and `run()` must call `world.clearAbort()` at the start.
  - Otherwise Stop won't interrupt a long animated `np`, and a flag left set makes every later run throw at its first yield.
  - `yield()` and `frame()` throw `AbortSignal` from errors.js. `world.abortCheck = fn` is an alternative hook that's called at every yield and frame.
  - `yield()` is cheap: it goes to the macrotask queue only after 16 ms of wall time (setImmediate in Node, MessageChannel in the browser).
- **Interpreter, turtle settings:** turtle and page settings are not stored in `vars`, so `findVar('kierunek')` won't find them.
  - Name-resolution step 5 must call `obj.getSetting(name)`.
  - `nowy` and `ustaw` lists should call `obj.setSetting(name, v)`, which returns false when the name isn't a setting. There, `pw` means pen width.
- **prims-turtle:**
  - `turtle.penDown` is a property, so calling `turtle.penDown()` throws TypeError. Use `penDownCmd()` or `setPen(word)` for all four pen states.
  - Await the async moves with `Promise.all` over the active turtles.
  - Turtle methods take numbers; resolve `jld` before calling. Colour arguments accept any Logo form.
  - `circle`, `filledCircle` and `point` take a diameter.
  - `okrąg`, `koło`, `kropka` and `elipsa` draw nothing when the pen is up; `pkt` and `napisz` always draw.
  - `fill()` is limited to the turtle's own range rectangle.
- **Range style:** commands like `sklej` and `okno` should set the turtle's own `rangeStyle`. `world.wrapMode` is only the page default that turtles inherit until they set their own.
- **Custom shapes:** `setShape` accepts only null, `[]`, a built-in name or a Shape object, so a drawing list must be converted first.
  - Instruction list such as `[powtórz 3 [np 50 pw 120]]`: create a temporary `new World({surface: new HeadlessSurface({pixels:false})})`, run the list with that world's `ż1` as `ctx.turtle`, then call `shapeFromOps(tmpSurface.ops)`.
  - Compact form `[n [d a…]]`: use `shapeFromCompact`.
  - Image: use `createImageShape`.
- **Events (prims-objects):** `world.eventHandler = (name, data) => …` receives:
  - pointer events (gdyKlik, gdyDwuklik, gdyLewyWciśnięty, gdyPrawyWciśnięty, gdyLewyPuszczony, gdyPrawyPuszczony, gdyRuchMyszy): `{target, x, y, button}`, where `target` is the turtle under the pointer or the page;
  - gdyCzyść: `{target: page}`;
  - gdyKlawisz: `{target: null, key}`. There is no main-window object yet.
- **UI:**
  - `world.speed = 0` means instant, which is the maximum and matches the original. Values 1–10 animate, with 1 the slowest and 10 the fastest animated speed. So the scale is not monotonic: 0 is faster than 10.
  - `new CanvasSurface({container})` creates both canvases.
  - Mouse input: convert with `surface.clientToLogo(e.clientX, e.clientY)`, then call `world.pointer(type, x, y, e.button)`.
  - Keyboard input goes to `world.key(k)`. Subscribe to redraws with `world.onRender(cb)`.

## Deviations from the spec
- **`płot`:** the turtle stops silently at the edge, as §2.7 says; §15 has no message for this. The error the task asked for is opt-in with `world.fenceError = true`, which draws up to the edge and then throws `<name>: żółw poza zakresem`.
- **`odbij`:** forward moves reflect the heading. `setPos` reflects the path but keeps the heading.
- **Pinned colours:** `czerwony8` and `jasnoniebieski8` use the exact EN-help values. Plain HSL gives r=111 for `jasnoniebieski8`, outside the doc's ±6.
- **Grey family:** szary, czarny, biały and jasnoszary use their own level table so that szary1 = #000, szary9 = #C0C0C0 and szary12 = #FFF hold exactly.
- **Names vs numbers:** names follow §3.3 and numbers follow §3.2, so `zielony` is #00C000 while 10 is #00FF00.
- **Extra colour names (extension):** morski, bordowy, limonkowy, teal, maroon, lime, navy, silver, brown.

## Known gaps
- Fill patterns (`wzórMal` 1–7) are stored but not rendered.
- On the headless surface, text, image and stamp are recorded as ops but not drawn into pixels.
- Only page `s1` is drawn; there is no multi-page support.
- The shown range (`ustalWidocznyZakres`) is ignored.
- `Page` has no `setSetting`.
- On the canvas, antialiased diagonal lines can make `colorUnder` return a blended colour that isn't in the palette. Flood fill stops at those edge pixels.


---

The core is written and works: reader, parser, interpreter, facade and tests. All 59 tests pass, including the graphics agent's tests and a smoke test against the real `src/graphics/world.js`.

**Fix the test command first:** on Node 25, `node --test tests/` (the `package.json` "test" script) fails before running anything, with `Cannot find module …/tests`, because it treats the folder as a module. Use `node --test "tests/**/*.test.js"` or plain `node --test`; neither runs `helpers.js`. Whoever owns `package.json` should change the script.

**Files**
- New:
  - `src/core/lexer.js`
  - `src/core/parser.js`
  - `src/core/interpreter.js`
  - `src/logomocja.js`
  - `tests/helpers.js`
  - `tests/core.test.js`
- Extended:
  - `src/core/errors.js`: `LogoError` now takes `{procedure, line, hint, code, value, primitive}`, and there is a new `formatError(err)`.
  - `src/core/values.js`: new `badInput(who, v)`; `toNumber`/`toBool` messages changed (see below).

**Exported API**
- **lexer.js:**
  - `readLines(src) -> [{items, line, start, end}]`
  - `readList(text) -> Array`
  - `runparse(list) -> tokens` (cached per list)
  - `T` (token types), `markLiteral`, `isMarkedLiteral`
- **parser.js:**
  - `parse(src) -> {body, bodyLines:[{items,line}], definitions}`. Each definition is `{name, params, optionalParams:[{name,default}], restParam, defaultArity, minArity, maxArity, blankMissing, lines, lineNumbers, body, sourceText, line}`.
  - `defFromList(name, [[:a :b] [line]...])`, `defToList(def)`, `defToSource(def)`
  - `needsMoreInput(src)`: true for an open `[` or an `oto` without `już`. The UI can use it for the `> ` prompt.
- **interpreter.js:** `Interpreter`, `Ctx`, `isTurtle`, `HINT_UNKNOWN`, `HINT_UNUSED`. Methods (full JSDoc in the file header):
  - Running: `run(src) -> {ok, error?, aborted?, definitions}`, `runList(list, ctx)`, `execList(list, ctx)`, `evalList(list, ctx, who?)`
  - Calling: `callProcedure(name|def, args, ctx)`, `callUsual(ctx, args)` (for `zwykle`)
  - Variables: `getVar`, `hasVar`, `setVar`, `makeLocal(name, ctx, value?)`, `eraseVar`
  - Contexts: `childCtx(ctx, {newFrame?, ...})`, `rootCtx()`, `objectCtx(ctx, obj)`, `procFrame(ctx)`
  - Processes and stopping: `spawnProcess(list, ctx, {name, self, who, forever, every, body, onDone}) -> {id, name, done, cancelled, error, promise, cancel()}`, `processes`, `waitForProcesses()`, `sleep(ms, ctx)` (wakes on Stop), `abort()`, `abortSignal`, `checkAbort(ctx)`, `running`
  - Definitions: `defineProcedure(def, {object?})`, `defineFromSource(text, {object?})`, `defineFromList(name, list)`, `text(name)`, `procedureSource(name)`, `getProcedure`, `eraseProcedure`, `eraseAll`, `onChange(cb)`
  - Fields: `procedures`, `globals`
  - Lookup: `resolve`, `resolveSteps` and `varSteps` (ordered `{name, fn}` arrays per §17.5, so the order can be changed), `findObject(name, ctx, parent?)` (can be overridden), `procChain(obj)`, `findProcFrom(obj, key, after)`
  - Settings: `maxDepth` (10000), `yieldEvery` (1000)
- **logomocja.js:** `createLogomocja({surface, io}) -> {interp, world, registry, io, run, stop, reset({all})}`. It sets `world.interp = interp`.
- **tests/helpers.js:** `makeTestLogo({input?}) -> {logo, out, errors, errorTexts, interp, world, surface, run(src)}`. `errors` holds the exact `err.message`; `errorTexts` holds the full printed text.

**What other agents must know**
- **`jeśli` third list (§17.8):** the evaluator automatically gives the primitive named `jeśli` one extra input when a literal `[...]` follows. Its fn must accept a third argument. Other primitives can opt in with `extraListArg: true`.
- **Redefining extensions:** a user `oto` with a primitive's name gives `X jest procedurą pierwotną`, unless the spec has `extension: true` or `redefinable: true`. Prims owners should set this on every `rozszerzenie` row (`potęga`, `maks`, `min`, `pi`, `log`…).
- **Changed messages in `values.js`:**
  - `toNumber(v, who)` now gives `who nie lubi X jako danej`.
  - Without `who`, the interpreter rewrites the message using the primitive name as typed.
  - Any prims test expecting `… nie jest liczbą` will break.
- **Error wording follows §15, not the task text:** `X nie dał wyniku dla Y` (not "nie zwraca wyniku"), `Nie wiem co zrobić z X`, `Za mało danych dla X`, `Za dużo danych dla X`, `Za mało pamięci (za głęboka rekurencja) w X`, `Zatrzymano!`.
  - The hint goes on a second line, and ` w procedurze X` is added only to the printed text; `err.message` stays the exact first line.
  - `io.printError(text, err)` gets the error object as its second argument.
- **ctx conventions:**
  - Turtle commands should use `ctx.who ?? ctx.process?.who ?? world.activeTurtles`. `ctx.who=[obj]` is set for `ż1'np 50`.
  - `ctx.self` and `ctx.turtle` are lazy: they default to the first active turtle. Build contexts with `interp.childCtx`, not spread.
  - Loop bodies use `execList`; `uruchom` and `jeśli` use `runList`; conditions use `evalList`.
  - `test` state goes in `interp.procFrame(ctx)`. Loop variables go in `childCtx(ctx, {newFrame:true})`, then `c.scope.vars.set(normName(n), v)`.
  - `niech` goes to the nearest procedure frame, or to globals at top level.
  - Core defines no repcount field. prims-control must pick one and use it in `powtórz`, `dla`, `dopóki` and `dlaKażdego`.
- **Stop and the world:** `interp.abort()` also calls `world.abort()`, and the next `run()` or `spawnProcess()` clears it. So events and timers must go through `interp.spawnProcess`; calling `runList` directly after a Stop throws `Zatrzymano!` until the next run.
- **Objects:**
  - A value object (slider) implements `logoValue()`.
  - Behaviours are read from `obj.behaviours`.
  - `ctx.procOwner` records which object's method is running, which `zwykle` needs.
- **`.imp` import:** feed the bar content of `definiuj'X |…|` lines to `interp.defineFromSource`, which turns `¶` into newlines.
- **Speed:** tail calls such as `oto ruch … ruch już` run in constant stack. Every 1000 steps the interpreter calls `world.yield()`, and World decides when to really yield. A 200k-step loop takes about 0.19 s.

**Known gaps**
- Recursion through the last command inside a `jeśli` or `uruchom` list is not tail-call optimised, so it is capped by `maxDepth`.
- Parentheses inside list literals are split when read, so `pokaż [(a b)]` prints `[( a b )]`.
- In an unquoted word, a `\`-escaped operator character can still be split when the list is run.
- A missing `już` at end of text is accepted and ends the definition there, rather than raising an error.
- Each logical line runs separately, so parentheses cannot span lines unless joined with `~`.