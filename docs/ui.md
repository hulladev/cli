# UI commands

These path and command options are unreleased and are not part of `hulla@0.1.0`.

Run `hulla ui add button dialog` from an existing app to configure the CLI and UI source on first
use, then install both components. You can still run `hulla ui init` separately to review setup.

## `hulla ui init`

Loads configured registries, detects supported project frameworks, selects output/code roots, and
plans copy files, TypeScript aliases/includes/references, build integration, dependencies, styles,
and fonts. A registry must mark a copied CSS file with `globalStyle: true` before the CLI activates
it. For Astro hosts the CLI configures Tailwind through `astro.config.*` and imports the stylesheet
from an Astro entrypoint; standalone React and Solid Vite projects receive the Tailwind plugin, an
absolute `@` alias, and an entrypoint import. Existing files are diffed before overwrite. Multiple
frameworks may share one project `tsconfig.json`; the CLI must never add that file as its own
project reference.

Expo and React Native dependencies select the `react-native` registry template by default, rather
than the web `react` template. Framework choices remain editable; in a workspace with separate web
and native apps, detection still recognizes both. Run initialization from the intended app directory.

Native-only installs skip the web class-composer prompt and do not add composer dependencies,
configure Vite/Tailwind, or activate CSS entrypoint imports. Native TypeScript setup only proposes a
missing `@/*` alias for the selected code root. It preserves an existing alias, `extends` (including
`expo/tsconfig.base`), compiler options, includes such as `.expo/types/**/*.ts` and `expo-env.d.ts`,
and exclusions. It does not merge the registry's generic TypeScript template into a native app.

Astro applications should keep the activated stylesheet import in a shared layout. A one-page
starter without a layout is wired through `src/pages/index.astro`; move that import when introducing
additional page layouts so every route receives the theme.

The installer does not configure Markdown or MDX component maps. Those are renderer-specific and
remain an explicit application concern.

### Choose paths without the picker

```sh
hulla ui init --cwd apps/web --source ./registry --framework react \
  --code-root src --components-root src/components/ui --copy-root src --yes
```

`--cwd` is resolved from the invoking directory. All other relative paths resolve from that app;
`--source ./registry` above means `apps/web/registry`. The three output roots must be project-relative
directories, and the component root must be inside the code root. Missing intermediate directories
are created. Interactive input uses the same validation and does not require a suggestion match.

Without path flags, setup reuses saved paths or detects the code root and defaults components to
`<code-root>/components` and support files to `<code-root>`. An explicit framework skips framework
selection, including on first `ui add`. The choices are persisted for later adds. A source flag
replaces the saved source list; use the config file for multiple registries.

## `hulla ui add`

```sh
hulla ui add --yes --framework astro button dialog tabs
```

Passing a source or output-root flag to `add` first reruns setup. Existing files in an old output
root stay there; this is configuration, not a migration.

Resolves component manifests, dependencies, aliases, copy/support files, and target paths. Existing
files are updated with visible diffs. Repeating the same command against the same immutable
registry must produce no meaningful change.

## `hulla ui remove`

Removes selected installed component files. Shared support files and dependencies may still belong
to other components, so removal is conservative; inspect the result and run the application checks.

## Sources

Use a local generated registry for private dogfood and an immutable GitHub release tag for public
consumption. Never import the registry directly from application code. Installed application source
must build after the registry and CLI are unavailable.
