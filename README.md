# hulla

The official CLI for initializing projects, installing source components from `@hulla/ui`
registries, and generating typed `@hulla/api` clients.

Pin exact versions for reproducible tooling. Stable releases use npm's `latest` channel:

```sh
bunx hulla@0.1.0 --version
npx hulla@0.1.0 --version
```

Review configuration and installed-source changes when upgrading.

## Commands

The command and path improvements below are unreleased; `hulla@0.1.0` does not include them yet.

| Command                         | Purpose                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `hulla init`                    | Detect the project and create `.hulla/hulla.json`                                |
| `hulla ui init`                 | Configure a UI registry, frameworks, aliases, support files, and dependencies    |
| `hulla ui add [components…]`    | Install or update component source                                               |
| `hulla ui remove [components…]` | Remove selected installed component source                                       |
| `hulla api init`                | Scaffold a framework adapter and API generation config without overwriting files |
| `hulla api generate`            | Load and run the configured `@hulla/api` generator                               |
| `hulla api dev`                 | Generate once and watch declared source inputs                                   |

Use a verb after each namespace: `ui add`, `ui remove`, `ui init`, or `api init/generate/dev`.
`hulla`, `hulla ui`, and `hulla api` show help without setting up a project. Use `-h`/`--help`
at any command level; `-v`/`--version` prints the CLI version.

## First component

Run from an existing app directory. The first add configures the project and UI registry before
installing the requested components; separate `init` commands are optional.

```sh
hulla ui add button dialog
```

Setup saves the registry, framework targets, and paths. Later adds reuse them. For a workspace app,
run from the repository root without changing directories:

```sh
hulla ui add button dialog --cwd apps/mobile --framework react-native
```

Use explicit setup options when the defaults do not match your layout:

```sh
hulla ui add button --source ./registry --framework react \
  --code-root src --components-root src/components/ui --yes
```

`--source` replaces the configured source list with that one registry. Passing a setup option on
`ui add` reruns UI configuration before adding; changing an output root does not move old files.
`--copy-root` selects the support-file destination and defaults to the code root. Paths are
project-relative; existing directories and new nested paths are accepted. Traversal outside the
project, file paths, and control characters are rejected.

`--yes` prohibits prompts and accepts confirmations, including overwrites and removal. Supply
component names and an explicit `--framework` if detection is ambiguous. Use `--project-config`
to choose a project config. The older `--config` spelling remains supported for UI and project
setup; on API commands it selects the generator config. Relative options resolve from `--cwd`
(or the current directory). Shared options work before or after the relevant subcommand.

`hulla install` and `init --clean` are reserved and fail with an explanation; use your package
manager for package installation. The existing API generator commands are legacy and require a
compatible API package; this change does not migrate them to `@hulla/api` 2.0.

Commit `.hulla/hulla.json`, `.hulla/ui.json`, and installed/generated application source. Never
commit `.hulla/.cache`.

## Documentation

- [Project and UI configuration](./docs/configuration.md)
- [UI registry commands](./docs/ui.md)
- [API generation commands](./docs/api.md)
- [CI and non-interactive use](./docs/ci.md)
- [Troubleshooting, upgrade, and rollback](./docs/troubleshooting.md)
- [Compatibility and release process](./docs/release.md)

## AI agent guidance

The [@hulla/\* skills repository](https://github.com/hulladev/skills) contains consumer guidance for the packages your application uses, including `ui` for installed components and `api` for API architecture.

```sh
npx skills add hulladev/skills
```

This uses the external `skills` CLI. Choose the relevant skills and your coding agent, then follow the [installation and compatibility guide](https://hulla.dev/docs/cli/agent-skills).

## Development

Requires Bun 1.3.9 and Node.js 20 or newer.

```sh
bun install --frozen-lockfile
bun run verify
npm pack
```

Production-readiness checks install the tarball in an isolated directory and run that packed binary
against fixture projects and a real consumer. Source execution alone is not a release substitute.

### UI class composer

`hulla ui init` asks which class composer to use for `@hulla/ui`: `cn` (the default)
or `tailwind-merge`. Both keep `@hulla/style` as the public styling utility.
The choice is saved as `composer` on the library install in `.hulla/ui.json` and
controls the copied `lib/style.ts` helper and its runtime dependency. `--yes` uses
the saved choice, or `cn` for a new install. To switch, rerun `hulla ui init` and
allow the shared helper to be overwritten. Other UI libraries keep their own helpers
and dependencies.
