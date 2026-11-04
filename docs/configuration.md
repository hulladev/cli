# Project and UI configuration

`hulla init` writes `.hulla/hulla.json`. It contains package-manager scripts, cache/log settings,
and paths to subsystem configs:

```json
{
  "$schema": "https://raw.githubusercontent.com/hulladev/cli/v0.1.0/schemas/hulla.schema.json",
  "cli": {
    "scripts": {
      "add": "bun add",
      "addDev": "bun add -D",
      "uninstall": "bun remove",
      "upgrade": "bun update"
    },
    "cache": true,
    "cacheDir": ".hulla/.cache",
    "logs": true
  },
  "configs": { "api": "api.config.ts", "ui": ".hulla/ui.json" }
}
```

Paths are resolved from the project root. `--config` selects a different CLI config. Generated
JSON schemas in `schemas/` are the authoritative editor/CI contract.

## Package manager detection

Run `hulla init` from the application directory, including in a monorepo. Detection uses:

1. The application's `packageManager` field, if set.
2. The containing workspace's `packageManager` field.
3. Lockfiles in the application and its containing workspace.

Workspace membership comes from `package.json` workspaces (array or `packages` object) or
`pnpm-workspace.yaml`, including exclusion patterns. Detection stops at Git boundaries and does
not inherit settings from unrelated parent projects. The CLI prints the source of its selection.
An explicit `packageManager` wins over conflicting lockfiles, with a warning naming those files.
Without an explicit choice, lockfiles for different managers produce an error.

`hulla init --yes` fails when there is no package-manager evidence instead of silently choosing
npm. Set `packageManager` in the application or workspace root, create the intended lockfile, or
run `hulla init` interactively to select or customize scripts.

The generated config belongs to the application. Dependency commands run there, so dependencies
are added to that application's manifest. Existing `cli.scripts` remain authoritative until you
explicitly reinitialize the config. UI formatting also looks for a formatter installed at the
workspace root before choosing a package executor:

| Detected manager   | Formatter fallback                                    |
| ------------------ | ----------------------------------------------------- |
| npm                | `npx <formatter>`                                     |
| Bun                | `bunx <formatter>`                                    |
| pnpm               | `pnpm dlx <formatter>`                                |
| Yarn 2+            | `yarn dlx <formatter>`                                |
| Yarn Classic (1.x) | `yarn exec <formatter>` (install the formatter first) |

For declared formatter dependencies without a `node_modules/.bin` entry, pnpm and Yarn use
`exec` to resolve the installed tool, including Yarn Plug'n'Play. Yarn Classic is identified from
the declared manager version or the classic lockfile header; it never generates `yarn dlx`.
These pnpm/Yarn commands retain the same formatter diff-preview support as `npx` and `bunx`.

## UI registry configuration

`.hulla/ui.json` has `version`, ordered `sources`, resolved `installs`, and an optional
`postAddUpdateStep`. An install records registry identity, code/components/copy roots, root
TypeScript config, and each framework's template/output/config paths. Let `hulla ui init` maintain
this structure; manual edits should be limited to intentional source or path changes.

Local sources are relative/absolute filesystem paths. Remote sources are immutable GitHub tree/tag
URLs. Relative sources resolve from the project root and load the registry's generated
`ui.config.ts`.
