# UI commands

Use `hulla ui --help` to inspect commands available in the installed release.

Configure the registry, framework and destination paths once, then reuse the saved choices:

```sh
hulla ui init
hulla ui list
hulla ui add button
```

Setup writes `.hulla/hulla.json` and the UI config selected by its `configs.ui` value (default:
`.hulla/ui.json`). Read these files before changing setup options. See
[configuration locations and the config-to-CLI mapping](./configuration.md#config-values-and-cli-inputs).
An unconfigured first add can also run setup, but a separate init makes the configuration reviewable
before copying components. Routine adds need family names and only ambiguous framework selections.

## `hulla ui list [query…]`

Inspect the selected registry before deciding what to install. `search` and `ls` are aliases for
`list`; a query matches family names, source exports, and filenames, case-insensitively.

```sh
hulla ui list --framework react-native
hulla ui list text --framework react-native
hulla ui list --source ./my-registry --framework react
```

Discovery uses the configured library installs, or fetches configured/default sources through
`@hulla/gittar` when no installs exist. An explicit `--source` inspects that source without saving it.
It reads the registry's `ui.config.ts` and component files, reports source exports and filenames,
and prints install commands. An unconfigured source/framework also gets a setup command to run once. It does not execute component modules, initialize
the application, install dependencies, or copy component files. Remote discovery may download/cache
the registry. Pin a source revision when the result must be repeatable.

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
hulla ui init --cwd '<app-path>' --source ./registry --framework react \
  --code-root src --components-root src/components/ui --copy-root src --yes
```

`--cwd` is resolved from the invoking directory. All other relative paths resolve from that app;
`--source ./registry` above means `<app-path>/registry`. The three output roots must be project-relative
directories, and the component root must be inside the code root. Missing intermediate directories
are created. Interactive input uses the same validation and does not require a suggestion match.

Without path flags, setup reuses saved paths or detects the code root and defaults components to
`<code-root>/components` and support files to `<code-root>`. An explicit framework skips framework
selection, including on first `ui add`. The choices are persisted for later adds. Configure source/framework/paths once, then prefer short
commands such as `hulla ui add button --yes`. Changing only a remote revision reuses the saved
install for the same repository, registry subdirectory and library name. Its destinations, composer
and TypeScript config paths remain authoritative; different repositories/subdirectories stay separate.
Setup prints the resolved source and destination plan. Explicit root flags intentionally change roots.
A missing saved TypeScript config fails with guidance instead of selecting another detected config. A source flag
replaces the saved source list; use the config file for multiple registries.

### Run project commands around UI changes

Save general-purpose `hooks.pre` and `hooks.post` arrays in `.hulla/ui.json`. They run before and
after successful `init`, `add`, and `remove` operations from the app root. Examples include checks,
code generation and formatting; choose commands that fit the project. Ordinary post hooks run once
after success, including a successful no-change operation. File commands are skipped with no files.

```json
{
  "hooks": {
    "pre": ["bun run ui:prepare"],
    "post": [
      { "command": "bun run format:files {files}", "preview": true },
      "bun run typecheck"
    ]
  }
}
```

`{files}` supplies shell-quoted changed UI/configuration paths to post commands. `preview: true`
explicitly opts a file-processing command into running on temporary incoming copies before diffing.
Ordinary commands never run during previews. Pre hooks run before file selection and cannot use
`{files}`. A failed hook stops the sequence; post failure does not undo the completed file changes.

`--post-add-command '<command>'` saves one ordinary post hook; `{files}` is optional. Use `none` to
disable post hooks. See [hook timing and environment](./ui-hooks.md) for the full interface.

### Reuse workspace development dependencies

Both setup and component adds read the registry's dependency declarations. A development dependency
already supplied by the app's declared workspace root is reused when its installed version satisfies
the requirement. Without an installed version, an identical declaration, unconstrained requirement,
or compatible exact version can be reused. Unverifiable or incompatible root requirements fail with
the package name and manifest path; the installer does not silently update the workspace root.

This applies to any library-declared development dependency, without deciding which packages are
formatters or typecheckers. Runtime dependencies remain app-local. Existing app declarations take
precedence, and unrelated parent packages cannot supply tools. A registry with JavaScript source
and no TypeScript dependency or config template does not cause the CLI to add TypeScript. Choosing
a typed registry does not convert its source to JavaScript.

## `hulla ui add`

```sh
hulla ui add --yes --framework astro button dialog tabs
```

Passing a source or output-root flag to `add` first reruns setup. Existing files in an old output
root stay there; move them explicitly if needed.

Resolves component manifests, dependencies, aliases, copy/support files, and target paths. Existing
files are updated with visible diffs. Repeating the same command against the same immutable
registry must produce no meaningful change.

Unknown requested families fail before component copying, including mixed valid/invalid requests.
The error suggests source-derived matches and the discovery command; it never silently substitutes
an export name for a family name. First-use setup validates names after library/framework selection,
before writing aliases or bootstrap files and installing dependencies. Project configuration and empty
destination directories may already exist.

## `hulla ui remove`

Removes selected installed component files. Shared support files and dependencies may still belong
to other components, so removal is conservative; inspect the result and run the application checks.

## Sources

Use a local generated registry for private dogfood and an immutable GitHub release tag for public
consumption. Never import the registry directly from application code. Installed application source
must build after the registry and CLI are unavailable.

### Component support files

Registries can publish generated `components` metadata for copied support files. Initialization
copies bootstrap files; `ui add` copies required support files whose consumer list contains an
added family. The generator's list includes transitive support dependencies. Files without that
metadata retain the existing behavior. Existing support files are preserved, and relocated support
imports use the same alias mapping as installed component files.
