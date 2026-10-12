---
id: MOD-68
title: /delegation config lists the mod's options from its manifest and live values even when the host's $.config.list() gives no rows for it, and says why a set fails
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/configcmd.ts, tests/**, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/lib/allow.ts, hooks/lib/gitguard.ts, README.md]
red_test: a new engine test where the inline host's config.list returns only engine rows (no chassis-delegation rows): `/delegation config` must list wakeOnVerdict and driveWarn; on main it prints only the how-to line
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

In the VS Code extension, with the mod loaded from CLAUDE_CODE_PLUGIN_DIRS, `/delegation config` printed only its how-to line: none of the rows from $.config.list() had a key starting with `chassis-delegation.`, so the list was empty and the command told the person nothing. We don't know if the host gives no plugin rows there or keys them differently. The mod already knows its fields (the manifest's userConfig) and its live values (the options it was activated with), so the list must not depend on the host's rows.

## Done when

- `/delegation config` lists every userConfig field of the manifest, one line each as now (`<field> = <value>`, `(default)`, `(locked)`). The value is the host row's when there is one, else the option the mod was activated with, else the manifest default.
- A host row is this mod's when its `provider.plugin` equals `$.plugin.name` or its key starts with `<$.plugin.name>.`. The key used for `$.config.set` is that row's own key, else `<$.plugin.name>.<field>`. CONFIG_PREFIX is no longer the only test.
- When the host gives no row for this mod, the list ends with one line that says so, with the number of rows the host did list. The line tells the person that a set may be refused on this screen and that the /config menu in a terminal sets the same options.
- `/delegation config <field>` and `<field> <value>` work for any manifest field, with or without a host row. The kind (boolean, number, choice, text) and choices are read from the manifest's userConfig `type`/`options` when there is no row. A thrown or denied `$.config.set` answers `<field> was not set: <reason>`, with the host's reason verbatim.
- Engine tests: a host that lists no plugin rows still gives the full list with live values and the no-rows line; a row keyed differently but with provider.plugin = chassis-delegation is used and its key is passed to set; set through the fallback key; a set that throws gives the reason. The existing configcmd tests still pass.
- CHANGELOG.md has an entry under a new `## Unreleased` heading above `## 0.9.6 — 2026-10-12`. The three gates pass.
