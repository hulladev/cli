# hulla

## 0.2.0

### Minor Changes

- d2df5a2: Add read-only integration-owned `--check` commands for UI, style, API, db, and control. Add a thin
  `doctor` coordinator that detects declared integrations across workspaces and runs the same checks.
  Report local package/peer compatibility, UI paths and inherited TypeScript aliases, and optional
  API/db config syntax without prompts, project-code evaluation, network access, or file changes.
  Return a failing exit status when checks fail, while continuing other integrations and workspaces.
- d2a2a40: Fix typed nested directory selection, validate project-relative output paths, and add explicit UI
  source/framework/output flags. Support one-command UI setup and add, workspace targeting with
  `--cwd`, consistent shared options, and side-effect-free command help. Resolve project config and
  cache paths against the selected project, keep generated schema defaults portable, and report
  reserved commands instead of returning a misleading success.

### Patch Changes

- 11c7ff3: Identify CLI output using its published npm package name, `hulla`.

- b40c11f: Show contextual `--help` and `-h` for every command and alias before project
  configuration or setup. Generate usage, subcommands, arguments, and options from
  the command registry so help stays aligned with the CLI.
- 46b9fc6: Use stable `@hulla/args`, `@hulla/control`, and `@hulla/gittar` releases with current validation and cache behavior, and verify against the stable UI generator.
- f4ab8e5: Keep the generated cache directory default relative and resolve cache paths from the selected project's config location at runtime. Preserve custom relative cache paths when saving configuration so worktrees and other checkouts do not inherit another checkout's absolute cache path.
- 0b6cab1: Typecheck CLI source and tests during verification using Bun-compatible module resolution; accept schema input when writing project configuration.
- 2ff2a50: Detect the containing workspace's package manager during project initialization and UI formatter
  selection, and resolve hoisted formatter binaries. Report detection sources and stale lockfiles;
  reject ambiguous lockfiles and missing manager evidence in non-interactive initialization instead
  of silently selecting npm. Keep application install targets and existing custom scripts intact.
  Use pnpm/Yarn dlx for uninstalled formatters and exec for declared tools; keep Yarn Classic on
  exec because it does not support dlx. Preserve formatter previews for these command forms.

## 0.1.0

### Minor Changes

- Publish the first stable CLI release with a guarded latest-channel workflow.
  Bundle @hulla/gittar 0.0.5 so UI installation refreshes stale repository caches
  when a registry is pinned to a full commit SHA.

### Patch Changes

- 50f5882: Add `hulla api init`, generic API source generation, isolated dev regeneration, declared-input watching, and compiled TypeScript config loading.
- ebef876: Install source component dependencies recursively during `hulla ui add`, so composed components
  such as native date and time pickers include the families they import. Keep dependencies within
  the selected framework and source, deduplicate cycles, reject imports that escape that source,
  and preserve the existing review and overwrite behavior for customized files.
- 10bfc1e: Activate registry-declared global styles during `hulla ui init`, configure Tailwind 4 through Astro
  or Vite, generate a valid absolute `@` alias for standalone React and Solid projects, and keep all
  updates idempotent.

## 0.0.0-beta.2

### Patch Changes

- 50f5882: Add `hulla api init`, generic API source generation, isolated dev regeneration, declared-input watching, and compiled TypeScript config loading.
- ebef876: Install source component dependencies recursively during `hulla ui add`, so composed components
  such as native date and time pickers include the families they import. Keep dependencies within
  the selected framework and source, deduplicate cycles, reject imports that escape that source,
  and preserve the existing review and overwrite behavior for customized files.
- 10bfc1e: Activate registry-declared global styles during `hulla ui init`, configure Tailwind 4 through Astro
  or Vite, generate a valid absolute `@` alias for standalone React and Solid projects, and keep all
  updates idempotent.

## 0.0.0-beta.1

### Patch Changes

- Added `hulla api init`, `generate`, and `dev` lifecycle commands.
- Added local generated-registry support for private packed-package dogfooding.
- Added idempotent Astro/Solid source installation and consumer-root alias rewriting.
- Prevented shared multi-framework `tsconfig.json` selections from creating self-references.
- Kept publication restricted to the npm `beta` dist-tag.

## 0.0.0

### Patch Changes

- local source ui libs
