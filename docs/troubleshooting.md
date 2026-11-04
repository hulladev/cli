# Troubleshooting, upgrade, and rollback

The upcoming CLI release includes `hulla doctor` for local integration diagnostics and
`hulla ui --check` for the UI check alone. They are not included in `hulla@0.1.0`.
Use `--cwd apps/mobile` to select a workspace app. See [integration checks](./checks.md)
for what each check validates and the exit statuses to use in CI.

## Common failures

- **Prompt required with `--yes`:** pass the missing component, framework, config, or source choice.
- **Registry unavailable:** verify the path/tag and that `ui.config.ts` plus the manifest exist.
- **`@/src/...` in installed code:** the registry source root was not rewritten to the consumer code
  root; update the CLI and regenerate.
- **TypeScript self-reference:** remove a `references` entry pointing at its own config and use a CLI
  containing the shared-config fix.
- **Generated API config rejected:** align the packed CLI with the matching `@hulla/api` version.
- **Stale UI cache:** remove the configured `.hulla/.cache` and rerun against an immutable source.
- **Copied components are unstyled:** verify the registry marks its theme CSS as `globalStyle`, the
  host config contains `@tailwindcss/vite`, and the application entrypoint imports the copied CSS.
  Markdown/MDX output also needs an application-owned component map or explicit components.

## Upgrade

Commit installed/generated source, install an exact newer version, regenerate through the new packed
CLI, inspect diffs, and run formatting, types, browser tests, and production builds. Upgrade
`@hulla/ui` first, `hulla` second, then matching API packages.

## Rollback

Reinstall the prior exact version and regenerate from its immutable registry tag. Restore the matching
API packages and contract output together. Do not hand-revert only part of generated output.
