// Help panel: searchable list of every primitive from registry.specs(). Owner: ui.
import { searchSpecs, arityText } from './helpIndex.js'

const RETURNS = (spec) => (spec.returns ?? spec.kind ?? '')

export class HelpPanel {
  constructor({ input, list, count, registry, onInsert }) {
    this.input = input
    this.list = list
    this.count = count
    this.registry = registry
    this.onInsert = onInsert
    this._t = null
    input.addEventListener('input', () => {
      clearTimeout(this._t)
      this._t = setTimeout(() => this.render(), 60)
    })
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = this.list.querySelector('.help-item')
        if (first) first.querySelector('.help-name')?.click()
      }
    })
    this.rendered = false
  }

  show(query) {
    if (query !== undefined) this.input.value = query
    this.render()
  }

  render() {
    const specs = this.registry.specs()
    const results = searchSpecs(specs, this.input.value)
    this.count.textContent = this.input.value.trim()
      ? `${results.length} z ${specs.length}`
      : `${specs.length} procedur pierwotnych`
    const frag = document.createDocumentFragment()
    const max = 400
    for (const { spec } of results.slice(0, max)) frag.appendChild(this.item(spec))
    if (results.length > max) {
      const more = document.createElement('li')
      more.className = 'help-more'
      more.textContent = `… i ${results.length - max} więcej — zawęź wyszukiwanie`
      frag.appendChild(more)
    }
    if (!results.length) {
      const none = document.createElement('li')
      none.className = 'help-more'
      none.textContent = specs.length ? 'Nic nie znaleziono.' : 'Brak zarejestrowanych procedur pierwotnych.'
      frag.appendChild(none)
    }
    this.list.replaceChildren(frag)
    this.rendered = true
  }

  item(spec) {
    const li = document.createElement('li')
    li.className = 'help-item'
    const head = document.createElement('div')
    head.className = 'help-head'
    const name = document.createElement('button')
    name.type = 'button'
    name.className = 'help-name'
    name.textContent = spec.name
    name.title = 'Wstaw do linii poleceń'
    name.addEventListener('click', () => this.onInsert?.(spec.name))
    const ar = document.createElement('span')
    ar.className = 'help-arity'
    ar.textContent = `wejścia: ${arityText(spec)}`
    ar.title = 'Liczba danych (w nawiasach: zakres przy wywołaniu w nawiasach okrągłych)'
    head.append(name, ar)
    const r = RETURNS(spec)
    if (r) {
      const k = document.createElement('span')
      k.className = 'help-kind'
      k.textContent = r
      head.appendChild(k)
    }
    li.appendChild(head)
    if (spec.aliases?.length) {
      const al = document.createElement('div')
      al.className = 'help-aliases'
      al.textContent = spec.aliases.join(', ')
      li.appendChild(al)
    }
    if (spec.doc) {
      const d = document.createElement('div')
      d.className = 'help-doc'
      d.textContent = spec.doc
      li.appendChild(d)
    }
    return li
  }
}
