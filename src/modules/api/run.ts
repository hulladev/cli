import { commandOk } from "@/app/result"
import type { CommandContext, ParserNode } from "@/app/types"
import { resolveAbsolute } from "@/platform/fs/bun"
import { confirm } from "@/terminal/prompts/confirm"
import { log } from "@/terminal/prompts/log"
import { existsSync, watch } from "node:fs"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import { pathToFileURL } from "node:url"

type ApiConfigKind = "hulla.api.client-config"

type ApiConfig = {
  $hulla?: {
    kind?: ApiConfigKind
  }
}

export async function runApi({
  context,
  result,
}: {
  context: CommandContext
  result: ParserNode
}) {
  const mode = result.commands.init?.detected
    ? "init"
    : result.commands.generate?.detected
      ? "generate"
      : result.commands.dev?.detected
        ? "dev"
        : "generate"
  const explicitConfig = explicitConfigPath(context, result)

  if (mode === "init") {
    return runApiInit(projectRootFromHullaConfig(context.config.path))
  }

  if (mode === "dev") {
    const projectRoot = projectRootFromHullaConfig(context.config.path)
    const configPaths =
      explicitConfig === undefined
        ? await discoverApiConfigPaths(projectRoot)
        : [explicitConfig]
    const outputs = await runApiConfigsIsolated(configPaths)

    log.info("API dev is watching for changes.")
    await watchApiConfigs(projectRoot, configPaths, outputs)

    return commandOk("API dev generated", outputs)
  }

  const configPath = resolveApiConfigPath(context, result)
  const loaded = await loadApiConfig(configPath)
  const output = await runApiConfig(
    loaded.config,
    {
      cwd: dirname(configPath),
      configPath,
    },
    loaded.runGenerateConfig
  )

  return commandOk("API generated", output)
}

function resolveApiConfigPath(
  context: CommandContext,
  result: ParserNode
): string {
  const explicitConfig = explicitConfigPath(context, result)
  const projectRoot = projectRootFromHullaConfig(context.config.path)
  const configured = context.config.configs?.api ?? "api.config.ts"
  const candidates = [
    explicitConfig === undefined
      ? undefined
      : resolveAbsolute(process.cwd(), explicitConfig),
    resolve(projectRoot, configured),
    join(process.cwd(), "api.config.ts"),
  ].filter((candidate): candidate is string => candidate !== undefined)
  const found = candidates.find((candidate) => existsSync(candidate))

  if (found === undefined) {
    throw new Error(
      `Could not find api.config.ts. Checked: ${candidates.join(", ")}`
    )
  }

  return found
}

function explicitConfigPath(
  context: CommandContext,
  result: ParserNode
): string | undefined {
  const explicitConfig =
    typeof result.arguments.config?.value === "string"
      ? result.arguments.config.value
      : typeof context.parserResult.arguments.config?.value === "string"
        ? context.parserResult.arguments.config.value
        : undefined

  return explicitConfig === undefined
    ? undefined
    : resolveAbsolute(process.cwd(), explicitConfig)
}

function projectRootFromHullaConfig(configPath: string): string {
  const configDir = dirname(configPath)

  return configDir.endsWith(".hulla") ? dirname(configDir) : configDir
}

async function loadApiConfig(path: string): Promise<{
  config: ApiConfig
  runGenerateConfig: (
    config: unknown,
    options: { cwd: string; configPath: string }
  ) => Promise<unknown>
}> {
  const modulePath = await compileApiConfig(path)
  const module = (await import(
    `${pathToFileURL(modulePath).href}?t=${Date.now()}`
  )) as {
    default?: unknown
    __runGenerateConfig?: (
      config: unknown,
      options: { cwd: string; configPath: string }
    ) => Promise<unknown>
  }
  const config = module.default

  if (typeof config !== "object" || config === null) {
    throw new Error(
      `API config at ${path} must export a default config object.`
    )
  }

  if (typeof module.__runGenerateConfig !== "function") {
    throw new Error(
      `Compiled API config at ${path} does not export its generator.`
    )
  }
  return {
    config: config as ApiConfig,
    runGenerateConfig: module.__runGenerateConfig,
  }
}

async function compileApiConfig(path: string): Promise<string> {
  const outdir = join(dirname(path), ".hulla", ".cache", "api")
  await mkdir(outdir, { recursive: true })
  const entry = join(outdir, `entry-${Bun.hash(path)}.ts`)
  await writeFile(
    entry,
    `import config from ${JSON.stringify(path)}\nexport { runGenerateConfig as __runGenerateConfig } from '@hulla/api'\nexport default config\n`
  )
  const build = await Bun.build({
    entrypoints: [entry],
    outdir,
    target: "bun",
    format: "esm",
    packages: "external",
    naming: `config-bundle-${Bun.hash(path)}.[ext]`,
  })
  if (!build.success || !build.outputs[0]) {
    throw new Error(
      build.logs.map((entry) => entry.message).join("\n") ||
        `Could not compile API config at ${path}.`
    )
  }
  return build.outputs[0].path
}

async function runApiConfigsIsolated(
  paths: readonly string[]
): Promise<unknown[]> {
  const outputs: unknown[] = []
  for (const path of paths) outputs.push(await runApiConfigWorker(path))
  return outputs
}

export async function runApiConfigWorker(configPath: string): Promise<unknown> {
  configPath = resolve(configPath)
  const source = `
    import { dirname, join } from 'node:path'
    import { pathToFileURL } from 'node:url'
    self.onmessage = async ({ data }) => {
      try {
        const outdir = join(dirname(data), '.hulla', '.cache', 'api')
        const entry = join(outdir, 'entry-worker.ts')
        await Bun.write(entry, 'import config from ' + JSON.stringify(data) + '\\nexport { runGenerateConfig as __runGenerateConfig } from "@hulla/api"\\nexport default config\\n')
        const build = await Bun.build({
          entrypoints: [entry],
          outdir,
          target: 'bun',
          format: 'esm',
          packages: 'external',
          naming: 'config-worker-bundle.[ext]',
        })
        if (!build.success || !build.outputs[0]) throw new Error(build.logs.map((entry) => entry.message).join('\\n') || 'Could not compile API config.')
        const module = await import(pathToFileURL(build.outputs[0].path).href + '?t=' + Date.now())
        const config = module.default
        if (config?.$hulla?.kind !== 'hulla.api.client-config') throw new Error('Unknown API config.')
        const cwd = dirname(data)
        const result = await module.__runGenerateConfig(config, { cwd, configPath: data })
        postMessage({ ok: true, result })
      } catch (error) {
        postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    }
  `
  const workerDir = join(dirname(configPath), ".hulla", ".cache", "api")
  const workerPath = join(workerDir, `worker-${Bun.hash(configPath)}.mjs`)
  await mkdir(workerDir, { recursive: true })
  await writeFile(workerPath, source)
  const worker = new Worker(pathToFileURL(workerPath).href)
  return new Promise((resolve, reject) => {
    worker.onmessage = (
      event: MessageEvent<{ ok: boolean; result?: unknown; error?: string }>
    ) => {
      worker.terminate()
      if (event.data.ok) resolve(event.data.result)
      else
        reject(new Error(event.data.error ?? "API generation worker failed."))
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message))
    }
    worker.postMessage(configPath)
  })
}

async function watchApiConfigs(
  root: string,
  initialPaths: string[],
  initialOutputs: unknown[]
): Promise<void> {
  let configPaths = initialPaths
  let watchScope = createWatchScope(initialPaths, initialOutputs)
  let timer: Timer | undefined
  const watcher = watch(root, { recursive: true }, (_event, filename) => {
    if (
      filename === null ||
      !watchScope.matches(resolve(root, String(filename)))
    ) {
      return
    }

    if (timer !== undefined) {
      clearTimeout(timer)
    }

    timer = setTimeout(() => {
      void (async () => {
        try {
          configPaths = await discoverApiConfigPaths(root)
          const outputs = await runApiConfigsIsolated(configPaths)
          watchScope = createWatchScope(configPaths, outputs)
          log.info("API regenerated.")
        } catch (error) {
          log.error(error instanceof Error ? error.message : String(error))
        }
      })()
    }, 100)
  })

  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => {
      watcher.close()
      resolve()
    })
  })
}

async function discoverApiConfigPaths(root: string): Promise<string[]> {
  const found: string[] = []
  await visit(root)

  if (found.length === 0) {
    throw new Error(`Could not find any api.config.ts files under ${root}`)
  }

  return found.sort()

  async function visit(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const path = join(dir, entry.name)

      if (entry.isDirectory()) {
        if ([".git", ".hulla", "dist", "node_modules"].includes(entry.name)) {
          continue
        }

        await visit(path)
        continue
      }

      if (entry.isFile() && entry.name === "api.config.ts") {
        found.push(path)
      }
    }
  }
}

async function runApiConfig(
  config: ApiConfig,
  options: {
    cwd: string
    configPath: string
  },
  runGenerateConfig: (
    config: unknown,
    options: { cwd: string; configPath: string }
  ) => Promise<unknown>
) {
  switch (config.$hulla?.kind) {
    case "hulla.api.client-config": {
      const generated = await runGenerateConfig(config, {
        cwd: options.cwd,
        configPath: options.configPath,
      })
      await assertFrameworkCompatibility(options.cwd, generated)
      return generated
    }
    default:
      throw new Error(
        "Unknown API config. Expected a config returned by generate() from @hulla/api."
      )
  }
}

export async function assertFrameworkCompatibility(
  cwd: string,
  generated: unknown
): Promise<void> {
  const packageJson = await readJson(join(cwd, "package.json"))
  if (!packageJson.dependencies?.next && !packageJson.devDependencies?.next)
    return

  for (const source of (generated as GenerateResult).sources ?? []) {
    const contractPath = source.outputs?.contract
    if (!contractPath) continue
    const contract = JSON.parse(await readFile(contractPath, "utf8"))
    if (containsQueryMethod(contract)) {
      throw new Error(
        "Next App Router cannot expose HTTP QUERY routes. Choose another method or mount the handler outside Next."
      )
    }
  }
}

function containsQueryMethod(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsQueryMethod)
  if (typeof value !== "object" || value === null) return false
  const object = value as Record<string, unknown>
  if (object.method === "QUERY") return true
  return Object.values(object).some(containsQueryMethod)
}

type GenerateResult = {
  outputDir?: string
  sources?: readonly {
    inputs?: readonly string[]
    inputGlobs?: readonly string[]
    outputs?: Record<string, string>
  }[]
}

function createWatchScope(
  configPaths: readonly string[],
  outputs: readonly unknown[]
) {
  const exactInputs = new Set(configPaths.map((path) => resolve(path)))
  const outputRoots: string[] = []
  const globRoots: string[] = []

  for (const output of outputs as GenerateResult[]) {
    if (output.outputDir) outputRoots.push(resolve(output.outputDir))
    for (const source of output.sources ?? []) {
      for (const input of source.inputs ?? []) exactInputs.add(resolve(input))
      for (const generated of Object.values(source.outputs ?? {}))
        outputRoots.push(resolve(generated))
      for (const glob of source.inputGlobs ?? [])
        globRoots.push(resolve(dirname(configPaths[0]!), globPrefix(glob)))
    }
  }

  return {
    matches(path: string) {
      const absolute = resolve(path)
      if (
        absolute.includes(`${join("", "node_modules")}`) ||
        absolute.includes(`${join("", ".git")}`)
      )
        return false
      if (
        outputRoots.some(
          (root) => absolute === root || absolute.startsWith(`${root}/`)
        )
      )
        return false
      return (
        exactInputs.has(absolute) ||
        globRoots.some(
          (root) => absolute === root || absolute.startsWith(`${root}/`)
        )
      )
    },
  }
}

function globPrefix(pattern: string): string {
  const index = pattern.search(/[*{]/)
  return index === -1 ? dirname(pattern) : dirname(pattern.slice(0, index))
}

type ApiFramework =
  | "next"
  | "hono"
  | "elysia"
  | "express"
  | "nest"
  | "bun"
  | "deno"
  | "fetch"

export async function createApiInitPlan(
  root: string,
  options: { bulkDrizzleRoutes?: boolean } = {}
): Promise<{
  framework: ApiFramework
  files: readonly { path: string; content: string }[]
}> {
  const packageJson = await readJson(join(root, "package.json"))
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  }
  const framework: ApiFramework = dependencies["next"]
    ? "next"
    : dependencies["@nestjs/common"]
      ? "nest"
      : dependencies["hono"]
        ? "hono"
        : dependencies["elysia"]
          ? "elysia"
          : dependencies["express"]
            ? "express"
            : existsSync(join(root, "deno.json")) ||
                existsSync(join(root, "deno.jsonc"))
              ? "deno"
              : "bun"
  const sourceFiles = await findSourceFiles(root)
  const dbFile = await findExport(
    sourceFiles,
    /export\s+(?:const|let|var)\s+db\b/
  )
  const apiFile = await findExport(
    sourceFiles,
    /export\s+const\s+api\s*=\s*createApi\s*\(/
  )
  const serverPath = join(root, "src/api/hulla.ts")
  const dbImport = dbFile ? importPath(serverPath, dbFile) : "../db"
  const apiImport = apiFile ? importPath(serverPath, apiFile) : "./api"
  const configPath = join(root, "api.config.ts")
  const files: { path: string; content: string }[] = []
  const hasDrizzle = Boolean(
    dependencies["drizzle-orm"] || existsSync(join(root, "drizzle.config.ts"))
  )
  const hasRouter = sourceFiles.some((file) => file.endsWith(".router.ts"))

  if (hasDrizzle && !dbFile) {
    throw new Error(
      "hulla api init found Drizzle but could not find an exported `db` instance."
    )
  }

  if (!existsSync(configPath)) {
    files.push({
      path: configPath,
      content: [
        "import { generate } from '@hulla/api'",
        ...(options.bulkDrizzleRoutes
          ? ["import { fromDrizzle } from '@hulla/api-drizzle/config'"]
          : []),
        "",
        "export default generate({",
        "  routers: { dir: './src/api', include: ['**/*.router.ts'] },",
        ...(options.bulkDrizzleRoutes
          ? ["  sources: [fromDrizzle({ routes: 'all' })],"]
          : []),
        "  output: {",
        "    dir: './src/api/generated',",
        "    entry: './src/api/client.ts',",
        "  },",
        "})",
        "",
      ].join("\n"),
    })
  }
  if (!apiFile && !existsSync(join(root, "src/api/api.ts"))) {
    files.push({
      path: join(root, "src/api/api.ts"),
      content: hasDrizzle
        ? [
            "import { createApi } from '@hulla/api'",
            "import { drizzlePlugin } from '@hulla/api-drizzle'",
            `import { db } from '${dbImport}'`,
            "",
            "export const api = createApi({ plugins: [drizzlePlugin({ db })] as const })",
            "",
          ].join("\n")
        : [
            "import { createApi } from '@hulla/api'",
            "",
            "export const api = createApi()",
            "",
          ].join("\n"),
    })
  }
  if (!hasRouter) {
    files.push({
      path: join(root, "src/api/health.router.ts"),
      content: [
        `import { api } from '${apiImport}'`,
        "",
        "export const health = api.router('health').define(({ route }) => ({",
        "  check: route('GET', '/').handler(() => ({ ok: true })),",
        "}))",
        "",
      ].join("\n"),
    })
  }
  if (!existsSync(serverPath)) {
    files.push({
      path: serverPath,
      content: options.bulkDrizzleRoutes
        ? [
            "import { createApiHandler } from '@hulla/api/server'",
            `import { api } from '${apiImport}'`,
            "import { createDrizzleRouters, generatedBasePath } from './generated/server'",
            "",
            "const routers = Object.values(createDrizzleRouters({ api }))",
            "export const handler = createApiHandler({ routers, basePath: generatedBasePath })",
            "",
          ].join("\n")
        : [
            "import { createApiHandler } from '@hulla/api/server'",
            "import { routers } from './generated/server'",
            "",
            "export const handler = createApiHandler({ routers })",
            "",
          ].join("\n"),
    })
  }
  const mount = mountFile(root, framework)
  if (mount && !existsSync(mount.path)) files.push(mount)
  return { framework, files }
}

async function runApiInit(root: string) {
  const packageJson = await readJson(join(root, "package.json"))
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  }
  const hasDrizzle = Boolean(
    dependencies["drizzle-orm"] || existsSync(join(root, "drizzle.config.ts"))
  )
  const bulkDrizzleRoutes = hasDrizzle
    ? await confirm({
        message:
          "Expose every Drizzle table under an api/ schema directory as CRUD routes?",
        initialValue: false,
      })
    : false
  const plan = await createApiInitPlan(root, { bulkDrizzleRoutes })
  if (plan.files.length === 0)
    return commandOk("API is already initialized", {
      framework: plan.framework,
      files: [],
    })
  const accepted = await confirm({
    message: `Create ${plan.files.length} @hulla/api file(s) for ${plan.framework}? Existing files will be left untouched.`,
    initialValue: true,
  })
  if (!accepted)
    return commandOk("API initialization cancelled", {
      framework: plan.framework,
      files: [],
    })
  for (const file of plan.files) {
    await mkdir(dirname(file.path), { recursive: true })
    await writeFile(file.path, file.content, { flag: "wx" })
  }
  return commandOk("API initialized", {
    framework: plan.framework,
    files: plan.files.map((file) => file.path),
  })
}

function mountFile(
  root: string,
  framework: ApiFramework
): { path: string; content: string } | undefined {
  if (framework === "next") {
    const usesSrcApp = existsSync(join(root, "src", "app"))
    return {
      path: join(
        root,
        usesSrcApp
          ? "src/app/api/[[...hulla]]/route.ts"
          : "app/api/[[...hulla]]/route.ts"
      ),
      content: `import { handler } from '${usesSrcApp ? "../../../api/hulla" : "../../../src/api/hulla"}'\n\nexport const GET = handler.fetch\nexport const POST = handler.fetch\nexport const PUT = handler.fetch\nexport const PATCH = handler.fetch\nexport const DELETE = handler.fetch\nexport const HEAD = handler.fetch\nexport const OPTIONS = handler.fetch\n`,
    }
  }
  const path = join(root, `src/api/hulla.${framework}.ts`)
  const lines: Partial<Record<ApiFramework, string>> = {
    bun: "import { handler } from './hulla'\n\nBun.serve({ fetch: handler.fetch })\n",
    deno: "import { handler } from './hulla.ts'\n\nDeno.serve(handler.fetch)\n",
    hono: "import { Hono } from 'hono'\nimport { handler } from './hulla'\n\nexport const hulla = new Hono().all('/api/*', (context) => handler.fetch(context.req.raw))\n",
    elysia:
      "import { Elysia } from 'elysia'\nimport { handler } from './hulla'\n\nexport const hulla = new Elysia().all('/api/*', ({ request }) => handler.fetch(request))\n",
    express:
      "import { createExpressMiddleware } from '@hulla/api-express'\nimport { handler } from './hulla'\n\nexport const hullaMiddleware = createExpressMiddleware(handler)\n",
    nest: "import { createNestMiddleware } from '@hulla/api-nest'\nimport { handler } from './hulla'\n\nexport const hullaMiddleware = createNestMiddleware(handler)\n",
  }
  const content = lines[framework]
  return content ? { path, content } : undefined
}

async function readJson(path: string): Promise<{
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}> {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch {
    return {}
  }
}

async function findSourceFiles(root: string): Promise<string[]> {
  const files: string[] = []
  await visit(existsSync(join(root, "src")) ? join(root, "src") : root)
  return files
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if ([".git", ".hulla", "dist", "node_modules"].includes(entry.name))
        continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name))
        files.push(path)
    }
  }
}

async function findExport(
  files: readonly string[],
  pattern: RegExp
): Promise<string | undefined> {
  for (const file of files)
    if (pattern.test(await readFile(file, "utf8"))) return file
  return undefined
}

function importPath(fromFile: string, toFile: string): string {
  const value = relative(dirname(fromFile), toFile)
    .replace(/\\/g, "/")
    .replace(/\.[cm]?[jt]sx?$/, "")
  return value.startsWith(".") ? value : `./${value}`
}
