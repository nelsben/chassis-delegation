import { test, expect, describe } from 'claude-code/testing'
import { DISPATCH_TOOL, DISPATCH_TOOL_NAME, HERE_NO_REPLAY, parseDispatchArgs, parseDispatchTool, REPLAY_NEEDS_BASE } from '../hooks/lib/dispatch'

describe('the dispatch tool (2A)', () => {
  test('is declared as dispatch, listed as mcp__chassis-delegation__dispatch, with the spec schema and description', () => {
    expect(DISPATCH_TOOL.name).toBe('dispatch')
    expect(DISPATCH_TOOL_NAME).toBe('mcp__chassis-delegation__dispatch')
    expect(DISPATCH_TOOL.description).toBe(
      "Dispatch a chassis task card to a worker: writes the brief from the card, cuts the worktree (or, with here, shares the session's own checkout), picks the tier and spawns. Pass scope/forbid globs when the card's are prose.",
    )
    expect(DISPATCH_TOOL.inputSchema).toEqual({
      type: 'object',
      properties: {
        task: { type: 'string', description: 'The task id, e.g. BE-101' },
        scope: { type: 'string', description: "Comma-separated scope globs (paths, not prose); replaces the card's scope in the brief header. Required when the card's scope is prose: dispatch stops until it is given" },
        forbid: { type: 'string', description: 'Comma-separated forbid globs; replaces the card forbid in the brief header' },
        replay: { type: 'boolean', description: 'Re-run a card already merged on main, read at base (needs a sha base)' },
        base: { type: 'string', description: 'origin/main (default) or a 7-40 hex sha to cut the worktree from' },
        dryRun: { type: 'boolean', description: 'Write the brief and print its header; no worktree, no spawn' },
        here: { type: 'boolean', description: "repo=here: no worktree and no fetch; the worker shares the session's own checkout" },
        forceOverlap: { type: 'boolean', description: "repo=here: dispatch even when the card's scope overlaps an in-flight card's" },
      },
      required: ['task'],
      additionalProperties: false,
    })
  })

  test('its input means exactly what the same command flags mean', () => {
    expect(parseDispatchTool({ task: 'BE-101' })).toEqual(parseDispatchArgs('BE-101'))
    expect(parseDispatchTool({ task: 'BE-101', dryRun: true, replay: true, base: '96014e3b', scope: 'a/**,b.ts', forbid: 'c/**' })).toEqual(
      parseDispatchArgs('BE-101 --dry-run --replay --base 96014e3b --scope a/**,b.ts --forbid c/**'),
    )
    expect(parseDispatchTool({ task: 'OPS-195b', base: 'origin/main' })).toEqual(parseDispatchArgs('OPS-195b --base origin/main'))
    // GH-16
    expect(parseDispatchTool({ task: 'BE-101', here: true, forceOverlap: true })).toEqual(parseDispatchArgs('BE-101 --here --force-overlap'))
    expect(parseDispatchTool({ task: 'BE-101', here: true })).toEqual({ id: 'BE-101', dryRun: false, base: 'origin/main', here: true })
  })

  test('refuses what the command refuses', () => {
    expect(parseDispatchTool({ task: 'nope' })).toEqual({ error: 'refused task id nope' })
    expect(parseDispatchTool({})).toEqual({ error: 'dispatch: task is required (a task id such as BE-101)' })
    expect(parseDispatchTool({ task: 'BE-101', replay: true })).toEqual({ error: REPLAY_NEEDS_BASE })
    expect(parseDispatchTool({ task: 'BE-101', base: 'HEAD~3' })).toEqual({ error: 'refused --base HEAD~3: use origin/main or a 7-40 character hex sha' })
    expect(parseDispatchTool({ task: 'BE-101', scope: 'a"b' })).toEqual({ error: 'refused --scope glob a"b (no quotes or ]] in a glob)' })
    expect(parseDispatchTool({ task: 'BE-101', scope: 'a b/**' })).toEqual({ error: 'refused --scope glob a b/** (no spaces in a glob)' })
    expect(parseDispatchTool({ task: 'BE-101', scope: ' , ' })).toEqual({ error: '--scope needs comma-separated globs' })
    expect(parseDispatchTool({ task: 'BE-101', dryRun: 'yes' })).toEqual({ error: 'dispatch: dryRun must be a boolean' })
    expect(parseDispatchTool({ task: 'BE-101', here: 'yes' })).toEqual({ error: 'dispatch: here must be a boolean' })
    expect(parseDispatchTool({ task: 'BE-101', here: true, replay: true, base: '96014e3b' })).toEqual({ error: HERE_NO_REPLAY })
  })
})
