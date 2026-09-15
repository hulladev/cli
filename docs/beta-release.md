# Beta compatibility and release process

The CLI remains `0.0.x-beta.N`. It may change configuration schemas, generated scaffolding, and
component installation behavior during beta.

Before release, formatting, linting, generated schemas, tests, build, packed help/version, local and
remote registry fixtures, init/add/remove/update/idempotency, API generation, and a self-contained
production consumer build must pass. Repository docs and changelog must be current.

Pending CLI changesets stay at patch level. Obtain explicit authorization before GitHub push, tag,
npm publish, or production deployment. `bun run release:beta` rejects non-beta versions and
major/minor changesets, then publishes with the npm `beta` dist-tag. Never publish this line to
`latest`.
