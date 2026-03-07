import type { HullaConfig, ParserResult } from "@/app/types"
import type { readUIConfig } from "@/modules/ui/config"
import {
  getProjectRootFromConfigPath,
  normalizeProjectRelativePath,
} from "@/modules/ui/config"
import { resolveUISource } from "@/modules/ui/source"
import {
  getUILibCacheKey,
  readUICache,
  updateUICache,
} from "@/platform/cache/ui-cache"
import { directoryExists } from "@/platform/fs/bun"
import { d } from "@/terminal/format"
import { autocompleteMultiselect } from "@/terminal/prompts/autocompleteMultiselect"
import { log } from "@/terminal/prompts/log"
import { isPromptNonInteractive } from "@/terminal/prompts/runtime"
import { select } from "@/terminal/prompts/select"
import gittar from "@hulla/gittar"
import { dirname, join } from "path"
import type { UICacheItem } from "schemas/hulla.schema"
import type { UIProjectConfigSchema } from "schemas/ui.types"
import type { CachedSource, FrameworkInstall } from "../types"

export function resolveExplicitFramework(input: {
  parserResult: ParserResult
  result: ParserResult["commands"]["ui"]["commands"]["add"]
}): string | null {
  const addFramework = input.result.arguments.framework
  if (addFramework?.detected && typeof addFramework.value === "string") {
    return addFramework.value.trim()
  }

  const uiFramework = input.parserResult.commands.ui.arguments.framework
  if (uiFramework?.detected && typeof uiFramework.value === "string") {
    return uiFramework.value.trim()
  }

  return null
}

export async function resolveRequestedComponents(input: {
  result: ParserResult["commands"]["ui"]["commands"]["add"]
  frameworkInstalls: FrameworkInstall[]
  explicitFramework: string | null
}): Promise<string[]> {
  const fromArgs = Array.isArray(input.result.arguments.components?.value)
    ? input.result.arguments.components.value
    : []
  const normalizedFromArgs = normalizeComponentInputs(fromArgs)
  if (normalizedFromArgs.length > 0) {
    return normalizedFromArgs
  }

  const filtered = input.explicitFramework
    ? input.frameworkInstalls.filter(
        (item) =>
          item.frameworkName.toLowerCase() ===
          input.explicitFramework?.toLowerCase()
      )
    : input.frameworkInstalls
  const optionsMap = new Map<string, { label: string; value: string }>()
  for (const item of filtered) {
    for (const [lowerName, canonicalName] of item.componentsByLowerName) {
      if (!optionsMap.has(lowerName)) {
        optionsMap.set(lowerName, {
          label: canonicalName,
          value: lowerName,
        })
      }
    }
  }

  const options = Array.from(optionsMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  )
  if (options.length === 0) {
    return []
  }

  const selected = await autocompleteMultiselect<string>({
    message: "Select components to add",
    options,
    placeholder: "Type to search components...",
  })

  return normalizeComponentInputs(selected)
}

export function findMatchesForComponent(input: {
  frameworkInstalls: FrameworkInstall[]
  componentInput: string
  explicitFramework: string | null
}): FrameworkInstall[] {
  return input.frameworkInstalls.filter((item) => {
    if (
      input.explicitFramework &&
      item.frameworkName.toLowerCase() !== input.explicitFramework.toLowerCase()
    ) {
      return false
    }
    return item.componentsByLowerName.has(input.componentInput)
  })
}

export async function selectMatchingFramework(
  componentInput: string,
  matches: FrameworkInstall[],
  explicitFramework: string | null
): Promise<{ chosen: FrameworkInstall | null; prompted: boolean }> {
  const byFramework = new Map<string, FrameworkInstall>()
  for (const match of matches) {
    const key = match.frameworkName.toLowerCase()
    if (!byFramework.has(key)) {
      byFramework.set(key, match)
    }
  }

  if (byFramework.size === 1) {
    return {
      chosen: Array.from(byFramework.values())[0],
      prompted: false,
    }
  }

  if (isPromptNonInteractive() && !explicitFramework) {
    throw new Error(
      `Prompt required but --yes was used: component ${d.highlight(componentInput)} exists in multiple frameworks. Pass --framework <name>.`
    )
  }

  const selectedFramework = await select<string>({
    message: `Component ${d.highlight(componentInput)} exists in multiple frameworks. Which one should be used?`,
    options: Array.from(byFramework.values()).map((item) => ({
      label: item.frameworkName,
      hint: item.libraryName,
      value: item.frameworkName.toLowerCase(),
    })),
  })

  return {
    chosen: byFramework.get(selectedFramework) ?? null,
    prompted: true,
  }
}

export async function buildFrameworkInstalls(
  config: HullaConfig,
  installs: Awaited<ReturnType<typeof readUIConfig>>["data"]["installs"]
): Promise<FrameworkInstall[]> {
  const projectRoot = getProjectRootFromConfigPath(config.path)
  const cache = await readUICache(config)
  const fetchedRootsBySource = new Map<string, CachedSource>()
  const pendingCacheUpdates = new Map<string, UICacheItem>()
  const result: FrameworkInstall[] = []

  for (const install of installs) {
    for (const framework of install.frameworks) {
      const resolved = await resolveFrameworkSourceRoot({
        install,
        framework,
        cache,
        fetchedRootsBySource,
        projectRoot,
      })
      const sourceFrameworkRoot = resolved.frameworkRoot
      const componentsByLowerName =
        await discoverComponentsForFramework(sourceFrameworkRoot)

      result.push({
        sourceUrl: install.sourceUrl,
        libraryName: install.libraryName,
        frameworkName: framework.name,
        templatePath: framework.templatePath,
        outputPath: framework.outputPath,
        codeRoot: resolveInstallCodeRoot(install),
        copyFilesRoot: install.copyFilesRoot,
        sourceRoot: resolved.sourceRoot,
        sourceFrameworkRoot,
        componentsByLowerName,
      })

      if (resolved.refreshed) {
        const cacheKey = getUILibCacheKey(
          install.libraryName,
          install.sourceUrl
        )
        const existingItem =
          pendingCacheUpdates.get(cacheKey) ?? cache?.libs[cacheKey]
        const frameworksMap = {
          ...(existingItem?.frameworks ?? {}),
          [framework.name]: sourceFrameworkRoot,
        }

        pendingCacheUpdates.set(cacheKey, {
          url: install.sourceUrl,
          rootDir: resolved.sourceRoot,
          ...(resolved.commit ? { commit: resolved.commit } : {}),
          ...(resolved.branch ? { branch: resolved.branch } : {}),
          config: existingItem?.config ?? {
            name: install.libraryName,
            version: "0.0.0",
          },
          frameworks: frameworksMap,
        })
      }
    }
  }

  if (pendingCacheUpdates.size > 0) {
    await updateUICache(config, Object.fromEntries(pendingCacheUpdates))
  }

  return result
}

function normalizeComponentInputs(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = value.trim().toLowerCase()
    if (normalized.length === 0 || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

async function resolveFrameworkSourceRoot(input: {
  install: UIProjectConfigSchema["installs"][number]
  framework: UIProjectConfigSchema["installs"][number]["frameworks"][number]
  cache: Awaited<ReturnType<typeof readUICache>>
  fetchedRootsBySource: Map<string, CachedSource>
  projectRoot: string
}): Promise<{
  frameworkRoot: string
  sourceRoot: string
  commit: string | undefined
  branch: string | undefined
  refreshed: boolean
}> {
  const resolvedSource = resolveUISource({
    source: input.install.sourceUrl,
    projectRoot: input.projectRoot,
  })

  if (resolvedSource.kind === "local") {
    const sourceRoot = resolvedSource.rootDir
    const sourceExists = await directoryExists(sourceRoot)
    if (!sourceExists) {
      throw new Error(
        `Local UI source path not found: ${d.path(input.install.sourceUrl)} (resolved: ${d.path(sourceRoot)})`
      )
    }

    const configPath = join(sourceRoot, "ui.config.ts")
    const configExists = await Bun.file(configPath).exists()
    if (!configExists) {
      throw new Error(
        `Local UI source is missing ui.config.ts: ${d.path(input.install.sourceUrl)} (expected: ${d.path(configPath)})`
      )
    }

    const frameworkRoot = join(
      sourceRoot,
      normalizeProjectRelativePath(input.framework.templatePath)
    )
    const frameworkExists = await directoryExists(frameworkRoot)
    if (!frameworkExists) {
      throw new Error(
        `Framework template path not found for ${input.install.libraryName}/${input.framework.name}: ${d.path(frameworkRoot)}`
      )
    }

    return {
      frameworkRoot,
      sourceRoot,
      commit: undefined,
      branch: undefined,
      refreshed: false,
    }
  }

  const cacheKey = getUILibCacheKey(
    input.install.libraryName,
    input.install.sourceUrl
  )
  const cachedFrameworkRoot =
    input.cache?.libs[cacheKey]?.frameworks?.[input.framework.name]
  if (cachedFrameworkRoot) {
    const cachedExists = await directoryExists(cachedFrameworkRoot)
    if (cachedExists) {
      return {
        frameworkRoot: cachedFrameworkRoot,
        sourceRoot:
          input.cache?.libs[cacheKey]?.rootDir ?? dirname(cachedFrameworkRoot),
        commit: input.cache?.libs[cacheKey]?.commit,
        branch: input.cache?.libs[cacheKey]?.branch,
        refreshed: false,
      }
    }

    log.warn(
      `Stale UI cache path for ${input.install.libraryName}/${input.framework.name}. Refreshing cache entry.`
    )
  }

  const cachedRootDir = input.cache?.libs[cacheKey]?.rootDir
  if (cachedRootDir) {
    const rootDerivedFrameworkPath = join(
      cachedRootDir,
      normalizeProjectRelativePath(input.framework.templatePath)
    )
    const existsFromRoot = await directoryExists(rootDerivedFrameworkPath)
    if (existsFromRoot) {
      return {
        frameworkRoot: rootDerivedFrameworkPath,
        sourceRoot: cachedRootDir,
        commit: input.cache?.libs[cacheKey]?.commit,
        branch: input.cache?.libs[cacheKey]?.branch,
        refreshed: true,
      }
    }
  }

  const remoteSourceUrl = resolvedSource.sourceUrl
  let source = input.fetchedRootsBySource.get(remoteSourceUrl)
  if (!source) {
    const fetched = await gittar({
      url: remoteSourceUrl,
      update: "commit",
    })
    source = {
      rootDir: join(fetched.outDir, fetched.subpath ?? ""),
      commit: fetched.commit,
      branch: fetched.branch,
    }
    input.fetchedRootsBySource.set(remoteSourceUrl, source)
  }

  const frameworkRoot = join(
    source.rootDir,
    normalizeProjectRelativePath(input.framework.templatePath)
  )
  const exists = await directoryExists(frameworkRoot)
  if (!exists) {
    throw new Error(
      `Framework template path not found for ${input.install.libraryName}/${input.framework.name}: ${frameworkRoot}`
    )
  }
  return {
    frameworkRoot,
    sourceRoot: source.rootDir,
    commit: source.commit,
    branch: source.branch,
    refreshed: true,
  }
}

async function discoverComponentsForFramework(
  frameworkRoot: string
): Promise<Map<string, string>> {
  const components = new Map<string, string>()
  const glob = new Bun.Glob("**/*")

  try {
    for await (const rawPath of glob.scan({
      cwd: frameworkRoot,
      absolute: false,
    })) {
      const normalized = rawPath.replace(/\\/g, "/")
      if (!normalized.includes("/")) {
        continue
      }

      const [topLevel] = normalized.split("/")
      if (!topLevel || topLevel === "lib" || topLevel.startsWith(".")) {
        continue
      }

      if (!components.has(topLevel.toLowerCase())) {
        components.set(topLevel.toLowerCase(), topLevel)
      }
    }
  } catch {
    return components
  }

  return components
}

function resolveInstallCodeRoot(
  install: UIProjectConfigSchema["installs"][number]
): string {
  const maybeCodeRoot = (install as Record<string, unknown>).codeRoot
  if (typeof maybeCodeRoot === "string" && maybeCodeRoot.trim().length > 0) {
    return normalizeProjectRelativePath(maybeCodeRoot)
  }

  const normalizedComponents = normalizeProjectRelativePath(
    install.componentsRoot
  )
  if (normalizedComponents === ".") {
    return "src"
  }

  const [firstSegment] = normalizedComponents.split("/")
  return firstSegment || "src"
}
