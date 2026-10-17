// The README is a short front door and the reference lives under docs/: its links all resolve. Node only: it reads files.
import { test, expect, describe } from './kit.mjs'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = rel => readFileSync(resolve(root, rel), 'utf8')

// A GitHub-style slug: lowercase; drop all but letters, digits, spaces, hyphens, underscores; spaces to hyphens.
const slug = h => h.trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-')

function slugsOf(text) {
  const seen = new Map()
  const out = new Set()
  let fence = false
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    const m = !fence && /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)
    if (!m) continue
    const base = slug(m[1].replace(/[`*_]/g, c => (c === '_' ? '_' : '')))
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    out.add(n === 0 ? base : `${base}-${n}`)
  }
  return out
}

function linksOf(text) {
  const out = []
  let fence = false
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    if (fence) continue
    const noCode = line.replace(/`[^`]*`/g, '')
    for (const m of noCode.matchAll(/\]\(([^)\s]+)\)/g)) out.push(m[1])
  }
  return out
}

const pages = () => ['README.md', ...(existsSync(resolve(root, 'docs')) ? readdirSync(resolve(root, 'docs')).filter(f => f.endsWith('.md')).sort().map(f => `docs/${f}`) : [])]

describe('the docs', () => {
  test('the README is a short front door', () => {
    const readme = read('README.md')
    expect(readme.split('\n').length <= 80).toBe(true)
    expect(readme.includes('git clone')).toBe(true)
    expect(readme.includes('/delegation setup')).toBe(true)
    expect(/^### From /m.test(readme)).toBe(false)
  })

  test('docs/upgrading.md has the section for this version', async () => {
    const { MOD_VERSION } = await import('../../hooks/lib/version.ts')
    expect(existsSync(resolve(root, 'docs/upgrading.md'))).toBe(true)
    expect(new RegExp(`^### From \\S+ to ${MOD_VERSION.replace(/\./g, '\\.')}\\s*$`, 'm').test(read('docs/upgrading.md'))).toBe(true)
  })

  test('every relative link in the README and docs/*.md resolves, anchor included', () => {
    const bad = []
    for (const page of pages()) {
      for (const link of linksOf(read(page))) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(link)) continue
        const [path, anchor] = link.split('#')
        const target = path === '' ? resolve(root, page) : resolve(root, dirname(page), path)
        if (!existsSync(target)) {
          bad.push(`${page}: ${link} (no such file)`)
          continue
        }
        if (anchor && target.endsWith('.md') && !slugsOf(readFileSync(target, 'utf8')).has(anchor)) bad.push(`${page}: ${link} (no such heading)`)
      }
    }
    expect(bad.join('\n')).toBe('')
  })
})
