# CI and non-interactive use

The one-command setup and path flags below require the unreleased command improvements.

Pass `--yes` to prohibit prompts. If a required choice is ambiguous, the command fails with a
corrective message instead of guessing; pass flags such as `--framework` and explicit components.

Recommended gates:

```sh
hulla ui add button dialog --yes --framework astro --components-root src/components/ui
hulla api generate --yes
git diff --exit-code
bun run check
bun run build
```

For CLI/UI release fixtures, install package tarballs into isolated directories and invoke their
installed `node_modules/.bin` executables. Do not use workspace source entrypoints and do not write
tracked `file:` dependencies. Run commands twice and compare output hashes for idempotency.

The cache lives under the configured `cacheDir` and may be deleted between CI jobs. Correctness must
not depend on a warm cache. Keep cache/output directories out of source discovery and version
control unless generated application source is deliberately committed.
