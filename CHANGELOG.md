# Changelog

## Unreleased

- **Per-domain lessons reach every brief in the domain (MOD-34).** A file beside the
  cards, `<cardDir>/lessons/<domain>.md`, is appended to each brief for that domain under
  `## Lessons (<domain>)`, after the card, as the file stands and capped at 40 lines (a
  longer file is cut with `(n more lines not carried; prune <path>)` and the dispatch
  warns). A missing file adds nothing. `/delegation lesson <domain> <text>` appends
  `- <YYYY-MM-DD> <text>` (creating the file), refuses a domain not in `domains` naming the
  list, and prints the line count and the cap; `/delegation lesson <domain>` prints the
  file. The card tool's dry run and dispatch print `lessons: n lines from <path>` when a
  file exists. The brief template tells the worker the Lessons section binds like the
  Rules; the init scaffold's card README mentions the folder.

- **`/delegation debrief apply` turns the agent's proposals into actions you approve
  (MOD-33).** `apply` lists the latest debrief's proposals numbered with target, a one-line
  summary and a status (open, done, dismissed); `apply <n>` prints one in full with a single
  instruction for the brain by target (draft an edit and apply it only on your yes; write a
  card; or show it and ask); `apply <n> done [note]` and `apply <n> dismiss [reason]` record
  `proposals_status` in the `.findings.json`. The next debrief's prompt carries
  `already done:` / `dismissed:` lines so settled proposals are not proposed again, and the
  delegation-state section carries `n debrief proposals open — /delegation debrief apply`
  while any are open. The mod writes nothing but its own record.

- **After a clean debrief check the mod tells the debrief agent to mark its watermark, and
  a re-judged refute is one fact (MOD-32).** The check prints after the agent hands back, so
  the agent never saw `debrief check: clean` and left `.done` unmarked. A clean check now
  sends the agent `debrief check: clean. Mark your watermark now, as your instructions say,
  and stop.` (your skill and the built-in template alike); a flagged or stripped check sends
  nothing and says the watermark was left as is. The mod still never writes `.done`. A refute
  that `--verify` re-judged consistent at the same sha is one verdict fact naming both
  verdicts (`a false refute`), not a refute row with an unlinked consistent row after it, and
  both prompts say a false refute is a went_wrong for the verifier or gate, never a went_well.

- **After a debrief the mod asks whether to post its findings (MOD-31).** A new
  `/config` option, `postFindings` (`ask` | `auto` | `off`, default `ask`), declared in
  the manifest and never read from `.chassis-delegation.json`: posting runs `gh` as the
  person, so the setting is theirs. `/delegation` prints `post findings: <mode> →
  <issueRepo>` beside the issues line.
  - **ask.** A debrief that hands back with at least one new mod finding ends with
    `post n findings to <issueRepo>? say yes to post them all, scrubbed, or name some
    (/delegation debrief post 1,3); nothing is posted without a yes`. The delegation-state
    section tells the brain to ask once and never post without an explicit yes; with
    `wakeOnVerdict` on, the question is also the plugin's wake message. Host findings and
    the agent's proposals are never in it.
  - **auto.** Right after the scrub the mod posts each new mod finding through the path
    of `/delegation debrief post all`, at most 5 per debrief (the output says how many
    stay drafts), printing `#n <url>`. A covered finding is skipped, never commented on.
    With the redact list empty it posts nothing, prints the set-redact line and asks.
  - **off.** No question, no posting; the drafts are still written.

## 0.8.1 — 2026-10-11

- **The mod reads its templates once, at load, and says when the folder on disk is newer
  than the code running (MOD-28).** Every brief written after MOD-22 merged (MOD-23 to
  MOD-27) carried about twenty raw `{{#none}}`, `{{#repo}}` and `{{/repo}}` markers.
  MOD-22 added those sections to `hooks/templates/brief.md` and taught `renderSections`
  to drop them, but the session that dispatched those cards was still running the code
  it loaded hours earlier, and dispatch read the template from the folder on disk, which
  the brain had pulled to main. Old code, new template: the workers each guessed which
  sections applied. The same skew hits any session whose folder is pulled without a
  reload (a `CLAUDE_CODE_PLUGIN_DIRS` folder never hot-reloads), and `/delegation update`
  leaves a session in exactly that state until the window reloads.
  - **Templates are read once.** `hooks/templates/brief.md`, `review.md` and `debrief.md`
    (`TEMPLATE_FILES` in `hooks/lib/dispatch.ts`, held equal to the folder by a node test)
    are read the first time the mod gets a `$` (`session.start`; `register` is handed none,
    and a mod reloaded mid-session reads at first use) and kept in memory with the code
    that renders them. Dispatch, the reviewer spawn and the debrief use that copy and
    never read the folder again until a reload. A file that fails to load is named in one
    toast at load, and the feature that needs it says so when used (`/dispatch` says the
    brief template could not be read; a review is skipped with `next=accept` and the
    reason; `/delegation debrief` says `debrief not started` and claims no watermark). A
    `briefTemplate` the repo file names is the repo's own file, not the mod's, and is still
    read at each dispatch.
  - **The built-in debrief carries its instructions.** The debrief agent's prompt now holds
    the loaded `debrief.md` between two rules, in place of the line telling it to read
    that file in the folder. A `~/.claude/commands/debrief.md` skill still wins, as before.
  - **A brief with a marker left in it is refused.** After a brief is rendered, the
    template's own text is scanned for any `{{` that no value fills (`leftoverMarker`,
    `renderBriefChecked`). One that survives refuses the dispatch, naming the marker and the
    template, before the brief is written, so no worktree is made and no worker reads it.
    The scan is of the template, not of the card: a card body that quotes `{{#none}}` is
    the card's text and passes. `renderBrief` renders exactly as before.
  - **`/delegation` says when the folder is newer than the code.** It reads
    `hooks/lib/version.ts` on disk (as text, never imported) and, when it names a version
    other than the running `MOD_VERSION`, prints `code: running <old>, folder holds <new> —
    reload the window to run it` under the `mod:` line; for a folder under
    `~/.claude/dev-mods` it says the folder reloads when the turn ends. `/delegation update`
    prints the same line after a merge that moved the version (and when an earlier pull
    left the folder ahead), and then ends with the reload story rather than "nothing to
    reload". A folder with no readable `version.ts` prints no line. README's Upgrading
    says why a reload matters and what the line means.
  - `folderVersion`, `codeSkewLine`, `inDevMods` (`hooks/lib/update.ts`);
    `unrenderedRefusal`, `templatePath` (`hooks/lib/dispatch.ts`); `builtInDebriefPrompt`
    takes the loaded text as its last argument (`hooks/lib/cleanstop.ts`). No config key,
    no new tool.

- **The dry run warns when a forbid glob collides with the card, and the card tool says that `*` crosses folders (MOD-29).**
  Public issue #63: a card forbade `artifacts/*.html` to keep the worker off the existing
  pages while its done-when required `artifacts/kit/index.html`; the forbid matched the
  required file, attempt 1 was refuted on scope, and the work was merged by hand. The
  card tool's dry run and `/dispatch` now print one warning per collision,
  `warning: forbid <glob> matches scope <entry>` or `warning: forbid <glob> matches <path>
  named in done-when`, and still write the card. Each collision uses the verifier's rule
  for its entry: a repo glob's `*` crosses folders, an absolute glob's `*` stays in one
  folder. The scope and forbid tool descriptions say that a repo path has no one-folder
  wildcard, so list the files.

- **`files=` takes a folder glob, and the red claim quotes the line that failed (MOD-27).**
  Public issue #56. A hand-back that listed a new folder as `docs/new/**` in `files=` was
  refuted on files, though the six paths under it were exactly the delta: `filesClaim`
  expanded only an entry ending in `/`. `dir/**` now stands for every delta path under
  `dir/`, and `dir/*` for the ones exactly one level under it, as `dir/` does for the
  whole tree. A glob that covers no delta path still reads as invented. The existing
  literal and trailing-slash behaviour is unchanged.
  - **The red claim skips a passing line.** A held red claim quoted the first marker
    match, so a passing test whose name holds `Error` (`…NeverAnException Pass`) was
    quoted as the failure while the real one (`Fail  System.AssertException: …`) sat two
    lines below. A line whose outcome reads as passing (a whole-word `pass`, `passed`,
    `ok`, or a ✓/✔ mark) is skipped; a line with a failing word (`Fail`, `failed`,
    `not ok`, ✗, ✕) is preferred over an earlier marker line; with neither, the first
    marker match is quoted as before. The claim holds or fails exactly as it did; only
    the quoted line changes.

- **A breadcrumbs debrief's prompt carries only the facts inside its window, each
  dated, and a window of session boundaries alone spawns nothing (MOD-26).** Public
  issue #55: `/delegation debrief` on a two-line window (a `session_end` and a
  `session_start`, no friction) handed the agent three facts from hours earlier, so
  the MOD-10 check rightly flagged the debrief, the record never moved, and the next
  debrief read the same stale facts and could never come back clean; a false refute
  from earlier was once filed as a went_well finding. Friction events were sliced by
  the count of new breadcrumb lines (two separate streams), verdicts were kept by the
  previous debrief's time, and the fact lines dropped the time both carry.
  - **The window chooses the facts.** In breadcrumbs mode the prompt holds the
    friction events and recent verdicts whose time lies between the window's first and
    last breadcrumb timestamps, inclusive. The line-count slice and the previous-time
    filter are gone from that path; without a breadcrumb file the selection is as it
    was. New pure `windowFacts` (`hooks/lib/cleanstop.ts`).
  - **Every fact line is dated.** `denial 2026-10-10T16:27:14Z: …`, `correction …`,
    `refuted …` and `verdict 2026-10-10T18:01:07Z: …` (a denial used to read `tool
    denied:`), in both modes, and both prompts tell the agent to cite that time as
    `at`. A time with milliseconds keeps them, so the agent cites it exactly.
  - **A boundary-only window spawns nothing.** When the window's lines are only
    `session_start`, `session_end` and compaction breadcrumbs and no fact falls inside
    it, `/delegation debrief` prints `nothing to debrief in lines a-b (session
    boundaries only)`, the automatic path logs the same, and the debrief record moves
    past the window (`skippedTo`; the mod still never writes the `.done` mark), so the
    next debrief starts after it. New pure `boundaryOnly` and `nothingToDebrief`.

## 0.8.0 — 2026-10-11

- **A repo=here card that shares a resource with an in-flight card is queued, not
  refused (MOD-24).** Public issue #33 (one worker per app, enforced by the queue).
  MOD-23 made a shared resource part of the repo=here overlap check, which refuses at
  dispatch unless `--force-overlap` is given; the brain then had to retry by hand
  for something the mod can sequence. The two are different things. Overlapping
  scopes would corrupt each other's dirty-tree delta, so a scope overlap still
  refuses, exactly as before, and still needs `--force-overlap`. A shared resource
  only needs sequencing, so a repo=here dispatch whose only overlap with an in-flight
  repo=here card is a resource now goes on and is queued with the MOD-23 waiting line
  (`queued: OPS-9 — waiting for resource blender-live (held by OPS-8)`), ready when
  the holder hands back. A scope refusal no longer also lists the resource.
  - **The band's queued item names the resource.** A queued `BandItem` gains
    `waits: { resource, holder }`, set for a row held up by a resource, and the
    pane's open item reads `OPS-9: queued (position 1) — waits for blender-live (held
    by OPS-8)` in place of `starts when a worker slot frees`; a row waiting for a
    slot reads as before. README's repo=here overlap paragraph and the resource
    paragraph say which one queues and which one refuses.
  - `resourceOverlapRefusal`, `resourceOverlapWarning` (`hooks/lib/dispatch.ts`) and
    `sharedResource` (`hooks/lib/brief.ts`) are no longer called by the dispatch.

- **Exclusive resources and fan-out (MOD-23).** Public issues #33 (ask B) and #32
  (ask 3). Two research lanes could not run at once because there was one live
  Blender with one open file; the brain wrote that into every brief and hoped it
  was followed. And research fans out: two or three workers, each owning an output
  folder, all wanting the same shared notes file, which the brain coordinated by
  hand. The queue now understands a resource name, and the card tool writes N
  lanes from one sentence. See "Exclusive resources and fan-out" in the README.
  - **A card may carry `resources: [blender-live]`.** Free-form words (letters,
    digits, `.` `_` `:` `-`). The brief header carries `resources=blender-live`
    after `outdir=`/`scratch=` and before `spend=`; a card with none writes the
    header it always did. `resources` is a recognised header field, so the value
    before it keeps its end.
  - **The queue enforces it.** A dispatch, or the brain's own Agent call, for a card
    whose resource is held by a running (or starting) worker is queued, whether or
    not a slot is free: `queued: OPS-9 — waiting for resource blender-live (held by
    OPS-8)`. The dispatch prints no spawn block, the hook starts nothing, and a
    second ask keeps its place. The hand-back that frees the resource carries the
    `ready:` line for it, in the same wake as the verdict row. Of several queued
    cards that name one resource only the first is ready; a row waiting for a
    resource takes no slot, and a card with no resources is never held up. A worker
    that has handed back holds nothing, even while its verdict is out. New pure
    `planQueue`, `resourceBlock`, `resourceDeny` and `waitsText` in
    `hooks/lib/scheduler.ts`; `resourcesOf` and `sharedResource` in
    `hooks/lib/brief.ts`.
  - **The `card` tool takes `lanes: [{ title, scope, doneWhen? }]` and `resources`.**
    It writes one card per lane, all or none: sequential ids (N, N+1, …), the shared
    why, gate, tier, repo, budget, resources and forbid, and each lane its own scope
    (so its own output folder) and `doneWhen` (the shared one when a lane has none).
    Lanes whose scopes overlap are refused, naming both; a shared `scope` beside
    lanes is refused; the tool's `scope` is no longer in `required` (a single card
    without one is still refused). The dry run prints every lane's summary and
    header and says go for all of them; `dispatch: true` dispatches each lane in
    order under `--- <ID> ---`. New pure `cardsFromFields` in `hooks/lib/card.ts`;
    `cardFromFields` still renders one card.
  - **The repo=here overlap check treats a shared resource as overlap.** A card
    whose `resources` name one an in-flight repo=here card's brief names is refused
    like an overlapping scope (naming the resource and the card), and
    `--force-overlap` lets it through with a warning; the queue then holds it.
  - **The delegation-state posture line also covers a pending review spawn
    block** (MOD-21): an owed `T-4: review` row now carries the posture line, like a
    ready row or a respawn block, so the brain makes the reviewer's Agent call
    without asking. A row waiting on a resource is named with what it waits for
    (`- queued: T-9 (position 1) — waiting for resource blender-live (held by T-1)`)
    and calls for nothing.
  - **The dashboard shows the resource.** The worktree table (pane) and its text
    fallback gain a resource column while any worker holds one or any queued row
    waits for one (`blender-live`, `waits blender-live`); without one the table is
    unchanged.

- **Research cards (MOD-22).** Public issues #32 and #33 (two adopter repos,
  2026-10-09/10): research and extraction lanes write their outputs outside the
  repo (an exported model, renders, a sound file, notes), often need the live
  checkout and its running apps, and have no test to turn green and nothing to
  commit. They ran as ad hoc Agent spawns, and claims nobody could check passed:
  a report said a glTF validator passed when none was installed, and a hair lane
  claimed byte-identical output nobody ran and left scratch files inside the
  repo. A card with an output folder, artefact assertions and a gate run against
  that folder refutes both. See "Research cards" in the README.
  - **The card tool takes `repo`** (`worktree`, the default; `here`; `none`) and
    writes `repo: here|none` on the card; `/dispatch` reads it from the card as it
    reads `--here`. A `repo: none` card dispatches with no worktree, no fetch and
    no git (`3. no worktree (repo=none): …`). The tool's description gains the
    clause: research or extraction with outputs outside the repo: repo none or
    here, scope = the output folder. An explicit `repo` beats the old rule that a
    repo with no `origin/main` writes `repo: here`.
  - **`scope` and `forbid` take absolute paths and globs** (a leading `~` is the
    home folder, expanded at dispatch). The first absolute scope entry is the
    card's `outdir` unless the card names `outdir:`; the header gains
    `outdir=<abs>` and `scratch=<abs>` (default `<system temp>/chassis-delegation/<ID>`,
    or the card's `scratch:`) after `repo=` and before `spend=`, and the brief
    template tells the worker to put deliverables in the output folder and helper
    files in scratch, never in the repo. A plain worktree card's header does not
    change. The template gains `{{#none}}`, `{{#repo}}`, `{{#outdir}}`,
    `{{#scratch}}` and `{{reportExtra}}`; `renderSections` takes a mode
    (`'worktree' | 'here' | 'none'`) as well as the boolean it always took.
  - **The outside delta.** At `/dispatch` the mod lists (relative path, size,
    mtime) every absolute scope and forbid root and stores it as
    `delegation.outside.<ID>`; at hand-back it lists them again. The scope claim
    covers both deltas: every git path against the repo entries and every changed
    outside path (added, removed, changed) inside an absolute scope entry and outside
    every absolute forbid entry. A refute names the delta
    (`out-of-scope path: /out/notes/scratch.txt (outside delta)`, or `(repo delta)`
    on a card with outside roots). A root that cannot be listed leaves the claim
    unchecked, never held; a root that is not there yet lists as empty. A reused
    brief keeps its first listing, so the delta is cumulative across attempts. New
    pure `outsideClaim`, `outsideCheck`, `outsideRoots`, `outdirOf` and
    `expandTilde` in `hooks/lib/norepo.ts`.
  - **`{outdir}` in a gate-map command**, filled with the brief's `outdir=` at
    verify time. The allowlist accepts the command word for word with only
    `{outdir}`, `{worktree}` and `{files}` filled by absolute paths; a command that
    names `{outdir}` when the brief has none is "gate not re-run".
  - **The report gains `artefacts=` and `metrics="k=v,…"`.** The `artefacts` claim
    holds when each named path (relative to `outdir=`, or absolute) exists and is
    not empty, fails naming the first that is missing or empty, and is absent when
    the report names none. Metrics are recorded on the attempt (`metrics`) and shown
    as `metrics: tris=1200, len_s=2.4` in the verdict detail, and never judged.
  - **`repo=none` and `repo=here` cards go through the same new claims** (the outside
    delta, artefacts, metrics, `{outdir}`); a `none` verdict keeps its
    `(no repo)` check and adds them.

- **An optional reviewer stage: after a consistent verdict, a fresh read-only
  reviewer labels each claim of the hand-back confirmed, refuted or
  unverifiable before `next=accept` (MOD-21; public issue #1, second half).**
  `consistent` (MOD-19) says the report matches git; nothing reads the diff.
  Two adopters added their own second layer, a reviewer that checks the
  hand-back's claims against the diff and never fixes anything, and it changed
  the outcome on about one hand-back in three. The brain now makes every spawn
  (0.7.0), so the reviewer is one more Agent call the mod prints, and its tool
  calls run under the mod's hooks, so the mod keeps it read-only.
  - **A new option, `review`** (`off` | `on` | `on-frontier`; repo file and
    `/config`; default `off`). `on` reviews every consistent verdict;
    `on-frontier` only an attempt at the frontier or premium tier; `off`
    changes nothing anywhere: no row, record, ledger line or `/delegation`
    line differs. `reviewTier` (repo file and `/config`) pins the reviewer's
    tier; unset, it is one tier below the worker's (economy is the floor). Both
    are declared in the manifest.
  - **`next=review`.** With review on, a consistent verdict (not a refuted,
    unverified, `gate=fail`, no-report, `repo=none` or `--replay` one) says
    `next=review` where it said `next=accept`, and ends with a spawn block for
    the reviewer: `subagent_type` general-purpose, the model one tier below the
    worker's (a standard worker gets a haiku, a frontier worker a sonnet),
    description `<ID> review <tier> <alias>`, and a prompt built from the new
    `hooks/templates/review.md`: read the brief, the report and the diff at the
    sha; one row per factual claim of the hand-back, `confirmed`, `refuted` or
    `unverifiable`, each with the command or `file:line` that decides it; edit
    nothing; end with `[[review v=1 task=<ID> confirmed=N refuted=N
    unverifiable=N]]`. The owed list names the review until it is made.
    `/dispatch <ID> --verify <sha>` is reviewed the same way. A template the
    mod cannot read gives `next=accept` and a `note: review not run` line.
  - **The reviewer is an attempt of kind `review`.** The prompt opens with a
    marker line (`[[review-of v=1 task=… attempt=… worker=… sha=…]]`), which the
    `agent.spawn` hook reads before it looks for the brief the prompt names. The
    hook records the attempt (`source: review`, in the task's records), runs the
    reviewer in the worker's worktree, and keeps it off the ladder: it never
    counts against `budget=`, takes no worker slot, is not numbered among the
    worker's attempts, steps at the engine's default effort, gets no attempt
    identity in its Bash environment, and is left out of the dashboard's worker
    counts. While it runs its task shows as `pending verdict`.
  - **It never edits.** While it runs, the `tool.call` hook refuses its Edit,
    Write, MultiEdit and NotebookEdit calls and any Bash command the
    `delegateOnly` lexer counts as a write, against its worktree and against the
    session root, with one line: `a reviewer never edits (T-4 review): Write
    refused. …`.
  - **At its hand-back** the mod reads the last well-formed `[[review]]` block.
    `refuted=0` is `next=accept` with `review: 3 confirmed, 1 unverifiable`.
    `refuted>0` is `next=resume agent=<the worker>` with the refuted rows quoted
    under the row and as the resume message (`autoEscalate` sends it; otherwise
    the brain does, and that message is the worker's next attempt, spent from
    `budget=`; with the budget spent the advice is `check by hand`). A missing or
    malformed block is `next=accept` with `review: no review block`: the review
    never blocks on its own failure. The reviewer's attempt keeps the counts
    (`review`, verdict `reviewed`), the row says `reviewed · haiku · $0.05`, and
    the ledger line carries `kind: review` and the counts.
  - The README has a Review section (what it checks, what it never does, the
    option, the reviewer's tier, cost) and the verdict table gains `next=review`.

- **Gates that run in parallel do not false-refute (MOD-20).** On 2026-10-11 two
  workers ran their gates on one machine at once (load average about 40): one
  engine run had six timeouts and passed on a rerun with no change, and another
  worker was refuted on gate because the verifier's engine run timed out on two
  tests it never touched. The engine suite gives each test 5 seconds, so any
  wave of two workers carried the risk. Three changes:
  - **A gate red only on timeouts in untouched tests is run once more.** When
    the gate's failing tests all failed with nothing but the engine's
    `timed out after N ms` and none of them sits in a test file the delta
    changed, the verifier runs that gate again. The claim then reads
    `gate green on rerun (first run: 2 timeouts in untouched tests)`; a second
    red is refuted as before, with a `note:` that it was run twice. A failure
    that is not a timeout, a timeout in a touched test file, and output the mod
    cannot read as failing tests are never run again. New `gateFailures` and
    `timeoutRerun` in `hooks/lib/verify-native.ts` parse the `(fail)` lines of
    `claude plugin test` and decide.
  - **Engine gates take turns.** A gate-map command that runs
    `claude plugin test` takes `delegation.engineGate` in the store before it
    runs and clears it after; a verifier that finds another's live lock waits
    for it (looking again every 5 seconds), and the wait is one verdict detail
    line, `waited 40 s for MOD-x's engine gate`. The lock expires after the
    gate's own timeout (9 minutes), so a crashed holder never wedges the rest;
    a store that cannot be read runs the gate without a turn. The read, check
    and write of the lock are one step inside the process (the store has no
    compare-and-set), so two verifiers finishing together do not both take it.
    The rerun stays inside the turn. A `repo=none` brief's engine gate takes its
    turn too. The settings.json fallback reruns but takes no turns.
  - **The `delegateOnly` lexer reads substitutions inside double quotes.** The
    brain's own merge command was refused because a comment string inside
    `$( … )` carried `<task>-a<attempt>`, and the lexer read the `>` as a
    redirect to a file in the repo. A `$( )` or backtick substitution inside
    double quotes is now a command of its own with its own quotes, so
    `gh issue close 2 --comment "$(printf "id <task>-a<n>")"` counts no write.
    A real redirect inside one still counts, quoted or not
    (`echo "$(echo x > hooks/a.ts)"` writes `hooks/a.ts`; before this it was
    missed when quoted).
  New `tests/gaterun.test.ts` (the parser, the rerun decision, the turn and the
  verifier with the gate answered from a table), the lexer cases in
  `tests/brain.test.ts` and engine tests in `tests/hooks.test.ts`, including two
  verifiers whose engine gates must not overlap. `tests/harness.ts` lets a
  `run` answer return a promise.

- **The debrief shows the agent's own process proposals, mod findings post to
  the mod's tracker from any repo, and a post refuses while the redact list is
  empty (MOD-18).** Does `/delegation debrief` cover the agent's process
  improvements, improvements to the mod, and posting to the public repo? It half
  did: the agent's proposals sat in a file nobody opened, and a finding could be
  filed only where the repo file set `issueRepo`.
  - When a debrief hands back, after the findings lines, the mod prints the
    agent's own proposals from the debrief JSON: `proposals: n for you to
    review (never posted)`, one `target · proposed_diff_summary` line per
    `proposed_harness_changes` entry (cut to one line), and a count of
    `harness_gaps` and `stale_memory`. None prints nothing.
    `/delegation debrief post` shows the same block under the findings. The
    proposals stay in the debrief file; they are never written to the
    `.findings.json` and never posted.
  - `issueRepo` defaults to the mod's own repository, read from the `repository`
    (else `homepage`) field of `.claude-plugin/plugin.json`, which now carries
    `repository`. A repo file that leaves the key out gets it, so a finding can
    be posted from any repo the mod runs in (the first adopter's repo set none,
    so nothing could be filed there). An explicit `"issueRepo": ""` in the repo
    file still turns posting off. `/delegation` prints `issues: <owner/name>
    (the mod's own tracker)` for the default. `init` and `setup` no longer
    write `"issueRepo": ""` into a new repo file, which would now switch posting
    off; they leave the key out and say so in a `_issueRepo` note. A repo file
    written by an earlier init that already carries `"issueRepo": ""` keeps
    posting off until you remove the line.
  - `/delegation debrief post <n|all>` refuses to file anything while the
    `redact` option in `/config` is empty, saying: set redact in /config to the
    product, customer, employer and repo names this session must never publish,
    then post again. The automatic scrub knows only the repo's folder name,
    origin and git identity, so a product name that differs from the folder name
    would otherwise reach a public issue. The read-only `post` still shows the
    drafts, headed by the same warning.
  - The README's debrief section names what each list is for (`mod_findings`:
    the tracker after your go; `host_findings`: never; the agent's proposals:
    you, never posted), the default `issueRepo` and the empty-redact refusal.

- **The verdict says what it checked: `verified` becomes `consistent`
  (MOD-19; public issue #1).** Two adopters reported it independently: when
  every claim held, the row said `verified` and `next=accept`, which reads as
  review, yet nothing reads the diff, and a worker that cleanly builds the wrong
  thing got the same row. The word is now `consistent`: the report is consistent
  with git. It means every machine-checkable claim of the report matches git
  (branch, sha, files, scope, gate, red evidence); it is not a review, and the
  brain still reads the diff. The README says so in a verdict table and one
  plain paragraph. What changed in what the mod writes:
  - the verdict row (`attempt 1/2 consistent · sonnet · $0.19 · next=accept`),
    the long line (`verdict=consistent`), the `(no repo)` form and the
    `consistent (report gate=fail)` form;
  - attempt records and ledger lines, the dashboard (the tile reads
    `consistent 1st try`, spend by model `4 consistent`, the Verdicts block and
    its text fallback), the compaction and prompt state sections, the debrief
    prompts and the template's classification rubric, and the settings-hook
    fallback's row (`bin/chassis-hook.mjs`);
  - the TypeScript verdict types gain `consistent`; `verified` stays only as a
    legacy input, in `hooks/lib/legacy.ts`.

  **Deprecated: `verified` is read until 0.9.0.** The row text is a contract
  adopters parse, so the old word stays readable for one minor version. An
  attempt record, a recent-verdict row or a metrics count saying `verified` is
  read exactly as `consistent`: escalation, owed rows and their retire check,
  accept, the spend and success counts, the dashboard (a pre-rename verdict
  line is shown with the new word). A ledger line already written keeps its word
  and is never rewritten. A script that parses the row, `verdict=` or
  `.delegation/ledger.jsonl` should accept both words until 0.9.0, when
  `hooks/lib/legacy.ts` goes. An honestly declared `gate=fail` is still never
  accepted. New `tests/consistent.test.ts` holds the new word and the legacy
  reads; `tests/node/consistent.node.mjs` fails on any `verified` in `hooks/` or
  `bin/` outside the legacy reader; `tests/hooks.test.ts` proves a store and a
  ledger written before the rename still retire an owed row and count as a
  success. The optional reviewer stage is the next card, written against the new
  word.

- **A settings.json fallback for hosts that do not load the mod (MOD-17, #2).**
  The mod is a function-hook plugin: where the engine's rollout switch serves
  off, or a host cannot load a hooks module, none of it runs. New
  `bin/chassis-hook.mjs` carries the two parts that are pure functions through
  ordinary `settings.json` command hooks, under any node that strips types by
  itself (22.18 or newer; nothing installed or fetched):
  - `post-agent` (PostToolUse on Agent) takes the last `[[report …]]` of the
    result, finds the brief (the path the prompt names, or an inline
    `[[brief …]]` header) and the worker's tree, runs the native verifier there
    and prints the verdict row as the hook's additional context. No report
    prints nothing. The row reads `via=settings-hook` where the engine's has an
    attempt count: nothing is recorded, a `repo=here` or `repo=none` brief is
    said to be engine-only, and the hand-back's `[[amend …]]` blocks are not
    applied.
  - `pre-bash` (PreToolUse on Bash) runs the git guard over the command,
    against the repo it runs in, and prints a deny with the guard's own reason.
  Every command the wrapper runs (read-only git, the repo's gate) passes
  `hooks/lib/allow.ts` with the repo file's gate map first; it never pushes,
  installs or fetches. The README gains "Without the engine: two settings.json
  hooks" with the two entries to paste and a plain list of what exists only
  with the engine; `tests/selfcheck.sh` prints the entries when it finds the
  rollout switch off. New `tests/node/bin.node.mjs` pipes hook input into the
  wrapper against real repositories under `tests/.tmp/`.

- **Each worker gets its own identity in its Bash environment (MOD-16; public
  issue #24).** Workers inherited the brain's session id, and a vendored lock
  script keys a hold on role plus session id, so two sibling workers on one
  shared environment could release each other's live hold. Since 0.7.0 the mod
  sees every worker's Bash calls, so its `tool.call` hook now runs a recorded
  worker's command behind `export CHASSIS_SESSION_ID=<task>-a<attempt>
  CHASSIS_TASK=<task> CHASSIS_ATTEMPT=<n>; ` (values shell-quoted; a subtask
  other than `main` reads `BE-101.ui-a1`). The brain's own Bash, ad hoc agents
  with no attempt record, the debrief and eval runners, and a command that
  already sets `CHASSIS_SESSION_ID` are never rewritten. The git guard,
  `delegateOnly` and the spend check judge the command as typed (the rewrite hook
  is registered after them), so no refusal text or decision changes. The
  identity is a pure function in the new `hooks/lib/identity.ts`; the brief
  template gains one line telling the worker its identity and that it is already
  set in every Bash call. No new option. The README's new "A worker's identity"
  says what is set, for whom, and why; a `briefExtra` line asking workers to
  prefix lock calls by hand is no longer needed.

- **Work keeps moving without the person (MOD-15).** Since 0.7.0 dispatch prints
  an Agent call the brain makes, so the queue and the respawn ladder are advice,
  and a verdict row reached the brain only inside the person's next message.
  Three changes close the gap:
  - **A verdict wakes the brain.** After the mod posts the row for a background
    worker's hand-back it calls `$.prompt.submit` once with that row and its next
    action (`next=accept`, a resume, the `ready:` line the hand-back freed, or the
    respawn spawn block), never `asUser`: the model reads "The chassis-delegation
    plugin sent a message" and acts, once the session is idle (the engine queues it
    while the person is mid-prompt). One submit per verdict; none for a verdict the
    brain produced itself with `--verify` in its own turn, none for a foreground
    worker's (it rides the Agent result); an over-spend verdict wakes it too. The
    new boolean `wakeOnVerdict` (default `true`) turns it off; the row is posted
    all the same. The mod's own submit is not counted as a correction.
  - **The brain is told to act.** While any row is `ready:` or a respawn block is
    pending, the "Delegation state" section carries one posture line: make a ready
    row's spawn call or a respawn block's Agent call without asking the person; ask
    only when a verdict is refuted on a claim the brain cannot amend, a worker is
    over-spend, or an amend needs approval.
  - **A ready worktree row left unclaimed is started.** New option
    `readyFallbackMinutes` (default 10; `0` is off): a `ready:` row the brain has
    not spawned after that long is started through `spawnSelf`, as every queued row
    was before MOD-12, with the same tier, budget and slot decision, and recorded
    with `source: fallback`. The row the mod posts says the worker ran outside the
    mod's hooks (no git guard, no effort setting, cost known only at the end). Only
    a worktree brief is started this way: a `repo=here` worker shares the person's
    checkout and `repo=none` has no worktree, so those always wait for the brain,
    and past the timeout their ready line says how long they have waited. A row the
    brain spawns first, or one still behind a full house, is left alone. The node
    test that pins `spawnSelf`'s callers now names the fallback (`selfSpawnReady`)
    as the third, and still fails on any other.
  The README's Spawn contract and Known issues are brought in line, with a
  "Waking the brain" paragraph and the two options; the manifest declares both.

## 0.7.0 — 2026-10-11

- **Workers under the mod's hooks (MOD-13).** Now that the brain makes every
  spawn, the mod uses what it sees. The git guard names a worker's task in its
  refusal (`no push on main (T-7); ...`), for a `repo=here` worker as for the
  brain; a worktree worker on its own branch is untouched. The spend ceiling
  posts one row at `spend=` (task and dollars, once) and, at twice it, denies
  the worker's next tool call (`T-6 is over twice its $2 ceiling; hand back now
  with what you have`; `SubagentHandback` passes) beside the `over-spend`
  verdict; the recorded `usd` still comes from the end-of-run accounting.
  `turn.step` on a worker is rewritten to an effort by tier, from the new key
  `effortByTier` (economy `low`, standard `medium`, frontier `high`; `0` or
  empty leaves the engine's; a card's `effort:` wins), recorded on the attempt
  and printed by `/delegation`. The brain's steps, `delegateOnly` and the brain
  spend ignore agent-context calls as before. The text MOD-12 left is brought in
  line: the `autoEscalate` and `maxWorkers` descriptions, the `_agentTypes` and
  `_maxWorkers` scaffold notes, the `QueuedSpawn.model` doc, and the respawn
  advice (`make the spawn block below (it names the model)`).

- **The brain spawns, the mod shapes (MOD-12; public issue #22, option 1).**
  The engine steps a plugin's own hooks past any subagent that plugin starts
  with `$.agent.spawn`, and every worker used to start that way, so a dispatched
  worker ran with no git guard (a repo=here worker on `main` could commit), no
  mid-run spend and no hand-back capture from its tool calls. Of the options #22
  laid out, this takes option 1: the mod prepares everything and the brain makes
  the spawn with its own Agent tool. `/dispatch` and the dispatch tool still
  write the brief, cut the worktree and pick the tier, then spawn nothing: the
  result ends with a spawn block, `spawn: Agent` and a fenced JSON object
  (`subagent_type`, `model` = the tier's alias, `description` = `<id> <tier>
  <alias>`, `prompt` = the brief handoff) the brain passes verbatim, and one line
  saying the worker starts when it makes that call. `--dry-run` and `--verify`
  are unchanged. The `agent.spawn` hook shapes the brain's call as it shaped
  every spawn: it keeps the call's model when it is the tier's alias, runs the
  worker in the folder `/dispatch` prepared (new store key
  `delegation.handoff.<brief>`; the Agent tool takes no folder), claims the slot
  and records the attempt (`kind: spawn`, `source: brief`); the hand-back,
  verdict, ladder and ledger are what a mod-spawned worker produced. A second
  spawn of a brief whose attempt still runs is refused naming it (`… not
  spawned — already running as attempt 1 (agent agent-7); wait for its
  hand-back`), by the hook and the dispatch result alike, as are a spawn past
  the budget, one with work present, and one with every slot taken. The queue
  and the ladder are advice: a full house answers `queued: <id> — the mod will
  tell you when a slot frees (…)`; the hand-back that frees a slot carries
  `ready: <id> — run its spawn block (/dispatch <id> prints it again)`, as does
  the "Delegation state" section while it holds; a respawn verdict prints the
  next spawn block (one tier up after a refute) instead of spawning, with
  `autoEscalate` too, which now performs resumes only. Nothing in the mod calls
  `$.agent.spawn` for a worker (a node test reads `hooks/register.ts`:
  `spawnSelf` serves only the debrief and eval runners, which need no hooks).
  The evidence for #22, in `tests/hooks.test.ts`: "#22 evidence: a repo=here
  worker the brain spawned is seen by the mod" (the git guard denies its `git
  commit` on `main`, and its turn usage lands on the attempt mid-run) and "#22
  evidence: a worker the mod spawns itself (the old path, kept here in a
  helper) is stepped past by the mod's hooks". The harness now records who
  raised each spawn (`spawnedBy`, from the kit's `next.origin`). The setup
  handover, the card folder's README template and the brief template say who
  starts the worker. Using the worker's steps mid-run (the spend ceiling, effort)
  is the next card.

## 0.6.1 — 2026-10-10

- **A breadcrumbs-mode debrief is bounded to its window and validated at
  hand-back (MOD-10).** Both prompts carry the window (breadcrumb lines
  `(watermark, end]`, first and last timestamps), say to read only entries inside
  it and never to summarise from tool error text, and ask each correction, denial
  and outcome for an `at`. At hand-back the new `hooks/lib/debriefcheck.ts` strips
  an entry whose `at` is outside the window, counts one with none, flags a list the
  window's breadcrumbs cannot contain, and the printed result says so. The debrief
  record moves only on a clean check (otherwise the previous record stands).
  `mod_findings.surface` is an enum of the mod's twelve surfaces; a finding on
  another surface, or about the permission classifier, a host safety check, the
  engine or the person's own hooks, goes to `host_findings`, which
  `/delegation debrief post` never lists or files (it says how many it set aside).
  Fixes the debrief in public issue #50.

- **`delegateOnly` follows `cd` and `git -C`, judges `git commit` by the repo and
  the paths it commits, and reads BSD `sed -i ''` right (MOD-9).** `cd <worktree>
  && rm -rf .claude-plugin/types && cp -R …` was refused as a source edit because
  the relative target was read against the repo root; it now resolves against the
  folder the `cd` left, and an unresolvable `cd` makes later relative writes
  unknown and uncounted. A `cd` inside `( )` is undone at the closing
  parenthesis. A commit in a repo outside the root is never an edit; in the root
  the staged paths are read with `git diff --cached --name-only` and judged like
  written paths, so a commit of only card, `docs/`, `.delegation/`, repo-file or
  CHANGELOG files runs. `sed -i '' …` and `sed -i .bak …` no longer take the
  suffix or the script as a file.

- **`delegateOnly` resolves `~`, `$HOME`, `$PWD` and earlier variables before it
  decides a Bash write is in the repo (MOD-8).** `M=~/.claude/m; cat >> $M/p.md`
  was read as a file named `$M` under the root and denied; it is now a write
  outside the repo and runs. An unresolvable target is unknown and not counted.
  `bashWrites` takes the home folder as a third argument.

- **`/delegation debrief post` shows the findings, then posts the named ones
  (MOD-7).** New repo-file key `issueRepo` (`owner/name`; empty = off, and
  `/delegation` prints `issues: <repo>` when set). `post` alone prints the latest
  `.findings.json` as it would be posted, scrubbed again, each `new` or `covered
  by #k` against the repo's issues; `post 1,3` or `post all` runs one `gh issue
  create` per new finding and records the number (a covered one is skipped, or
  added as a comment when named); a body in which a `redact` word survives is
  refused. The allowlist gains `gh issue create`, `gh issue comment` and the
  read-only `gh issue list`, each only for the configured `issueRepo` and a body
  file under `<root>/.delegation/debriefs/`; edit, close, delete and `gh pr create`
  stay refused. Pure logic in the new `hooks/lib/findings.ts`.

- **`/delegation debrief` runs the debrief now, and every debrief ends with
  scrubbed findings about the mod (MOD-6).** The command starts the background
  debrief at once (no idle, cooldown or minimum-friction test; one at a time;
  it runs while a worker runs and says so) and prints the agent id, the mode and
  the folder. Both debrief prompts ask for a `mod_findings` key (went_well /
  went_wrong, surface, fault_class, severity, title, body, evidence); at
  hand-back the mod scrubs every string with `redact` (new `hooks/lib/redact.ts`:
  home paths, the repo and its origin, the git user, and the new `redact`
  `/config` list, which is never read from the public repo file) and writes
  `<name>.findings.json` beside the debrief, printing one line per finding.

## 0.6.0 — 2026-10-10

- **Owed rows retire by themselves, `/delegation accept <id>` closes one, and
  the state block counts the old ones (MOD-4, public issue #23).** An owed row
  leaves the compaction block, the prompt section and `/delegation` when its
  task's last attempt sha is an ancestor of `origin/main` or its card there
  reads `status: merged` (read from the configured `cardDir`; the allowlist
  takes `ls-tree` / `show` at `origin/main` for it); the attempt records
  `retired: merged`. The check runs at most once per 15 minutes per task and a
  failed one changes nothing. `/delegation accept <id> [note]` records
  `accepted` plus the note on the last attempt and retires the row. The block
  prints the live rows in full and then `n older owed rows: <ids>`.

- **`/delegation update` brings the loaded copy to origin/main (MOD-3).** It
  classifies the loaded folder (`classifyRoot` in `hooks/lib/update.ts`): a git
  clone is fetched and fast-forwarded (`git -C <root> merge --ff-only
  origin/main`, the one new allowlist form, only for the loaded folder); any
  other folder is left alone and the clone command that replaces it is printed.
  The output is `update: <old> (<sha>) → <new> (<sha>), n commits`, the
  CHANGELOG sections newer than the old version (40 lines at most, with a
  pointer to the README's `From <old> to <new>`), the keys added to
  `.chassis-delegation.json` (every defaulted key it lacked, with a `_<key>`
  note; every other byte unchanged), and the reload story: a folder under
  `~/.claude/dev-mods` reloads when the turn ends; any other needs the window
  reloaded. It refuses while a worker runs. `/delegation` adds `update: n
  commits behind origin/main` when the loaded clone is behind (one fetch per ten
  minutes, cached in the store).

- **One proof of red per task; `--verify` at the last attempt's own sha
  re-judges it (MOD-1, public issue #35).** A red file byte-identical to one an
  earlier attempt of the task held with is held again (`attempt n's proof,
  reused (one proof per task)`); one whose earlier claim did not hold is still
  refuted. `/dispatch <id> --verify <sha>` at the sha on the last attempt record
  re-judges that attempt (same number, no new record, no budget spent, first
  line `re-judging attempt n/b at <sha>`); any other sha opens a verify attempt
  as before. The choice is the pure `verifyTarget` in `hooks/lib/attempts.ts`.

- **A dispatch that names a base writes it into an existing brief (MOD-2, public
  issue #37).** Dispatching with `--base <sha>` (or the tool's `base`) against a
  brief already on disk now sets or replaces `base=` in its header
  (`setHeaderField` in `hooks/lib/brief.ts`; the amend blocks and body stay
  byte-identical) and says `reused, base= set to <sha>` or `reused, base=
  replaced <old> → <new>`, instead of the note that the verifier diffs against
  origin/main. A dispatch with no base against a reused brief that carries
  `base=` cuts the worktree from it, so the cut point and the verifier's base are
  the same ref.

- **Spend ceilings that fit the host (GH-116, public issue #34).** The defaults
  are now economy 3, standard 10, frontier 25 dollars (were 2, 6, 15). Setup
  proposes economy 5, standard 15, frontier 35 when a gate command is `sf`,
  `sfdx`, or names a deploy or a remote test runner (`deploy`, `--target-org`,
  `gcloud`, `aws`, `az`, `terraform`), writes it as `spendByTier` into a fresh
  config, and prints `config: spendByTier = …` with the reason.

- **The brain's own spend is priced and shown apart; Fable is priced; a
  delegate-only mode (GH-113).** `hooks/lib/cost.ts` prices `fable-5-1` and
  `fable-5` at $10 / $50 per million tokens. Every main-loop `turn.complete`
  with a usage adds to a brain record in `$.state` (tokens, dollars by model,
  turns, brain edits; pure model in `hooks/lib/brain.ts`). `/delegation` prints
  `brain: <family> $x over n turns · workers $y (n attempts) · brain share p%`;
  the dashboard gains a "brain $x / workers $y" tile and a `brain` row in spend
  by model (the text fallback too). A new `delegateOnly` key (`off`, `warn`,
  `deny`; `/config` and the repo file) keeps an opus or fable brain from editing
  source itself: `warn` posts one row per turn, `deny` refuses and names the
  card tool; the card folder, `.delegation/`, `.chassis-delegation.json`,
  `CHANGELOG.md` and any `docs/` folder stay writable, workers and a Sonnet
  brain are never restricted. A fable brain under it is told its posture at the
  top of the delegation state. README: "The brain's spend".

- **A scope or files refute holds the tier (GH-115, public issue #34 ask 3).**
  The attempt record keeps `firstFailed`, the first failed claim of a refuted
  verdict. A refute on `scope`, `files`, `branch` or `pr` no longer earns the
  next tier on respawn (only `sha`, `gate` or `red` does, as does a record
  without the field). A scope refute advises
  `resume agent=<id> — amend: [[amend v=1 scope+=<path> reason=…]]`, a files
  refute advises listing the paths in `files=`, and a later respawn says
  `(held: a scope refute)` or `(held: a files refute)`.

- **`/delegation` names what each alias resolves to and when it moved; the card
  dry run shows the classifier's tier (GH-114, public issue #34).** The store's
  alias record is now `{ id, since, previous?: { id, until } }` (the old plain
  id still reads). `/delegation` prints one `aliases:` line and, for a move in
  the last 7 days, a line naming it. The card tool's dry run asks the classifier
  once and prints `card says <tier> · classifier says <tier>` (or `agrees`); a
  new boolean `classifierSecondOpinion` (default true) turns it off, and the
  answer is kept as `classifierTier` on the card's first attempt record.
  The `classifierSecondOpinion` option still needs declaring in
  `.claude-plugin/plugin.json`.
- **A live delegation dashboard (GH-112).** A band above the prompt (drawn only
  while a worker is live, queued or owed a verdict; hover it for a card, press
  `[ details ]` for the pane) and a pane opened by `/delegation dashboard`:
  tiles (live, queued, spend, verified first try), session spend over time with
  spawn and verdict ticks, a worktree table (task, model chip, state, folder and
  branch, tokens, cost, attempt), spend by model, then the six cross-session
  blocks under "Across sessions". Pure model in `hooks/lib/live.ts`; the band and
  pane in `band.tsx` and `pane.tsx`; the spend series (15 s live, 60 s idle, 240
  points) lives in `$.state`. A new `/config` boolean, `dashboardBand`, turns the
  band off. A worker's tokens and cost update when its run ends (public issue
  #22), and the UI says so.
  A redraw reads the store's attempt records at most once every 15 seconds;
  the mod's own record writes show at once, other sessions' within 15 seconds.
  `/delegation dashboard` reports whether the pane was placed. On a screen
  that shows no mod panes (the VS Code extension today) it closes the waiting
  pane and prints the dashboard as markdown: the headline, spend over the
  session, the worktree table and spend by model.

## 0.5.0 — 2026-10-08

Twelve cards from adopter reports and a first new project, each dispatched
through the mod and verified in its worktree: GH-100 to GH-111. See
"Upgrading" in the README for what changes when you move from 0.4.0.

- **Claude Haiku 5.5 is priced.** The cost table gains `haiku-5-5` at $0.10 /
  $0.50 per million tokens. Its higher rate for prompts past 100K tokens is not
  applied, because usage arrives summed over a run; a long Haiku 5.5 run's
  figure is a floor. The economy tier needs no change: it maps to the alias
  `haiku`, which Claude Code resolves to Haiku 5.5 on the Anthropic API.
- **`/delegation` names the loaded version and folder**
  (`mod: chassis-delegation 0.5.0 loaded from <folder>`), so an upgrade can be
  checked from inside the session. A node test holds the version equal in the
  manifest, the README, this file and `hooks/lib/version.ts`.
- **The README gains an Upgrading section** an agent can follow.

- **Say the task, get the dry run (GH-111).** A new model-callable tool,
  `mcp__chassis-delegation__card` (pure logic in `hooks/lib/card.ts`): the
  brain turns a sentence into the fields (title, why, done-when, scope globs,
  red test, and optional tier, domain, gate, budget, spend) and the mod writes
  the card (the next free `<PREFIX>-<n>` in the card folder, a slug from the
  title, never overwriting), runs the same dry run as `/dispatch <ID>
  --dry-run`, and returns `wrote <path>`, a one-line summary, the brief header
  and `Say go and Claude dispatches <ID>.` With `dispatch: true` it dispatches
  instead. Prose scope, a gate id missing from `gateMap`, a missing red test,
  an unknown tier or domain are refused with the fix and write nothing.
  `/delegation setup` now ends with `Set up. Tell Claude your first task in a
  sentence, for example: "…"` (the example follows the detected gate) instead
  of a card skeleton to edit; through its tool it adds `Ask the person for the
  first task, then call the card tool.` Setup no longer writes
  `OPS-000-sample.md` (bare `/delegation init` still does) and no longer tells
  anyone to commit the card: a worktree dispatch reads it from the main
  checkout, and in repo=here mode the card folder joins the always-applied
  `ignore=` set. README: Setup, Sixty seconds, the commands table, the card
  format.
- **Setup's output reads right in VS Code and the desktop app (GH-110).**
  The first card is printed inside a ```markdown fence (its `---` lines were
  rendering as rules and the lines ran together). Setup no longer prints
  init's "Next:" line or the restart note, so there is one set of next steps.
  The card skeleton gains a `red_test:` line with an example taken from the
  detected gate. A fresh config is followed by one `config:` line per key set.
  When the scaffold leaves the tree dirty, the next steps start with committing
  it. `/delegation init` text is unchanged.
- **`/delegation setup` checks the repo and hands over the first card (GH-109).**
  A new project learned each requirement (a git repo with a first commit, a
  remote with `main` or `repo=here`, a passing test command, a lockfile, no
  shadowing skill) from a failure. `/delegation setup` and the
  `mcp__chassis-delegation__setup` tool run one function: six required checks
  and seven advice lines, each failing check with the exact fix to run (the
  allowlist admits no `git init`, commit or install, so the mod checks and the
  brain fixes). While any required check fails it writes nothing; when they
  hold it runs the init scaffold, writes the config with the detected
  `gateMap`, `baseRef` (no remote) and `cardDir` (plugin repo), and prints the
  first card and the next `/dispatch` steps. Pure logic in `hooks/lib/setup.ts`.
  `/delegation` with no config adds `not set up here: run /delegation setup`.
  README: step 4 is now setup, a Setup section, the commands table.
  A Python project runs `pytest` only when `pytest.ini` names it or it is
  installed; otherwise the gate is `python3 -m unittest discover -s tests`,
  which needs nothing but `python3`. The README's install steps now lead with
  hot reload for a session already running (VS Code, the desktop app), and
  warn against pointing the global setting at a session's hot-reload folder.
  The card tool works in the shared checkout (`repo: here` on the card) when
  the repo has no `origin/main`; a `baseRef` alone does not change the mode.

- **A per-attempt spend ceiling (GH-106, closes public #15).** Fifteen
  standard cards cost $1 to $4.55; two cost $21.79 and $32.48 because the
  workers over-delivered, and nothing told the worker or the mod what one
  attempt may spend.
  - *The ceiling.* New brief field `spend=<usd>`; config key `spendByTier`
    (repo file and `/config`; default economy 2, standard 6, frontier 15; `0`
    means none). `/dispatch` writes the card's `spend:` if present, else the
    tier default; the brief template's Rules gain a Spend line.
  - *Per-worker cost.* `hooks/lib/cost.ts` is wired: each worker's spend is
    summed from its own `turn.complete` usage. The verdict row's, the
    record's and the ledger's `usd` use it; without usage they keep the
    session delta, now marked `~` (so concurrent workers no longer inflate it
    silently: a $2 card read $14.47).
  - *The warning and the stop.* At the ceiling the worker gets one wrap-up
    message (not a resume, not charged to the budget). At twice it the
    attempt is recorded `over-spend` and a row says to check the worktree;
    `over-spend` never escalates the tier. The engine's `turn.start` carries
    no `agentId` for a subagent, so the turn is aborted only when it does;
    otherwise the row alone is posted (README, Spend ceiling).
  - *Visible mid-run.* The status line and the queued-spawn refusal show each
    live worker's running cost.
  The engine does not show a plugin the steps of a worker it spawned itself,
  so for a dispatched worker the cost, the wrap-up and the over-spend check
  come when its run ends; the brief's spend line is what limits it mid-run.

- **A tier the mod does not know is named (GH-108).** A card `tier:` (or a
  header `tier=`) that is not economy, standard, frontier or premium used to
  dispatch at standard with no word; one adopter has 14 cards with
  `tier: deep` and one with `tier: opus`. Now a model name (`haiku`, `sonnet`,
  `opus`, `fable`, or a full id containing one; case-insensitive) is taken as
  its tier, and anything else prints once in the `/dispatch` output
  `warning: tier "deep" is not economy, standard, frontier or premium;
  dispatched at standard` (the header carries `tier=standard`). The spawn hook
  applies the same mapping to a header `tier=` and logs the warning to debug.

- **A dispatch's `--base` reaches the verifier (GH-105, closes public #14).**
  A card stacked on an unpushed sibling was cut from the sibling's sha, the
  worker changed only its own files, and the verdict was `refuted on scope`
  on a file from the base commit: the brief never said `base=`, so the
  verifier diffed against `origin/main`.
  - `/dispatch <ID> --base <sha>` (and the tool's `base`) now writes
    `base=<sha>` into the header whenever the base is not `origin/main`,
    worktree mode and repo=here alike. A reused brief is not rewritten; when
    it has no `base=` the dispatch output says so.
  - The scope line names the base: `claim scope: held — every changed path
    since <base> is within …`. `--verify <sha>` takes its delta from the
    same `base=`.

- **A refused drain keeps the queue head (GH-107, closes public #16).** The
  drain used to remove the head before spawning it, so a spawn the hook
  refused lost its place and the brain, which never reads toasts, saw nothing.
  The head now leaves the queue only after its spawn succeeds. On a refusal it
  keeps position 1 and its `at`, the drain stops for that pass, and a session
  row reads `queued <task> not started: <reason>; it keeps its place (position
  1)`. A budget-exhausted or unreadable-brief refusal removes the row instead,
  with a row saying so.
- **Spend guards (GH-104, closes public #10).** One Sonnet-sized task cost an
  adopter about $15: its first worker finished, the report was misread as
  no-report, and the retry spawned one tier up on Opus as attempt 2.
  - *No escalation on no-report.* A no-report is a reporting defect: the
    first still advises a resume, the second a respawn at the SAME tier
    (`next=respawn at standard`), and the spawn hook holds a respawn after a
    no-report at that attempt's tier (`held` in the debug line when it is
    above the brief's). Escalation stays for a refuted report and for a
    `gate=fail` the verifier confirmed; an unconfirmed `gate=fail` no longer
    moves the tier up.
  - *Look before you respawn.* Before a respawn (the mod's, a by-hand Agent
    spawn, a queued one) and before a resume it advises or performs, the mod
    reads the worker's worktree with allowlisted git reads (`rev-parse HEAD`,
    `status --porcelain`, `log --format=%H <base>..HEAD`). Commits ahead of
    the base, a clean tree and a head the verifier has not judged mean the
    work is there: nothing spawns, the attempt is recorded as `work-present`
    (kind `verify`), and the row says `work present at <short sha> on
    <branch>: verify it (next=verify sha=<sha>)`. A by-hand respawn is
    refused with the same line. repo=here and repo=none are not looked at.
    Judged attempts now keep the report's `sha`, so a refuted attempt's own
    head is not mistaken for new work.
  - *`/dispatch <ID> --verify <sha>`* (the tool's `verify`) runs the native
    verifier on that branch head with a synthetic report naming the delta
    (`gate=pass`, so the gate is re-run; the newest red file when the brief
    has a red test), with no spawn. The verdict lands on the work-present
    attempt, else on a new `verify` attempt.
  - *The notice says what it spends.* A briefed spawn's notice ends with
    ` · attempt <n>/<budget>` (`tier=standard → sonnet (brief) · attempt 2/3`),
    and `/dispatch` line 4 reads `spawned <type> agent <id> on <model> ·
    attempt <n>/<budget>`. The debug line still names the tier source.
  - The queue dedupe the same report asked for is GH-101's, not this change.
  A refusal for work already present in the worktree also removes the row
  (it needs `--verify`, not a respawn), and a refusal that keeps the head is
  posted once, not on every drain.

- **A moved file is listed once, at its new path (GH-102, closes public #6).**
  The verifier's delta used `git diff --no-renames --name-only`, so a `git mv`
  read as the old path omitted and the new path added, and a correct hand-back
  was refuted. The delta is now `git diff --name-status -M`, a rename is its new
  path, and an old path a worker lists as well is dropped before comparing (the
  held line says `(1 rename collapsed)`).

- **A prose scope is caught at dispatch (GH-103, closes public #8).** When a
  card's `scope:` reads as prose and no `--scope` (tool `scope`) is given,
  `/dispatch` and the tool write the brief, print the header and the prose,
  and stop before the worktree and the spawn; dispatch again with globs and the
  brief is reused. A prose `scope=` that reaches the verifier is no longer a
  refusal of the whole brief: the scope claim is `unchecked` and the rest is
  checked, so the worker's finished work stands. `BRIEF-SCOPE-PROSE` is gone;
  a brief with no `scope=` is still refused.

- **The queue never holds a phantom (GH-101, closes public #4 and #7).** The
  queue keeps one row per task and subtask: a second dispatch answers
  `already queued since <HH:MM> (position <n>)` and spawns nothing. The queue
  drains after every hand-back, after a dispatch that did not spawn, and at the
  start of every dispatch, one toast per start: `started queued <task> (waited
  <m> min)`. A by-hand Agent spawn with an inline header for a queued task
  takes the queued place when a slot is free instead of being refused. The
  refusal names live agents and queued rows apart: `(1 live: BE-310; 1 queued:
  BE-314)`; `queuedDeny` takes both lists. Slots count live agents and other
  tasks' starting spawns, never queue rows.
- **A shorter repo root (GH-100).** The root held fifteen entries above the
  README; it now holds ten. `types/` is `hooks/types/`, `templates/` is
  `hooks/templates/` (so the default brief template is
  `hooks/templates/brief.md`), `eval/` is `tests/eval/`, `scripts/selfcheck.sh`
  is `tests/selfcheck.sh`, and this repo's cards moved from `delegation/tasks/`
  to `docs/cards/`. `init` now picks `docs/cards` in a plugin repo (it picked
  `delegation/tasks`), so a plugin repo that init'd earlier keeps its
  `cardDir` setting. No behaviour changed; `--replay` still reads
  `agents/tasks/` at the base commit.

## 0.4.0 — 2026-10-05

The adopter reports, worked through: every entry below was a card under
`delegation/tasks/` (named GH-<n>), dispatched to a worker and verified in its
worktree by the mod itself.

- **The adopter review's remaining items (GH-1, items 2, 5, 6 and 8).**
  - *Item 2, cardless hand-backs.* An ad hoc spawn (the Agent tool with no
    header and no brief file) whose hand-back carries a `[[report …]]` line was
    marked `unverified` with "no brief header". Now the git claims are checked
    without a brief, in the spawn's cwd or the session root: branch, sha (a sha
    off the branch is refuted), files= against the delta, pr. Scope, gate and
    red are unchecked ("no brief: no scope=/gate=/red_test= to check
    against"). The row is posted, the attempt recorded under the report's
    `task=` (or `adhoc-<key>`) with `adhoc: true`, and the ledger line written.
    No budget ladder: `next=accept` for verified, `next=check the diff`
    otherwise, never resume or respawn.
  - *Item 5, unverified is actionable.* An unverified verdict with an agent id
    and budget left advises `next=resume agent=<id> — prove: <claim> (<reason>),
    …`, each reason cut to 160 characters. The resume counts against the budget
    like a failing verdict's, and `autoEscalate` performs it, sending only the
    unchecked claim lines. Past the budget, or with no agent id, the advice
    stays "check by hand".
  - *Item 6, the budget grammar warns.* `parseBudget` and `budgetAttempts`
    still fall back, but `/dispatch` now prints `warning: budget "frontier-60m"
    is not <n>-attempts; using the default 3` once, and the spawn hook logs the
    same line to debug for a header's malformed `budget=`. The tier part of a
    chassis `<tier>-<minutes>m` budget is never taken as the tier.
  - *Item 8, small things.* The classifier runs only with no header and no
    caller-model hint (this already held; a test now pins it), and every
    spawn logs which source picked its tier, such as `T-7: tier=economy picked
    by the brief header's tier= (no classify call)`. When a brief (`model=` or
    `tier=premium`), the caller or the tier map asks for fable and opus spawns,
    the notice reads `tier=frontier → opus (fable requested; fable is never
    spawned by the mod)` and the attempt record keeps `requestedAlias: fable`.
  - A cardless attempt is kept under its report's task for the record but never counts toward a later dispatch's budget or escalation ladder: no brief was given for it.

- **cardDir: the card folder is configurable (GH-12).** In a repo that is
  itself a plugin, the engine offers every `agents/*.md` as a subagent and
  `claude plugin validate` warns about each card. A new repo-file key
  `cardDir` (default `agents/tasks`; relative, no `..`) sets where `/dispatch`
  and the dispatch tool read cards. `init` picks `delegation/tasks` when the
  root holds `.claude-plugin/plugin.json`, writes it as `cardDir`, and says
  why; the card README it writes names the folder it used. `--replay` still
  reads `agents/tasks/` at the base commit.

- **`{worktree}` in a gate-map command, and a bad command refused at config
  load (GH-11).** `"validate": "claude plugin validate ."` passed the
  template check but was refused at verify time, after the worker had run.
  Now `{worktree}` (beside `{files}`) is filled with the absolute path of the
  tree the gate runs in, so `claude plugin validate {worktree}` works. And the
  repo file and `/config` gate map are checked at load by filling both
  placeholders with a sample path and running the allowlist's own check: a
  command it would refuse is dropped and named in the toast and log with the
  reason (`gateMap.validate: claude plugin validate . is not an absolute
  folder; write {worktree}`).

- **The git guard no longer denies a tag push or a remote-branch delete from
  main (GH-24).** `git push origin v0.3.0` and `git push origin --delete
  agent/mod/GH-21` were denied on `main` as pushes of `main`. A push is now a
  push of the current branch only when its refspecs are empty, or one is
  `HEAD`, `HEAD:<x>`, the branch name, `<branch>:<x>`, `--all` or `--mirror`.
  Tags, `--tags`, other branches and deletes of them pass. A push naming a
  guarded branch as its destination (`origin main`, `:main`, `--delete main`)
  is still denied from any branch. The deny line is unchanged.
- **repo=here: a main-checkout mode (GH-16, GH-19, GH-10).** Local-only
  repos with no `origin`, code in a nested child repo, and evidence that lives
  only in the main checkout could not use `/dispatch`. Now:
  - `/dispatch <ID> --here` (the tool's `here`, or a card's `repo: here`)
    writes a `repo=here` brief, runs no fetch and no `git worktree add`, and
    spawns the worker in the session root. Its brief says the checkout is
    shared: touch only your scope, do not commit unless the card says so,
    report `branch=<current>` and `sha=HEAD` (or the sha you committed). The
    template carries the mode in `{{#here}}` / `{{#worktree}}` sections.
  - The verifier reads a repo=here hand-back in the root: the branch must be
    the current one; `sha=HEAD` (or `none`) takes the delta from
    `git status --porcelain=v1 --untracked-files=all -z`; the brief's
    `ignore=` globs (plus an `ignore+=` amend, which always waits for
    approval) and the files= other in-flight repo=here cards claimed come off,
    each disclosed on a new `ignored:` line; the gate runs on the dirty tree.
  - Two in-flight repo=here cards whose scope globs overlap are refused at
    dispatch, naming both cards and globs; `--force-overlap` lets it through
    with a warning (GH-19).
  - New config keys: `baseRef` (where the delta starts when a brief names no
    `base=`; default the `origin/main → main → origin/master → master` chain)
    and `ignore` (default `[".delegation/**"]`). A brief may name its own
    `base=` in any mode, which beats both (GH-10); a repo=here dispatch writes
    `baseRef` into it, pinning `HEAD` to its sha. The settings layer reads
    both keys and the manifest declares them, so `/config` offers them too.
  - The README documents running in a nested child repo: the child is the
    session root, and the parent's `.chassis-delegation.json` is never read.

- **The report names its red-test evidence, and the verifier checks it (GH-20,
  GH-1 item 4).** The brief asked the worker to run the red test first and
  show it failing, but the report had no place for the evidence, so the
  verifier took the worker's word; one adopter's worker pasted attempt 1's red
  output as attempt 2's. The report grammar gains an optional `red=` (a path
  relative to the worker's tree, or `none`). `templates/brief.md` tells the
  worker to save the red test's failing output to
  `.delegation/<task>/red-<attempt>.txt` in the worktree before changing any
  source, a new file per attempt, and to name it as `red=`. A new `red` claim,
  after `gate`, runs only when the brief's `red_test=` is set (not empty, not
  `none`). It holds when the file lies in the tree, is not empty, carries a
  failure marker, and is not byte-identical to an earlier attempt's red file
  (sha-256, kept on the attempt record as `red` and `redHash`). No `red=`, or no
  failure marker, is unchecked (unverified, never refuted). A path outside the
  tree, a missing or empty file, or an earlier attempt's file again is failed.
  The pure claim is `redClaim()` in `hooks/lib/verify-native.ts`; register.ts
  reads the file through `$.fs` as bytes and hashes it with `crypto.subtle`.

## 0.3.0 — 2026-10-04

The first release built through the mod itself: every fix below was a card under
`agents/tasks/`, dispatched to a worker and verified in its worktree. Seven
reports closed: GH-2, GH-3, GH-4, GH-5, GH-6, GH-17, GH-21.

- **A scope entry inside a forbid is caught early (GH-17).** Forbid wins
  over scope, so a `scope+=` for a path under a forbid glob did nothing and the
  card was refuted on scope. `/dispatch` now warns once per scope entry that a
  forbid glob entirely covers, and a hand-back `scope+=` into a forbid is held
  as `amend needs approval: … shrink the forbid` instead of applied. The new
  pure helper is `scopeInsideForbid`; `amendNeedsApproval` takes the forbid.

- **The README tells a stranger how to install (GH-21).** "Install on a new
  machine" is now numbered steps (clone, load the plugin, start or restart
  Claude Code, run `/delegation init`) and says the restart out loud. A
  "Commands and tools" table lists what you type and what the model may call,
  and warns that a user skill or command named `delegation` or `dispatch`
  shadows the mod's. `init`'s closing text ends with a note to restart once if
  Claude Code says an update is pending.

- **An inline header is verified (GH-6).** A spawn whose Agent prompt
  carries a complete `[[brief …]]` header (`task=`, `scope=` or
  `scope_globs=`, and `gate=` or `repo=none`) and names no brief file used to
  hand back `unverified` with `no brief file named in the prompt; verify
  skipped`, so a fabricated sha went unchecked. The mod now writes the header
  and the rest of the prompt to
  `<root>/.delegation/briefs/<task>.<subtask>.brief.md` (or `briefDir`). It
  never overwrites a file already there. The hand-back is then verified
  against that file like any brief. A header that lacks a field still hands
  back unverified, and the line now names the missing field.

- **Budget refusal tells the truth (GH-3).** At resume and respawn the
  budget is read from the brief file named in the spawn record (falling back to
  the record), so raising `budget=` in the brief lifts the refusal; the record
  is not rewritten. The refusal now names the brief path and the field, says the
  ladder continues from the stored attempt count, and names no person.

- **A report delivered only through the hand-back is verified (GH-2).** A
  background worker that ended its run with SubagentHandback and a short final
  answer was judged `no-report`, so the ladder resumed and respawned it until
  the budget ran out while the work was done. No `tool.call` for that tool
  reached the mod in those runs, and `turn.complete` carries the answer
  alone. The mod now reads the hand-back where the engine keeps it, the
  worker's own transcript (`$.session.messages({ agentId })`), from the run
  that just ended only. The last `[[report]]` across the answer and the
  hand-back wins. Debrief agents and eval runners are read the same way.

- **A dispatch no longer counts its own starting token (GH-5).** With
  `maxWorkers=2` and one worker live, the dispatch tool's spawn was queued
  because its own `starting` token held the second slot; the queued line named
  the task itself as running. The slot claim now ignores the token the same
  task already holds, so the spawn starts at once, and a full house still queues
  with a line naming only the real workers. The 5D git-guard tests now stub Bash
  with `{ result }`, which the 2.1.288 engine requires.

- **`files=` folder entries (GH-4).** An entry ending in `/` now stands for every
  changed path under that folder, so listing `docs/img/` no longer refutes on files.
  A folder with nothing changed under it is still named as invented, and the held
  line says how many folder entries were expanded.

## 0.2.0 — 2026-10-03

Standalone. The mod no longer calls or needs anything outside its own folder.

- **Native verification (5A).** A report is checked with read-only git in the
  worker's own worktree: the branch, the sha (ancestor of the branch, or a
  fabrication), the scope and forbid globs over the delta, `files=` against the
  delta exactly, and the gate re-run in place once HEAD is the sha and the tree
  is clean (a dirty tree or another HEAD leaves the gate unchecked). It also
  checks the PR (`gh pr view <n> --json state`). The calls to
  `dispatch-verify.sh`, `dispatch-emit.sh` and `which-model.sh` are gone, and
  so are their allowlist shapes. The store is the ledger, plus an optional
  `<root>/.delegation/ledger.jsonl` (`ledgerFile`, on). `repo=none` briefs
  keep the no-repo check.
- **Tier map and repo config (5B).** The built-in tier map is economy→haiku,
  standard→sonnet, frontier→opus. A repo can add an optional
  `.chassis-delegation.json` with these keys: `gateMap`, `agentTypes`,
  `tierMap`, `evalCommand`, `evalLiveCommand`, `briefTemplate`, `briefExtra`,
  `maxWorkers`, `domains`, `worktreeRoot` and `autoEval`. Precedence is
  defaults < repo file < `/config`. `/delegation init` and the
  `mcp__chassis-delegation__init` tool scaffold a repo and never overwrite a
  file. `/delegation` alone prints the state. No repo's own subagent types are
  built in: a domain runs on the type `agentTypes` names, else a type of its
  own name, else `general-purpose`.
- **Portable briefs (5C).** Briefs go to `<root>/.delegation/briefs/`. The
  session scratchpad is used only when the root is not writable. The brief
  template is repo-neutral: its install step is picked by lockfile, and the
  repo's own lines come from `briefExtra`.
- **Git guard (5D).** A `commit`, `merge`, `cherry-pick`, `rebase` or `push` on
  a branch in `guardBranches` (main, master) is denied with
  `chassis-delegation: no <verb> on <branch>; branch first (git checkout -b agent/<domain>/<id>)`.
  So is a push that names a guarded branch, from any branch. The guard reads
  command words, so heredoc bodies never trigger it. It is controlled by
  `gitGuard` (on).
- **Debrief and eval without a harness (5E).** The debrief falls back to the
  built-in `templates/debrief.md`. It writes
  `<root>/.delegation/debriefs/<date>-<slug>.json` and adds a line to
  `<root>/.delegation/ledger.md`. Without a breadcrumb file, its friction
  signal is the corrections, tool denials and refutes the mod saw
  (`debriefMinEvents`, 5). `autoEval` is off by default and runs only with an
  `evalCommand`.
- **The repository (5F).** This release adds the git repository, the MIT
  license, this changelog, a README for a stranger and `scripts/selfcheck.sh`.
- **Tests (5G).** New tests cover the native verifier against temporary git
  repositories and against a table. They also cover:
  - the repo config precedence, init and the git guard;
  - the debrief fallback and the friction count;
  - the portable brief folder.

  The engine hook tests are rewritten for the above. A plain-node runner
  (`tests/node/run.mjs`) runs every pure test where `claude plugin test`
  cannot.
- The quiet row says `(no repo)` after the verdict and keeps its reason.

Changed defaults:

- `gateMap`, `agentTypes`, `evalCommand` and `evalLiveCommand` are now empty;
- `autoEval` is now `false`;
- `verifyBootstrap` is removed.

To keep the old behaviour, put the old values in the repo's
`.chassis-delegation.json`.

## 0.1.0 — 2026-10-02

Parts 1 and 2: the brain seat's hand steps, and the same steps in the background.

- **Part 1.**
  - Tier on spawn: the brief's `tier=`, then the caller's model, then the classifier.
  - The verifier's report check, the per-task budget, and resume-first escalation (`autoEscalate`).
  - The amend protocol, alias-drift and agent-type watch, and the status line.
  - `/dispatch <ID> [--dry-run] [--base] [--replay] [--scope] [--forbid]`, which goes from a card to a running worker.
- **Part 2.**
  - The `dispatch` tool, a second door to the same function as `/dispatch`.
  - Quiet one-line verdicts (`verdictVerbosity`).
  - The clean-stop background debrief and the background eval trigger (T1, and T2 behind `evalLive`).
  - The compaction block and the "Delegation state" prompt section.
  - The worker scheduler (`maxWorkers`).
