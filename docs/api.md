# API commands

## `hulla api init`

Detects Next, Hono, Elysia, Express, Nest, Deno, or Bun and Drizzle configuration. It creates only
missing files: `api.config.ts`, a `createApi` instance, a Fetch handler, and a framework mount. It
never overwrites existing API files. Bulk Drizzle CRUD exposure requires explicit confirmation and
uses `fromDrizzle({ routes: 'all' })`.

## `hulla api generate`

Finds the config referenced by `.hulla/hulla.json` (or a supplied config), compiles TypeScript in an
isolated `.hulla/.cache/api` worker, verifies the `hulla.api.client-config` marker, and calls the
installed `@hulla/api` `runGenerateConfig`. Generation owns its output directory and entry file.

## `hulla api dev`

Runs initial generation, then watches the configuration and every exact input/glob reported by API
sources. A config change reloads the worker; a source change regenerates. Output paths are excluded
from discovery to prevent loops.

## Sources and outputs

Router discovery imports matching modules. Custom `APISource` implementations report inputs,
globs, output files, client/server factories, contracts, transport, and collection metadata. Keep
discovered modules side-effect free. Generation is atomic; never mix hand-authored files into its
owned directory.
