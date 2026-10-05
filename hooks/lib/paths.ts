// Where a task's worktree goes: one function, so /dispatch and the allowlist
// that admits its `git worktree add` always agree. Pure: no `$`, no imports.
//
//   default         <root>-<id>[-replay]                  (a sibling folder)
//   worktreeRoot    <worktreeRoot>/<repo name>-<id>[-replay]

export function worktreePath(root: string, id: string, replay?: boolean, worktreeRoot?: string): string {
  const r = root.replace(/\/+$/, '')
  const suffix = replay ? '-replay' : ''
  const under = (worktreeRoot ?? '').replace(/\/+$/, '')
  if (!under) return `${r}-${id}${suffix}`
  return `${under}/${r.slice(r.lastIndexOf('/') + 1)}-${id}${suffix}`
}
