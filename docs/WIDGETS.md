# Widgets and UI events: contract between prims-objects and UI

Owner: prims-objects (`src/prims/objects.js`). This text matches the header comment of
`objects.js`; when you change one, change the other.

## Setup

`createLogomocja()` calls `world.attachInterpreter(interp)`. `objects.js` defines that hook on
`World.prototype` and uses it to run `setupWorld(world, interp)`. Setup installs:

- `world.eventHandler`, the target of every `world.dispatchEvent(name, data)` call;
- `world.widgets` (array), `world.widgetsVersion` (number) and
  `world.buttonBar = {visible, buttons: [{caption, list}]}`;
- `world.mainWindow`, the main-window object named `oknoGłówne`;
- `world.paused` and `world.resumeAll()`, used by `wstrzymajWszystko` / `wznówWszystko`;
- the primitive classes `Główne`, `OknoGłówne`, `Plansza`, `PoleTekstowe`, `Suwak` and `Przycisk`,
  added to `world.classes`.

## Widget model (no DOM)

`world.widgets` holds `Widget` objects. `Widget` is a `LogoObject` subclass exported from
`objects.js`, and every widget is also registered in `world.objects` under its name. The renderer
reads these fields, or calls `widget.snapshot()` to get the same fields as a plain object:

| field | meaning |
|---|---|
| `kind` | `'button'` \| `'slider'` \| `'textbox'` \| `'pane'` |
| `name` | `prz1`, `suw1`, `pt1`, `p1`, … |
| `x`, `y` | Logo coordinates of the **top-left corner** (origin at page centre, +y up). On screen: `left = x + page.width/2`, `top = page.height/2 - y`. |
| `width`, `height` | px. Defaults: button 80×25, slider 150×24, text box 150×60, pane 200×150. |
| `visible` | boolean |
| `background` | CSS colour string or `null` (default look). In `snapshot()` only; on the object it is `backgroundCss`. |
| `caption` | button text |
| `value`, `min`, `max`, `vertical` | slider |
| `text` | text box content; `'\n'` separates lines |
| `page` | name of the widget's page (`'s1'`) |

**Change notification.** Every change in Logo code (creating, setting, removing a widget, or
changing the button bar) does three things:

- calls `world.notifyWidgets?.(world)`, which the UI may assign;
- increments `world.widgetsVersion`;
- calls `world.requestRender()`, so `world.onRender` subscribers fire as well.

A UI that only subscribes to `onRender` can re-render widgets whenever `widgetsVersion` changes.

**Logo side:**
- `nowy "Przycisk [napis Start poz [-100 100] gdyWciśnięty [np 10]]`
- `nowy "Suwak [min 0 maks 100 wartość 50]`
- `nowy "PoleTekstowe [rozmiar [200 80]]`
- Settings for every widget kind: `poz`, `rozmiar`, `widoczny`, `kolTła`, `nazwa`.
- Button: `napis`. Slider: `min`, `maks`, `wartość`, `pionowy`. Text box: `zawartość`.
- A slider name used as a word gives its value (`np suw1`), through `Widget.logoValue()`.

## Events the UI sends: `world.dispatchEvent(name, data)`

Names are case-insensitive, and the English Imagine names (`onPush`, `onChange`, …) work too.

| name | data | effect |
|---|---|---|
| `gdyWciśnięty` | `{target}` | button pressed. `target` is a widget name or object. |
| `gdyPuszczony` | `{target}` | button released |
| `gdyZmieniasz` | `{target, value}` | slider being dragged: the value is stored, then the handler runs. The handler is skipped while the previous run is still going. |
| `gdyPoZmianie` | `{target, value}` | slider released, or text box edited (send `value` = the whole text) |
| `przyciskPaska` | `{index}` | 0-based button of the button bar (`ustalPrzyciski`) clicked |
| `klik` / `click` | `{x, y, button}` | pointer click on the page. Logo coordinates; `button` 0 = left, 2 = right. |
| `dwuklik` / `dblclick` | `{x, y, button}` | double click |
| `wciśnięcie` / `down` | `{x, y, button}` | pointer pressed |
| `puszczenie` / `up` | `{x, y, button}` | pointer released |
| `ruch` / `move` | `{x, y}` | pointer moved |
| `klawisz` / `key` | `{key}` | key pressed (`KeyboardEvent.key`) |
| `wznów` / `resume` | `{}` | resume after `wstrzymajWszystko` (Stop also clears the pause) |

- **Short pointer and key names** (`klik`, `klawisz`, …) are forwarded to `world.pointer()` or
  `world.key()`. Those update `world.mouse` / `world.keys` and dispatch the canonical events. Calling
  `world.pointer(type, x, y, button)` / `world.key(k)` directly is equivalent.
- **Canonical event names** may be dispatched directly: `gdyKlik {target?, x, y, button}`,
  `gdyKlawisz {target: null, key}`, `gdyCzyść {target}`, `gdyWczytany`, `gdyPokazanaStrona`.
- **Return value:** `dispatchEvent` returns the array of started processes, which tests can await.

## Routing

- **Pointer events:** the target is the topmost visible turtle under the pointer, found by a
  shape-radius hit test (`world.turtleAt`), if that turtle (or its class or behaviours) has a
  handler for the event. Otherwise the page (`s1`) receives the event.
  - Movement also produces `gdyMyszWchodzi` / `gdyMyszWychodzi` on turtles.
  - Moving with a button held after a press on a turtle produces `gdyCiągnięty` on that turtle.
  - Dragging does **not** move the turtle by itself.
- **Widget pointer events:** the UI handles DOM clicks on widgets itself and sends
  `gdyWciśnięty` etc. Do not send those clicks as `klik`.
- **`gdyKlawisz`:** goes to the main window, the page and every turtle that has a handler.
- **`gdyZderzenie`:** fires for turtles with the setting `czuły prawda`, when their shape starts to
  overlap another visible turtle. It is checked on every render.
- **Processes:** every handler runs as a separate process (`interp.spawnProcess`) with
  `self` = the receiving object.
  - For a turtle, its turtle commands go to that turtle (`kto` = it).
  - For buttons and the page, they go to the active turtles.
- **Frozen objects** (`zamroźMnie`) receive no events.
- **Errors** in a handler are printed like any other error.
