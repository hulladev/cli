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

## Discover component source

Run from the app directory, or select an app with `--cwd apps/mobile`:

```sh
hulla ui list --framework react-native
hulla ui search text --framework react-native
hulla ui add --help
```

Listings read the selected registry and include install commands. Use `--source <URL-or-directory>` to inspect another library without configuring the app. Pin a registry revision when the input must be repeatable.

During setup, `--post-add-command '<command> {files}'` records the project's exact changed-file command; `none` disables it. The CLI does not infer a formatter from dependency names. See the UI guide for staged comparisons and workspace development-dependency reuse.

## Guides

- [UI discovery, installation, and command configuration](./docs/ui.md)
- [Project and workspace configuration](./docs/configuration.md)
- [Read-only integration checks and doctor](./docs/checks.md)
- [Website documentation](https://hulla.dev/docs/cli)

`api init/generate/dev` target the legacy API generator. For `@hulla/api` 2.x application setup, follow the [API guides](https://github.com/hulladev/api/tree/master/docs); `hulla api --check` checks an installed integration.

Commit project/UI configuration and installed source; exclude `.hulla/.cache`.
