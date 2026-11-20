# hulla

CLI commands for `@hulla/*` project checks, configuration, and editable UI component installation. The executable requires Bun.

Inspect the installed release and its available commands:

```sh
bunx hulla --version
bunx hulla --help
bunx hulla ui --help
bunx hulla doctor --help
```

Help works outside a project without configuration, prompts, or installation. Append `--help` to any subcommand for its arguments and options.

## Configure once, then add components

Run `hulla ui init` from the app directory to select the registry, framework and destinations.
From another directory, use `--cwd '<app-path>'` to select that app during setup.

```sh
hulla ui init
hulla ui list
hulla ui list text
hulla ui add button
```

Setup creates `.hulla/hulla.json` for project commands and `.hulla/ui.json` for UI choices. If the
project config sets `configs.ui`, follow that path instead. Keep these files in version control;
regular adds reuse them. Agents should read the saved config before adding components, and use
setup flags only for intentional configuration changes.

Listings read families, exports and filenames from the selected registry. With no query, `list`
returns the full inventory; a query filters it. To inspect another library without saving it, use
`hulla ui list --source '<registry-url-or-path>'`. Pinning another revision of the same configured
registry retains saved destinations.

[Configuration locations and the config-to-CLI mapping](./docs/configuration.md#config-values-and-cli-inputs)
explain which values setup saves, which are config-only and which inputs apply to one command.
Configure pre/post commands in the UI config; see [UI hooks](./docs/ui-hooks.md).
Use `hulla ui init --help` or `hulla ui add --help` for individual options.

## Guides

- [UI discovery, installation, and command configuration](./docs/ui.md)
- [Project and workspace configuration](./docs/configuration.md)
- [Read-only integration checks and doctor](./docs/checks.md)
- [Website documentation](https://hulla.dev/docs/cli)

For `@hulla/api` application setup, follow the [API guides](https://github.com/hulladev/api/tree/master/docs); `hulla api --check` checks an installed integration.

Commit project/UI configuration and installed source; exclude `.hulla/.cache`.

## Install packages

`hulla install` accepts one or more `@hulla/*` packages or `hulla`, with optional versions or tags. It detects the package manager or uses your configured `cli.scripts.add` and `cli.scripts.addDev` commands. Use `--dev` (`-D`) to install tooling as development dependencies.

```sh
hulla install @hulla/db @hulla/db-postgres --cwd apps/server --scripts
hulla install @hulla/api-openapi --dev --scripts
```

Script setup offers missing entries interactively. Set `cli.install.scripts` in `.hulla/hulla.json` to `prompt` (default), `always`, or `never`. Use `--scripts` or `--no-scripts` to override it for one command. In CI, the default `prompt` mode skips scripts. Existing entries are preserved.

| Package                        | Available scripts                                             |
| ------------------------------ | ------------------------------------------------------------- |
| `@hulla/db` or `@hulla/db-cli` | `db:generate`, `db:dev`                                       |
| `@hulla/api-openapi`           | `api:openapi`                                                 |
| `@hulla/ui`                    | `ui:generate`, `ui:check` for projects that author a registry |

Pass the definition path and `--output` to `api:openapi`. Pass your registry configuration path to the UI scripts. `hulla ui add` installs editable component source into a consuming app.

## Run database tooling

When `@hulla/db` ships the CLI separately, `hulla install @hulla/db` adds the matching `@hulla/db-cli` as a dev dependency. Older releases supply `hulla-db` from `@hulla/db` itself.

`hulla db` runs the database CLI installed in the selected project. Pass it the same arguments as `hulla-db`.

```sh
hulla db generate db/server.ts --cwd apps/server
hulla db dev db/server.ts --cwd apps/server
hulla db migrate db/server.ts --check --cwd apps/server
```

Use `hulla db --check` to inspect the installed integration. Add `@hulla/db-local-postgres` as a dev dependency if you want the CLI to run a local PostgreSQL server. See the [database development guide](https://github.com/hulladev/db/blob/main/docs/browser-service.md).
