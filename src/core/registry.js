// Primitive table. See docs/ARCHITEKTURA.md.
import { normName } from './values.js'

export class Registry {
  constructor() {
    this.table = new Map()      // normName -> spec
    this.canonical = new Map()  // canonical name -> spec
  }

  /**
   * @param {string|string[]} names first = canonical Polish name, rest = aliases
   * @param {{arity:number, minArity?:number, maxArity?:number, fn:Function, doc?:string}} spec
   */
  define(names, spec) {
    const list = Array.isArray(names) ? names : [names]
    if (!list.length) throw new Error('Registry.define: no names')
    if (typeof spec.fn !== 'function') throw new Error(`Registry.define(${list[0]}): fn missing`)
    const full = {
      arity: spec.arity ?? 0,
      minArity: spec.minArity ?? spec.arity ?? 0,
      maxArity: spec.maxArity ?? spec.arity ?? 0,
      ...spec,
      name: list[0],
      aliases: list.slice(1),
    }
    this.canonical.set(list[0], full)
    for (const n of list) this.table.set(normName(n), full)
    return full
  }

  lookup(name) {
    return this.table.get(normName(name))
  }

  has(name) {
    return this.table.has(normName(name))
  }

  names() {
    return [...this.canonical.keys()]
  }

  specs() {
    return [...this.canonical.values()]
  }
}
