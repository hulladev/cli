---
"hulla": patch
---

Install `@hulla/*` packages and `hulla` with `hulla install`. Configure package script setup with `cli.install.scripts`, or use `--scripts` and `--no-scripts` per install. `hulla install @hulla/db` adds the matching `@hulla/db-cli` as a dev dependency for releases that ship the CLI separately. `hulla db` forwards commands to the project's installed database CLI.
