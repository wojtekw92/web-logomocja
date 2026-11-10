// Example programs: examples/index.json + examples/*.lgm (written by the integration agent).
// Missing / malformed index is handled gracefully. Owner: ui.

/**
 * Normalise index.json (pure). Accepted shapes:
 *   ["kwadrat.lgm", ...]
 *   [{file|plik|path, title|tytuł|nazwa|name, description|opis, category|kategoria}, ...]
 *   {examples|przykłady: [...]}
 * Returns [{file, title, description, category}].
 */
export function normalizeIndex(data) {
  let items = data
  if (items && !Array.isArray(items) && typeof items === 'object') items = items.examples ?? items['przykłady'] ?? items.items ?? []
  if (!Array.isArray(items)) return []
  const out = []
  for (const it of items) {
    if (typeof it === 'string') {
      out.push({ file: it, title: titleFromFile(it), description: '', category: '' })
    } else if (it && typeof it === 'object') {
      const file = it.file ?? it.plik ?? it.path ?? it.url
      if (!file) continue
      out.push({
        file: String(file),
        title: String(it.title ?? it['tytuł'] ?? it.nazwa ?? it.name ?? titleFromFile(file)),
        description: String(it.description ?? it.opis ?? ''),
        category: String(it.category ?? it.kategoria ?? ''),
      })
    }
  }
  return out
}

export function titleFromFile(f) {
  const base = String(f).split('/').pop().replace(/\.(lgm|logo|lg|txt|imp)$/i, '').replace(/[_-]+/g, ' ')
  return base.charAt(0).toLocaleUpperCase('pl') + base.slice(1)
}

export function exampleUrl(file, base = 'examples/') {
  if (/^([a-z]+:)?\/\//i.test(file) || file.startsWith('/')) return file
  if (file.startsWith('examples/')) return file
  return base + file
}

export async function fetchIndex(base = 'examples/') {
  try {
    const r = await fetch(base + 'index.json', { cache: 'no-cache' })
    if (!r.ok) return { items: [], error: `brak pliku ${base}index.json (${r.status})` }
    const items = normalizeIndex(await r.json())
    return { items, error: items.length ? null : 'pusty spis przykładów' }
  } catch (e) {
    return { items: [], error: 'nie udało się wczytać spisu przykładów' }
  }
}

export async function fetchExample(file, base = 'examples/') {
  const r = await fetch(exampleUrl(file, base), { cache: 'no-cache' })
  if (!r.ok) throw new Error(`Nie mogę wczytać przykładu ${file} (${r.status})`)
  return new Uint8Array(await r.arrayBuffer())
}
