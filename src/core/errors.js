// Errors and control-flow signals. See docs/ARCHITEKTURA.md.

export class LogoError extends Error {
  constructor(message, { procedure, line } = {}) {
    super(message)
    this.name = 'LogoError'
    this.procedure = procedure
    this.line = line
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
