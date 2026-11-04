# Compatibility and release process

The current stable line is `0.2.x`. Pin exact CLI and registry versions so source
installation and API generation remain reproducible.

Run `bun run verify` for formatting, lint, type checking, generated schema drift,
unit/integration tests, and the CLI build. Use targeted packed-CLI and consumer
checks when changing installation or API generation behavior; keep documentation
and the changelog current.

Use `bun run changeset` to describe the change. The release workflow opens a version
PR containing package versions, changelogs, the lockfile and an explicit release plan.
Review and merge that PR to publish through npm OIDC. `bun run release` is a CI-only
publication entry point. See [the release workflow](./releasing.md) for setup and retries.

After fresh registry verification, the workflow creates the immutable version tag.
GitHub Release announcements are disabled unless explicitly enabled separately.
Obtain authorization before pushes, tags, npm publication or production deployment.

To roll back, install the prior exact CLI version and regenerate from its matching
immutable registry revision. Review and test the resulting source diff.
