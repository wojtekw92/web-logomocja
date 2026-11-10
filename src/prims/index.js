// Core-owned. Do not edit: every prims module is already wired here.
import * as math from './math.js'
import * as words from './words.js'
import * as control from './control.js'
import * as variables from './variables.js'
import * as io from './io.js'
import * as turtle from './turtle.js'
import * as objects from './objects.js'

export const modules = { math, words, control, variables, io, turtle, objects }

export function registerAll(registry) {
  for (const m of Object.values(modules)) m.register(registry)
  return registry
}
