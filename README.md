# hulla

The official CLI for initializing Hulla projects, installing source components from Hulla UI
registries, and generating typed `@hulla/api` clients.

This package is beta software. Pin exact versions and use the npm `beta` channel:

```sh
bunx hulla@0.0.0-beta.1 --version
npx hulla@0.0.0-beta.1 --version
```

Do not install an unqualified `latest` while the `0.0.x-beta.N` line is active.

## Commands

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
- [Beta compatibility and release process](./docs/beta-release.md)

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
