// MOD-197: which gh commands in a Bash command write to GitHub. Pure.
import { test, expect, describe } from './kit.mjs'

const writes = async cmd => (await import('../../hooks/lib/ghguard.ts')).ghWrites(cmd)

describe('MOD-197: ghWrites', () => {
  test('writes are named', async () => {
    expect(await writes('gh issue close 5')).toEqual(['gh issue close'])
    expect(await writes('cd x && gh pr merge 3 --rebase')).toEqual(['gh pr merge'])
    expect(await writes('gh project item-add 1 --owner o --url u')).toEqual(['gh project item-add'])
    expect(await writes('gh api -X POST repos/o/r/issues')).toEqual(['gh api -X POST'])
    expect(await writes('gh api graphql -f query=\'mutation{...}\'')).toEqual(['gh api graphql'])
    expect(await writes('gh label create x')).toEqual(['gh label create'])
    expect(await writes('GH_TOKEN=x gh issue comment 4 -b hi | cat')).toEqual(['gh issue comment'])
    expect(await writes('gh api --method=PATCH repos/o/r/issues/1')).toEqual(['gh api -X PATCH'])
    expect(await writes('gh release create v1')).toEqual(['gh release create'])
    expect(await writes('gh issue close 1; gh pr ready 2')).toEqual(['gh issue close', 'gh pr ready'])
  })
  test('reads and mentions are not', async () => {
    for (const c of ['gh issue view 5', 'gh pr list', 'gh pr view 3', 'gh api repos/o/r/issues', 'gh api -X GET repos/o/r', 'gh project list', 'gh label list', "echo 'gh issue close 5'", 'cat <<EOF\ngh pr merge\nEOF', 'git commit -m "gh pr merge"', 'ls']) {
      expect(await writes(c), c).toEqual([])
    }
  })
})
