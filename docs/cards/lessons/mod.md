# Lessons: mod

Rules this repo learned from earlier cards. Dispatch appends this file to every brief in the mod domain (40-line cap).

- 2026-10-11 A version-bump card keeps tests/** in scope: a test may pin the version string (0.6.1 stalled on one).
- 2026-10-11 Never forbid a path the card's own done-when must change (GH-116 forbade the manifest it asked to edit; MOD-29 now warns at dry run).
- 2026-10-11 Engine-suite gates flake on 5 s timeouts when two workers run suites at once; a timeout-only failure in a test you did not touch is a rerun, not a bug (MOD-20 reruns once).
- 2026-10-11 A card that quotes a template marker such as {{#none}} in its Why is fine: the marker scan runs on the template, not the card (MOD-28).
- 2026-10-11 Keep hooks thin: pure logic in hooks/lib/, every $ call in hooks/register.ts; a new hooks/lib file needs the engine's types read-only (there is no tsc on this machine; validate + node + claude plugin test are the gates).
- 2026-10-12 A card that adds a /config option must put .claude-plugin/plugin.json in scope (and forbid only .claude-plugin/types/**): the option has to be declared in the manifest, and GH-116 and MOD-48 both stalled on a card that forbade it.
