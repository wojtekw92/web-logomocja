// Errors and control-flow signals. See docs/ARCHITEKTURA.md.

export class LogoError extends Error {
  /**
   * @param {string} message first line, exact wording per PRIMITYWY.md §15
   * @param {{procedure?:string, line?:number, hint?:string, code?:number, value?:any, primitive?:string}} [opts]
   *   hint = optional second line (e.g. `Sprawdź pisownię. Może to nowe nieokreślone słowo`),
   *   code = error number (100 for `zgłośBłąd`), primitive = primitive that failed.
   */
  constructor(message, { procedure, line, hint, code, value, primitive } = {}) {
    super(message)
    this.name = 'LogoError'
    this.procedure = procedure
    this.line = line
    this.hint = hint
    this.code = code
    this.value = value
    this.primitive = primitive
  }
}

/** Thrown by `stop` — leaves the current procedure without a value. */
export class StopSignal {
  constructor() { this.kind = 'stop' }
}

/** Thrown by `wynik` — leaves the current procedure returning `value`. */
export class OutputSignal {
  constructor(value) { this.kind = 'output'; this.value = value }
}

/** Thrown when the user presses Stop or a program calls zatrzymajWszystko. */
export class AbortSignal {
  constructor(reason = 'Zatrzymano') { this.kind = 'abort'; this.reason = reason }
}

/** catch/throw */
export class ThrowSignal {
  constructor(tag, value) { this.kind = 'throw'; this.tag = tag; this.value = value }
}

export const isSignal = (e) =>
  e instanceof StopSignal || e instanceof OutputSignal || e instanceof AbortSignal || e instanceof ThrowSignal

/** Text printed for an error: message (+ ` w procedurze X`) and the hint on a second line. */
export function formatError(err) {
  if (err instanceof AbortSignal) return 'Zatrzymano!'
  const msg = err && err.message !== undefined ? String(err.message) : String(err)
  const where = err?.procedure && !msg.endsWith(` w ${err.procedure}`) && !msg.endsWith(` w procedurze ${err.procedure}`)
    ? ` w procedurze ${err.procedure}` : ''
  return msg + where + (err?.hint ? '\n' + err.hint : '')
}
