# Project and UI configuration

Configure the UI install once from the target app directory, review the saved settings, and reuse
them for ordinary component operations:

```sh
hulla ui init
hulla ui list
hulla ui add button
```

UI setup initializes project settings if needed. To prepare only project commands, use `hulla init`.
In a monorepo, select the app with `--cwd '<app-path>'` during setup. Source, framework and destination
flags are useful for scripted setup and intentional changes; routine adds should use saved choices.

## Find the active configuration

Start from the selected app directory (`--cwd` or the invoking directory):

1. Open `.hulla/hulla.json`, or the file explicitly selected by `--project-config`.
2. Read its `configs.ui` value to find the UI config; the default is `.hulla/ui.json`.
3. Review `sources`, `installs` and `hooks` there before running component operations.

`configs.ui` resolves from the project root, or can be absolute.
There is no directory search for another UI config. `--config` on UI/setup selects the project config,
not the UI JSON file directly. See custom config root rules below.

## Project settings

`hulla init` writes `.hulla/hulla.json`. It contains package-manager scripts, cache/log settings,
and paths to subsystem configs:

```json
{
  "$schema": "https://raw.githubusercontent.com/hulladev/cli/v0.2.0/schemas/hulla.schema.json",
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

Paths are resolved from the project root. `--project-config` selects a different project config (UI/setup also accept `--config`). For a
config inside `.hulla/`, the project root is the directory above `.hulla/`; for other locations,
it is the config's containing directory.

`cli.cacheDir` defaults to `.hulla/.cache`. The CLI resolves this default and custom relative cache
paths from that project root when loading the config, regardless of the shell's working directory.
Explicit absolute cache paths stay absolute. Saving a loaded config omits the default and preserves
custom relative paths, so copying the config into another checkout uses that checkout's cache.
Generated JSON schemas in `schemas/` keep the relative default for portable editor/CI validation.

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

`.hulla/ui.json` has `version`, ordered `sources`, resolved `installs`, and optional
`hooks.pre`/`hooks.post` command arrays. An install records registry identity, code/components/copy roots, root
TypeScript config, and each framework's template/output/config paths. Let `hulla ui init` maintain
this structure; edit hooks and make intentional source or path changes in the saved config. See
[UI operation hooks](./ui-hooks.md) for timing, `{files}`, environment metadata and preview opt-in.
Agents should read this config before adding components and reuse its source/framework/destinations
instead of repeating setup flags on routine adds.

Local sources are relative/absolute filesystem paths. Remote sources use repository URLs; pin a
release tag or commit for repeatable inputs. Relative sources resolve from the project root and load the registry's generated
`ui.config.ts`.

## Config values and CLI inputs

The UI rows below are relative to the active UI config. Let setup populate `installs`; edit its
records only for intentional changes. Source, output-root and post-command options on `ui add`
rerun setup and save choices; `--framework` alone selects a configured target for that operation.

| Saved value                                                               | Setup input                          | Meaning                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `sources` and `installs[].sourceUrl`                                      | `--source <url-or-path>`             | Select one registry; this flag replaces the source list. Edit `sources` for several registries.         |
| `installs[].frameworks[].name`                                            | `--framework <name>`                 | Select a registry target during init. Later add/remove uses it only to disambiguate configured targets. |
| `installs[].codeRoot`                                                     | `--code-root <path>`                 | Root used for `@/` imports.                                                                             |
| `installs[].componentsRoot`, initial `installs[].frameworks[].outputPath` | `--components-root <path>`           | Component destinations. Existing per-framework output paths are retained unless explicitly changed.     |
| `installs[].copyFilesRoot`                                                | `--copy-root <path>`                 | Support-file destination.                                                                               |
| `hooks.post`                                                              | `--post-add-command '<command>'`     | Shortcut that replaces post hooks with one ordinary command; `none` clears them.                        |
| `hooks.pre`, full `hooks.post` list and `hooks.post[].preview`            | Config only                          | Commands around operations; see [UI hooks](./ui-hooks.md).                                              |
| `installs[].composer`                                                     | Setup selection; no dedicated flag   | Web class composer: `cn` or `tailwind-merge`.                                                           |
| `installs[].frameworks[].tsconfigPath`, `installs[].rootTsconfigPath`     | Setup selection; no dedicated flag   | Saved TypeScript config paths.                                                                          |
| `installs[].frameworks[].templatePath`                                    | Registry metadata; no dedicated flag | Source template selected by framework.                                                                  |

In the project config, `configs.ui` selects the UI file and `cli.scripts` defines dependency commands.
Both are config-only values; `hulla init` supplies the initial scripts from package-manager setup.

Some command inputs are deliberately not saved:

| CLI input                                          | Scope                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| `--cwd <app-path>`                                 | Select the app for this invocation.                                             |
| `--project-config <path>` (`--config` on UI/setup) | Select the project config for this invocation.                                  |
| `ui list [query]`                                  | Filter discovery results. `--source` here inspects a library without saving it. |
| `ui add <families...>`, `ui remove <families...>`  | Select component families from the registry for this operation.                 |
| `--yes`                                            | Disable prompts and accept confirmations for this invocation.                   |

Once setup is saved, use `hulla ui add button`. Add `--framework` only when more than one configured
target matches. To change a registry or destination, update the saved config and rerun `hulla ui init`,
or pass the corresponding setup option intentionally. For manual component destination changes, keep
`componentsRoot` and the relevant `frameworks[].outputPath` values aligned. Changing output paths
does not move old files.

## Select a workspace or custom config

`--cwd <app-path>` targets that app from the repository root.
Use `--project-config .hulla/custom.json` to select a project config relative to the selected app.
`--config` is an alias for project/UI commands; API commands reserve it for their generator.
The default cache path is stored as `.hulla/.cache` and resolved from the project root when loaded,
so configuration and generated schemas contain no checkout-specific default paths.
