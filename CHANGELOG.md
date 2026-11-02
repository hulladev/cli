# hulla

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
