// MOD-275: replay the suggestion over a real ledger and print what it would have said, per class. Never fails; skipped when there is no ledger.
//   node --no-warnings --import ./tests/node/register.mjs tests/node/adaptive-replay.mjs [path/to/ledger.jsonl]
import { existsSync, readFileSync } from 'node:fs'

const path = process.argv[2] ?? '.delegation/ledger.jsonl'
if (!existsSync(path)) {
  console.log(`skipped: no ledger at ${path}`)
  process.exit(0)
}
const { suggest, suggestionLine, MIN_CARDS } = await import('../../hooks/lib/adaptive.ts')
const { cardOutcomes } = await import('../../hooks/lib/choice.ts')

const rows = []
for (const line of readFileSync(path, 'utf8').split('\n')) {
  if (line.trim() === '') continue
  try {
    rows.push(JSON.parse(line))
  } catch {
    // a torn line is not a row
  }
}
const cards = cardOutcomes(rows)
const classes = [...new Set(cards.map(c => c.first.class).filter(c => typeof c === 'string'))].sort()
console.log(`ledger ${path}: ${rows.length} rows, ${cards.length} cards with a pair, ${cards.filter(c => c.explored).length} exploratory, ${classes.length} classes`)
if (classes.length === 0) console.log('no card carries a class yet (classes are recorded from MOD-274 on); nothing to suggest')
for (const cls of classes) {
  const mine = cardOutcomes(rows, cls)
  const explored = mine.filter(c => c.explored).length
  const s = suggest(rows, cls)
  console.log(`${cls}: ${mine.length} cards (${explored} exploratory; a pair needs ${MIN_CARDS}) -> ${s ? suggestionLine(s) : 'none'}`)
}
