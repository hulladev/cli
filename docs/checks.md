# Check installed integrations

These commands and options require `hulla@0.2.0` or newer.

Run `hulla doctor` from a project or workspace root to check its declared integrations. It detects
UI, style, API, db, and control integrations, then calls the same checks exposed by each namespace.
It never initializes a project, runs package scripts, loads application modules, downloads registries,
or changes files.

```sh
hulla doctor
hulla ui --check --cwd apps/mobile
hulla style --check --cwd apps/mobile
hulla api --check --cwd apps/server
hulla db --check --cwd apps/server
hulla control --check --cwd packages/domain
```

The examples assume the CLI is installed and available on your command path. A namespace without
`--check`, such as `hulla style`, shows help. Do not combine `--check` with a setup or generation
subcommand: use `hulla api --check`, rather than `hulla api generate --check`.

## Select the projects to inspect

At a workspace root, both `doctor` and a scoped `--check` inspect the root package and its declared
workspaces. Supported workspace declarations are a `workspaces` array or a `workspaces.packages`
array, including exclusion patterns. `--cwd apps/mobile` limits inspection to that app and its own
workspaces. From a source subdirectory, the CLI finds the nearest parent `package.json`.

Detection uses dependencies, development dependencies, peer dependencies, and recognized config
files. It does not treat every transitive dependency as an application integration. A declared
package that cannot be found locally fails; an absent integration is skipped. Optional absent peers
are skipped, but an installed optional peer must satisfy its declared range.

Installed package manifests, runtime entrypoints, declared version ranges, and peers are resolved
from the consumer's directory, including hoisted and linked dependencies. Packages are not imported.
Non-semver dependency specs, such as local paths, do not establish a version match; the installation
and entrypoint checks still run.

Use `--project-config .hulla/custom.json` for a custom project config. UI, style, db, control, and
doctor also accept its `--config` alias. On API checks, `--config` selects an optional generator
config instead. Relative option paths resolve from the invoking directory after `--cwd` is applied.
Explicit config options affect the selected project; child workspaces use their own defaults.

## What each check verifies

| Check                   | Local validation                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hulla ui --check`      | UI config schema, saved output paths, component/code-root containment, configured TypeScript files, inherited `@/*` aliases, and native UI dependencies. |
| `hulla style --check`   | Declared `@hulla/style` and optional `@hulla/style-native` installation, runtime entrypoints, and peers.                                                 |
| `hulla api --check`     | Declared `@hulla/api` packages and adapters, runtime entrypoints, peer ranges, and generator config syntax when present.                                 |
| `hulla db --check`      | `@hulla/db` installation, runtime entrypoint, peers, and `db.config.ts` syntax when present.                                                             |
| `hulla control --check` | `@hulla/control` installation, declared version, runtime entrypoint, and peers.                                                                          |

UI checks reuse the schema and project-path validation used by setup. Copied UI source does not
require the `@hulla/ui` generator package to remain installed. Its required runtime dependencies
still need to be declared in the consuming package.

API runtime/client use does not require `api.config.ts`; db package use does not require
`db.config.ts`. An explicitly selected API config must exist. Config syntax checks do not evaluate
imports, exports, credentials, callbacks, or generated output. A warning explains this boundary
when a config is present. The CLI's legacy API generator remains separate from API 2 runtime use.

These checks do not verify database/network connectivity, native binaries, application type safety,
component rendering, or web stylesheet/build-tool activation. Run the app's own checks and builds
for those behaviors. They do not execute the post-add formatter saved in the UI config.

## Use the result in CI

Each result is a pass, warning, failure, or skip, grouped by package, relative directory, and
integration. Failures include a suggested fix where possible. One failing integration does not stop
the remaining integrations or sibling workspaces from reporting.

Exit status is `0` when no check fails, including warnings or an absent integration. Failures and
discovery errors return `1`. No `--yes` flag is needed because checks never prompt.

For example, run `hulla ui --check --cwd apps/mobile` before your existing mobile typecheck/build.
It catches broken CLI configuration without replacing application validation.
