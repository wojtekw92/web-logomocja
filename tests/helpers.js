// Test helpers (not a test file). Usage:
//   const t = await makeTestLogo()   // or makeTestLogo() sync
//   await t.run('pisz 1')  -> t.out == ['1'], t.errors == []
// `out` collects io.print texts, `errors` collects err.message (exact §15 wording),
// `errorTexts` the full printed error text (with hint / `w procedurze X`).
import { createLogomocja } from '../src/logomocja.js'
import { HeadlessSurface } from '../src/graphics/surface.js'

export function makeTestLogo({ input = [], surface = new HeadlessSurface() } = {}) {
  const out = []
  const errors = []
  const errorTexts = []
  const inputs = [...input]
  const io = {
    print: (text) => out.push(String(text)),
    printError: (text, err) => {
      errorTexts.push(String(text))
      errors.push(err && err.message !== undefined ? err.message : String(text).split('\n')[0])
    },
    readLine: async () => (inputs.length ? inputs.shift() : ''),
    clearText: () => { out.length = 0 },
  }
  const logo = createLogomocja({ surface, io })
  return {
    logo,
    surface,
    out,
    errors,
    errorTexts,
    inputs,
    interp: logo.interp,
    world: logo.world,
    run: (src) => logo.interp.run(src),
  }
}
