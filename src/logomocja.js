// Facade: wires Registry + primitives + World + Interpreter. See docs/ARCHITEKTURA.md (Facade).
//
//   createLogomocja({ surface, io }) -> { interp, world, registry, run(source), stop(), reset(opts) }
//
// io: { print(text), printError(text, err), readLine(prompt): Promise<string>, clearText() }
import { Registry } from './core/registry.js'
import { Interpreter } from './core/interpreter.js'
import { registerAll } from './prims/index.js'
import { World } from './graphics/world.js'

const noop = () => {}

export function createLogomocja({ surface, io = {} } = {}) {
  const fullIo = {
    print: noop,
    printError: noop,
    readLine: async () => '',
    clearText: noop,
    ...io,
  }
  const registry = new Registry()
  registerAll(registry)
  const world = new World({ surface })
  const interp = new Interpreter({ registry, world, io: fullIo })
  // let the world (events, timers) reach the interpreter without importing it
  if (world.interp === undefined || world.interp === null) {
    try {
      world.interp = interp
    } catch {
      /* read-only property: ignore */
    }
  }
  if (typeof world.attachInterpreter === 'function') world.attachInterpreter(interp)

  return {
    interp,
    world,
    registry,
    io: fullIo,
    /** Run program text; resolves to {ok, error?}. */
    run: (source) => interp.run(source),
    /** Stop button / F12. */
    stop: () => interp.abort(),
    /**
     * Stop everything and reset the page (single turtle ż1 at home).
     * `{all: true}` also erases user procedures and global variables.
     */
    reset: ({ all = false } = {}) => {
      interp.abort()
      world.reset?.()
      if (all) interp.eraseAll()
    },
  }
}

export default createLogomocja
