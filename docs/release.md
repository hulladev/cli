# Compatibility and release process

The current stable line is `0.1.x`. Pin exact CLI and registry versions so source
installation and API generation remain reproducible.

Before release, formatting, linting, generated schemas, tests, build, packed
help/version, registry fixtures, install/update/idempotency, API generation, and
a self-contained production consumer build must pass. Keep documentation and
the changelog current.

Use Changesets to version releases. When leaving prerelease mode, run
`changeset pre exit` followed by `changeset version`. The resulting release must
have a non-prerelease version and no `.changeset/pre.json` file.

Obtain explicit authorization before GitHub pushes, tags, npm publication, or
production deployment. Publish with `bun run release`, which verifies the
repository, checks the stable release state, and publishes to npm's `latest` tag.

To roll back, install the prior exact CLI version and regenerate from its matching
immutable registry revision. Review and test the resulting source diff.
