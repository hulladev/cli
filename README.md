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

Use `hulla --help` to list commands, or append `--help` (or `-h`) to any command
for its usage, aliases, arguments, and options. Help works outside a project and
does not load configuration, prompt, or install anything.

```sh
hulla init --help
hulla api generate --help
hulla ui add --help
```

| Command                         | Purpose                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `hulla init`                    | Detect the project and create `.hulla/hulla.json`                                |
| `hulla ui init`                 | Configure a UI registry, frameworks, aliases, support files, and dependencies    |
| `hulla ui add [components…]`    | Install or update component source                                               |
| `hulla ui remove [components…]` | Remove selected installed component source                                       |
| `hulla api init`                | Scaffold a framework adapter and API generation config without overwriting files |
| `hulla api generate`            | Load and run the configured `@hulla/api` generator                               |
| `hulla api dev`                 | Generate once and watch declared source inputs                                   |

Use `--yes` for non-interactive execution, `--config <path>` to select a project config, and
`--framework <name>` when a UI component exists in multiple installed targets.

## First project

```sh
hulla init --yes
hulla ui init
hulla ui add --framework astro button dialog tabs
hulla api init
hulla api generate
```

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
