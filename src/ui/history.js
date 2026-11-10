// Command-line history (pure logic, no DOM). Owner: ui.
//
//   const h = new CommandHistory({ limit: 200 })
//   h.push('np 100')          // after the command was run
//   h.prev(currentText)       // ↑ : older entry (remembers the unfinished draft)
//   h.next()                  // ↓ : newer entry, finally the draft again

export class CommandHistory {
  constructor({ limit = 300, items = [] } = {}) {
    this.limit = limit
    this.items = items.slice(-limit)
    this.index = this.items.length // == items.length -> editing the draft
    this.draft = ''
  }

  push(text) {
    const t = String(text)
    if (!t.trim()) { this.reset(); return }
    if (this.items[this.items.length - 1] !== t) this.items.push(t)
    if (this.items.length > this.limit) this.items.splice(0, this.items.length - this.limit)
    this.reset()
  }

  reset() {
    this.index = this.items.length
    this.draft = ''
  }

  /** Older entry, or undefined when there is none. `current` = text in the input now. */
  prev(current = '') {
    if (!this.items.length || this.index === 0) return undefined
    if (this.index === this.items.length) this.draft = current
    this.index--
    return this.items[this.index]
  }

  /** Newer entry; past the newest returns the saved draft; undefined when already at the draft. */
  next() {
    if (this.index >= this.items.length) return undefined
    this.index++
    return this.index === this.items.length ? this.draft : this.items[this.index]
  }

  toJSON() { return this.items.slice() }
}
