// MOD-162: a lane's own doneWhen is added after the shared doneWhen. Pure.
import { test, expect, describe } from './kit.mjs'
import { cardsFromFields } from '../../hooks/lib/card.ts'

const ctx = { domains: ['ops'], gateIds: ['check'], names: [], spendByTier: { economy: 2, standard: 6, frontier: 15 } }
const input = {
  title: 'Research the pages',
  why: 'Two lanes share one output layout.',
  doneWhen: ['S1 the layout is followed', 'S2 the rules are kept'],
  redTest: 'none',
  repo: 'none',
  gate: 'check',
  lanes: [
    { title: 'Lane with its own', scope: ['/out/a/**'], doneWhen: ['L1 pages a and b are covered'] },
    { title: 'Lane without', scope: ['/out/b/**'] },
  ],
}
const section = text => text.split('## Done when\n\n')[1].split('\n\n')[0].split('\n').filter(Boolean)

describe('MOD-162: lane done-when adds to the shared one', () => {
  test('a lane with its own reads shared statements first, then its own; a lane without reads the shared ones alone', () => {
    const made = cardsFromFields(input, ctx)
    if ('error' in made) throw new Error(made.error)
    expect(section(made[0].text)).toEqual(['- S1 the layout is followed', '- S2 the rules are kept', '- L1 pages a and b are covered'])
    expect(section(made[1].text)).toEqual(['- S1 the layout is followed', '- S2 the rules are kept'])
  })
})
