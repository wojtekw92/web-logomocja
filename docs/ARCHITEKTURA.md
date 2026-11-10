# Logomocja Web — architecture contract

Goal: a faithful, complete browser implementation of **Logomocja** (the Polish edition of
Imagine Logo, by Komeniusz), using vanilla ES modules, no build step, no runtime dependencies.
Runs by opening `index.html` through any static server (`npx serve .` / `python3 -m http.server`).
Tests run with `node --test tests/` (Node 20+, `node:test` + `node:assert`). `package.json` has
`"type": "module"` and `"test": "node --test tests/"`.

The language reference (Polish primitive names, aliases, semantics, error messages) lives in
`docs/PRIMITYWY.md`. That file is the source of truth for **names**; this file is the source of
truth for **code interfaces**. Every module MUST follow the interfaces below exactly so that
parallel authors can integrate without coordination.

## Directory layout (file ownership)

```
index.html, styles.css            UI            (owner: ui)
src/main.js                       UI bootstrap  (owner: ui)
src/ui/*.js                       UI components (owner: ui)
src/core/values.js                value model   (owner: core)
src/core/errors.js                errors/signals(owner: core)
src/core/lexer.js, parser.js      reader        (owner: core)
src/core/interpreter.js           evaluator     (owner: core)
src/core/registry.js              primitive table (owner: core)
src/graphics/world.js             World, pages, scheduler hooks (owner: graphics)
src/graphics/turtle.js            Turtle state + drawing         (owner: graphics)
src/graphics/surface.js           Surface interface + HeadlessSurface (owner: graphics)
src/graphics/canvasSurface.js     CanvasSurface (browser)        (owner: graphics)
src/graphics/shapes.js            built-in turtle shapes         (owner: graphics)
src/prims/math.js                 arithmetic, logic, random      (owner: prims-data)
src/prims/words.js                words & lists                  (owner: prims-data)
src/prims/control.js              control flow, procedures, run  (owner: prims-control)
src/prims/variables.js            variables, properties          (owner: prims-control)
src/prims/io.js                   pisz/druk/czytaj/okno dialogowe, timing (owner: prims-control)
src/prims/turtle.js               turtle/graphics primitives     (owner: prims-turtle)
src/prims/objects.js              Imagine OOP, events, processes (owner: prims-objects)
src/prims/index.js                imports every prims module, exports registerAll(registry) (owner: core creates stub; each prims owner adds its own line)
src/logomocja.js                  facade: createLogomocja({surface}) (owner: core)
tests/*.test.js                   each owner writes tests for their own files
examples/*.lgm                    sample programs (owner: integration)
```

Never edit a file you do not own except `src/prims/index.js` (add one import+call line for your module).

## Value model (`src/core/values.js`)

| Logo value | JS representation |
|---|---|
| number | JS `number` |
| word | JS `string` (numbers written as words like `"12` are strings until used numerically) |
| list | JS `Array` (nested arrays for sublists). Lists are immutable by convention. |
| boolean | the words `prawda` / `fałsz` (strings). Helpers `toBool(v)` / `fromBool(b)`. |
| object (Imagine) | instance of `LogoObject` (see objects) |
| "no value" | `undefined` |

Exports: `isNumber, isWord, isList, isObject, toNumber(v) (throws LogoError if not numeric),
toBool(v), fromBool(b), TRUE='prawda', FALSE='fałsz', formatValue(v, {top:true})`
(`formatValue` prints like Logo: lists with brackets except at top level of `pisz`,
numbers without trailing `.0`, floats rounded to ≤ 10 significant digits),
`equalValues(a,b)` (case-insensitive for words, numeric comparison when both numeric),
`normName(s)` = `s.toLocaleLowerCase('pl')` — **all name lookups (procedures, variables,
primitives, objects, properties) are case-insensitive via normName**.

## Errors (`src/core/errors.js`)

- `class LogoError extends Error { constructor(message, {procedure, line} = {}) }` — user-facing
  message in **Polish**, wording per `docs/PRIMITYWY.md` (e.g. `Nie wiem jak wykonać xyz`).
- Control signals (not errors, thrown and caught by the interpreter):
  `StopSignal` (stop), `OutputSignal{value}` (wynik/output), `AbortSignal` (user pressed Stop / `zatrzymajWszystko`),
  `ThrowSignal{tag, value}` (catch/throw).

## Reader (`src/core/lexer.js`, `src/core/parser.js`)

- Standard Logo reader: words, numbers, `"quoted`, `:var`, `[lists]`, `(parens)`, infix
  `+ - * / ^ = < > <= >= <>`, unary minus, comments `;` to end of line, `~` line continuation.
- `parse(source)` returns a **list of tokens/runlist** in the same representation as Logo lists
  (so `uruchom [ ... ]` and top-level source share one evaluator). Procedure definitions
  `oto nazwa :a :b ... już` (and any aliases from PRIMITYWY.md) are recognized at top level
  and returned separately: `parse(source) -> { body: Array, definitions: [{name, params, optionalParams, restParam, body, sourceText}] }`.
- Polish letters (ąćęłńóśźż, upper and lower) are valid in names.

## Interpreter (`src/core/interpreter.js`)

```js
export class Interpreter {
  constructor({ registry, world, io })
  // io: { print(text), printError(text), readLine(prompt): Promise<string>, clearText() }
  async run(source)                 // parse, define procedures, evaluate body; errors -> io.printError
  async runList(list, ctx)          // evaluate a runlist; returns value of last expression if any
  async evalList(list, ctx)         // like runList but requires an output value
  async callProcedure(name, args, ctx)
  defineProcedure(def)              // def from parser; also used by `definiuj`/editor
  procedures: Map<normName, def>
  globals: Map<normName, value>
  abort()                           // throws AbortSignal into running code at the next await point
  get running()
}
```

- **Async everywhere**: every primitive call is awaited; this gives cooperative multitasking
  for Imagine parallel processes and lets the UI stay responsive. The interpreter must yield to
  the event loop (`await world.yield()`) at least every N (~1000) primitive calls and inside
  loops, and check the abort flag there.
- **Scope**: Logo dynamic scoping. `ctx.scope` is a chain `{vars: Map, parent}`; procedure
  inputs and `lokalna` variables live in the frame. Global vars in `interp.globals`.
- **ctx** passed to primitives: `{ interp, world, scope, self, turtle, process, procName }`
  — `self` is the current Imagine object (the "who is executing" object, defaults to the active
  turtle), `turtle` is the turtle commands apply to (=`self` when self is a turtle).
- Infix precedence per standard Logo. Primitive with arity N consumes N inputs; `(prim a b c)`
  in parentheses allows variadic calls where `maxArity` permits.
- Name resolution order for a word `foo`: user procedure → primitive → **object-scoped**
  procedures/properties of `ctx.self` and its class chain (Imagine: methods of the object) →
  error `Nie wiem jak wykonać foo`. Also handle Imagine dot syntax `obiekt'polecenie` / `obiekt'zmienna`
  (Imagine uses apostrophe: `ż1'np 50`) — the parser emits it as a single word; the interpreter
  resolves `x'y` by running `y` with `self` = object `x`.

## Registry (`src/core/registry.js`)

```js
export class Registry {
  define(names, spec)   // names: string | string[] (first = canonical Polish name, rest = aliases incl. abbreviations)
  // spec: { arity: number, minArity?, maxArity? (Infinity allowed), fn: async (ctx, ...args) => value|undefined,
  //         noEval?: false, doc?: string }
  lookup(name)          // -> spec | undefined (case-insensitive)
  names()               // all canonical names (for autocomplete / help)
}
```

Each prims module exports `export function register(registry) { registry.define(...) ... }`.
`src/prims/index.js` exports `registerAll(registry)` that calls each module's `register`.

## Graphics (`src/graphics/*`)

Coordinate system: Logo standard — origin at page centre, +y up, heading 0 = north, clockwise
degrees. Default page 600×400 (Imagine default may differ: see PRIMITYWY.md).

```js
// surface.js — drawing backend interface; HeadlessSurface records ops for tests
export class HeadlessSurface { ops: Array; width; height; /* same methods as CanvasSurface */ }
// methods: resize(w,h), clear(color), line(x1,y1,x2,y2,{color,width}), fill(x,y,color) (flood fill),
//          text(x,y,str,{font,size,color,heading}), arc(x,y,r,start,end,{color,width}),
//          polygon(points,{fillColor,color,width}), getPixel(x,y) -> color, setBackground(color), image(...)
// Coordinates passed to surfaces are ALREADY in logo coordinates; the surface converts to pixels.

// world.js
export class World {
  constructor({ surface })
  turtles: Turtle[]; objects: Map<normName, LogoObject>; activeTurtles: Turtle[] (the "kto/ktoś" set)
  createTurtle(name?) -> Turtle
  page: { width, height, background, wrapMode: 'okno'|'zawijaj'|'płot' }
  speed (0..n) ; async yield() (setTimeout/requestAnimationFrame based, tunable by speed)
  onRender(cb)      // UI subscribes; world calls after state changes (throttled to rAF)
  timers / processes registry used by prims/objects.js
  reset()           // clear page, single default turtle ż1 at home
}
// turtle.js
export class Turtle { name, x, y, heading, penDown, penColor, penWidth, visible, shape, fillColor,
  async forward(d), back(d), right(a), left(a), setPos(x,y), setHeading(h), home(), ... }
```

Turtle movement must animate according to `world.speed` (split long moves into steps and
`await world.yield()`), and respect wrap mode. Turtles are drawn by the renderer on an overlay,
not onto the drawing layer.

## Imagine objects (`src/prims/objects.js` + `LogoObject` in `src/core/values.js`)

`class LogoObject { name, className, parent (class object or null), vars: Map, procs: Map, events: Map }`.
Turtles are LogoObjects (Turtle extends LogoObject). Classes are LogoObjects too (prototype
chain via `parent`). Events (`przyKliknięciu`, `przyNaciśnięciuKlawisza`, timers) are runlists
stored in `events` and run by the world as separate processes.

## UI

Polish-language IDE resembling Logomocja: large page (canvas) on top, scrollable text output
("Pole tekstowe"/memo) under it, a command line at the bottom with history (↑/↓), buttons
Uruchom / Zatrzymaj / Wyczyść, procedure editor panel (textarea with the `oto ... już`
definitions, "Zastosuj" button = define all), example selector loading `examples/*.lgm`,
speed slider, save/load project to localStorage and as `.lgm` file download/upload, help panel
listing primitives from `registry.names()` with docs.

## Facade (`src/logomocja.js`)

```js
export function createLogomocja({ surface, io }) -> { interp, world, registry, run(source), stop(), reset() }
```
Used by both the UI and the tests (tests use HeadlessSurface and a capturing io).
