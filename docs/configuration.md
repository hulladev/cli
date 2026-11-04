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

Paths are resolved from the project root. `--config` selects a different Hulla config. Generated
JSON schemas in `schemas/` are the authoritative editor/CI contract.

`.hulla/ui.json` has `version`, ordered `sources`, resolved `installs`, and an optional
`postAddUpdateStep`. An install records registry identity, code/components/copy roots, root
TypeScript config, and each framework's template/output/config paths. Let `hulla ui init` maintain
this structure; manual edits should be limited to intentional source or path changes.

Local sources are relative/absolute filesystem paths. Remote sources are immutable GitHub tree/tag
URLs. Relative sources resolve from the project root and load the registry's generated
`ui.config.ts`.

## Select a workspace or custom config

In the unreleased command update, `--cwd apps/mobile` targets that app from the repository root.
Use `--project-config .hulla/custom.json` to select a project config relative to the selected app.
The `--config` alias still works for project/UI commands; API commands reserve it for their generator.
The default cache path is stored as `.hulla/.cache` and resolved from the project root when loaded,
so configuration and generated schemas contain no checkout-specific default paths.
