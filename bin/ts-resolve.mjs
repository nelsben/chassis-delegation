// A Node module-resolution hook for bin/chassis-hook.mjs. The mod's pure
// libraries in hooks/lib/ import one another without an extension
// (`from './brief'`), which Node's own ESM resolver does not complete; this
// maps an extensionless relative import to the `.ts` file beside it. Node
// itself strips the types (22.18 or newer, where that is on by default).
// Nothing here is installed or fetched: it only looks at the local disk.
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

export async function resolve(specifier, context, next) {
  const relative = specifier.startsWith('./') || specifier.startsWith('../')
  if (relative && context.parentURL && !/\.[a-z]+$/.test(specifier.split('/').pop())) {
    const base = fileURLToPath(new URL(specifier, context.parentURL))
    for (const ext of ['.ts', '/index.ts']) {
      if (existsSync(base + ext)) return { url: pathToFileURL(base + ext).href, shortCircuit: true }
    }
  }
  return next(specifier, context)
}
