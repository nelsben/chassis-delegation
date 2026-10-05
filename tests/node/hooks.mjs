// Node loader hooks: extensionless relative imports → .ts; the kit → a shim.
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = new URL('./', import.meta.url)
export async function resolve(specifier, context, next) {
  if (specifier === 'claude-code/testing') return { url: new URL('kit.mjs', here).href, shortCircuit: true }
  if (specifier === 'claude-code') return { url: new URL('cc.mjs', here).href, shortCircuit: true }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/.test(specifier.split('/').pop())) {
    const base = fileURLToPath(new URL(specifier, context.parentURL))
    for (const ext of ['.ts', '/index.ts', '.d.ts']) if (existsSync(base + ext)) return { url: pathToFileURL(base + ext).href, shortCircuit: true }
  }
  return next(specifier, context)
}
