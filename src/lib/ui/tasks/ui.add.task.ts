import { d } from "@/decorators"
import { getUILibCacheKey, readUICache, updateUICache } from "@/lib/cache"
import { directoryExists } from "@/lib/shared/bunUtils"
import type { PackageJson } from "@/lib/shared/getPackageFiles"
import {
  getProjectRootFromConfigPath,
  normalizePath,
  normalizeProjectRelativePath,
  readUIConfig,
} from "@/lib/ui/config"
import { autocompleteMultiselect } from "@/prompts/autocompleteMultiselect"
import { box } from "@/prompts/box"
import { confirm } from "@/prompts/confirm"
import { log } from "@/prompts/log"
import { select } from "@/prompts/select"
import type {
  HullaConfig,
  ParserResult,
  TsconfigPatchPlan,
  UIAddResolvedComponent,
  UIAddSummary,
} from "@/types"
import { err, ok, type Err, type Ok } from "@hulla/control"
import gittar from "@hulla/gittar"
import { mkdir } from "node:fs/promises"
import { basename, dirname, join, relative } from "path"
import type { UICacheItem } from "schemas/hulla.schema"
import type { UIProjectConfigSchema } from "schemas/ui.types"
import { createUnifiedDiff } from "./tsconfig/diff"

type CreateUiAddTaskInput = {
  config: HullaConfig
  parserResult: ParserResult
  result: ParserResult["commands"]["ui"]["commands"]["add"]
}

type FrameworkInstall = {
  sourceUrl: string
  libraryName: string
  frameworkName: string
  templatePath: string
  outputPath: string
  copyFilesRoot: string
  sourceRoot: string
  sourceFrameworkRoot: string
  componentsByLowerName: Map<string, string>
}

type CachedSource = {
  rootDir: string
  commit: string | undefined
  branch: string | undefined
}

type CopyFileEntry = {
  src: string
  dest?: string
  required?: boolean
}

type UILibraryWithCopyFiles = {
  copyFiles?: {
    shared?: CopyFileEntry[]
  } & Record<string, CopyFileEntry[] | undefined>
}

export async function createUiAddTask({
  config,
  parserResult,
  result,
}: CreateUiAddTaskInput): Promise<Ok<UIAddSummary> | Err<Error>> {
  try {
    const uiConfig = await readUIConfig(config)
    if (uiConfig.data.installs.length === 0) {
      return err(
        new Error(
          "No UI installs found. Run `hulla ui init` before adding components."
        )
      )
    }

    const explicitFramework = resolveExplicitFramework({
      parserResult,
      result,
    })

    const frameworkInstalls = await buildFrameworkInstalls(
      config,
      uiConfig.data.installs
    )

    if (frameworkInstalls.length === 0) {
      return err(
        new Error(
          "No framework installs could be resolved from ui.json. Run `hulla ui init` again."
        )
      )
    }

    const availableFrameworkNames = Array.from(
      new Set(frameworkInstalls.map((item) => item.frameworkName))
    ).sort()
    if (
      explicitFramework &&
      !availableFrameworkNames
        .map((name) => name.toLowerCase())
        .includes(explicitFramework.toLowerCase())
    ) {
      return err(
        new Error(
          `Framework ${d.highlight(explicitFramework)} is not configured. Available: ${availableFrameworkNames.join(", ")}`
        )
      )
    }

    const requestedComponentInputs = await resolveRequestedComponents({
      result,
      frameworkInstalls,
      explicitFramework,
    })
    if (requestedComponentInputs.length === 0) {
      return err(new Error("No components selected."))
    }

    const missingComponents: string[] = []
    let promptedFrameworkSelections = 0
    const resolvedComponents: UIAddResolvedComponent[] = []

    for (const componentInput of requestedComponentInputs) {
      const matches = findMatchesForComponent({
        frameworkInstalls,
        componentInput,
        explicitFramework,
      })

      if (matches.length === 0) {
        missingComponents.push(componentInput)
        continue
      }

      const byFramework = new Map<string, FrameworkInstall>()
      for (const match of matches) {
        const key = match.frameworkName.toLowerCase()
        if (!byFramework.has(key)) {
          byFramework.set(key, match)
        }
      }

      let chosen: FrameworkInstall | null = null
      if (byFramework.size === 1) {
        chosen = Array.from(byFramework.values())[0]
      } else {
        promptedFrameworkSelections += 1
        const selectedFramework = await select<string>({
          message: `Component ${d.highlight(componentInput)} exists in multiple frameworks. Which one should be used?`,
          options: Array.from(byFramework.values()).map((item) => ({
            label: item.frameworkName,
            hint: item.libraryName,
            value: item.frameworkName.toLowerCase(),
          })),
        })
        chosen = byFramework.get(selectedFramework) ?? null
      }

      if (!chosen) {
        missingComponents.push(componentInput)
        continue
      }

      const canonicalName =
        chosen.componentsByLowerName.get(componentInput) ?? componentInput
      resolvedComponents.push({
        componentInput,
        componentName: canonicalName,
        sourceUrl: chosen.sourceUrl,
        libraryName: chosen.libraryName,
        frameworkName: chosen.frameworkName,
        sourceRoot: chosen.sourceRoot,
        sourceFrameworkRoot: chosen.sourceFrameworkRoot,
        sourceComponentDir: join(chosen.sourceFrameworkRoot, canonicalName),
        outputPath: chosen.outputPath,
        copyFilesRoot: chosen.copyFilesRoot,
      })
    }

    const projectRoot = getProjectRootFromConfigPath(config.path)
    const changedFilePaths = new Set<string>()
    const summary: UIAddSummary = {
      copied: 0,
      overwritten: 0,
      skippedExisting: 0,
      missingComponents,
      promptedFrameworkSelections,
    }
    const componentPackageJsonSourcePaths = new Set<string>()

    for (const component of resolvedComponents) {
      const sourceFiles = await listFilesRecursive(component.sourceComponentDir)
      if (sourceFiles.length === 0) {
        summary.missingComponents.push(component.componentInput)
        continue
      }

      const destinationComponentDir = join(
        projectRoot,
        normalizeProjectRelativePath(component.outputPath),
        component.componentName
      )

      for (const sourcePath of sourceFiles) {
        const relativePath = normalizeProjectRelativePath(
          sourcePath.slice(component.sourceComponentDir.length + 1)
        )
        if (isComponentPackageJson(relativePath)) {
          componentPackageJsonSourcePaths.add(sourcePath)
          continue
        }
        const destinationPath = join(destinationComponentDir, relativePath)
        const sourceFile = Bun.file(sourcePath)
        const destinationFile = Bun.file(destinationPath)
        const destinationExists = await destinationFile.exists()
        const sourceContent = await sourceFile.arrayBuffer()

        if (destinationExists) {
          const beforeText = await destinationFile.text()
          const afterText = await sourceFile.text()
          const patch: TsconfigPatchPlan = {
            targetPath: destinationPath,
            beforeText,
            afterText,
            mode: "update",
          }

          const destinationDisplayPath = toRelativeDisplayPath(
            destinationPath,
            process.cwd()
          )

          box(
            createUnifiedDiff(patch, process.cwd()),
            `File exists: ${destinationDisplayPath}`
          )

          const shouldOverwrite = await confirm({
            message: `Overwrite ${d.path(destinationDisplayPath)}?`,
            initialValue: false,
          })
          if (!shouldOverwrite) {
            summary.skippedExisting += 1
            continue
          }
        }

        await mkdir(dirname(destinationPath), { recursive: true })
        await Bun.write(destinationPath, sourceContent)
        changedFilePaths.add(destinationPath)
        summary.copied += 1
        if (destinationExists) {
          summary.overwritten += 1
        }
      }
    }

    const supportFilePaths = await ensureRequiredCopyFiles({
      projectRoot,
      resolvedComponents,
    })
    for (const path of supportFilePaths) {
      changedFilePaths.add(path)
    }
    summary.copied += supportFilePaths.length

    if (summary.copied > 0) {
      await installComponentDependencies({
        config,
        projectRoot,
        componentPackageJsonPaths: Array.from(componentPackageJsonSourcePaths),
      })

      await runPostAddUpdateStep({
        postAddUpdateStep: uiConfig.data.postAddUpdateStep,
        projectRoot,
        changedFilePaths: Array.from(changedFilePaths),
      })
    }

    if (summary.copied > 0) {
      log.success(
        `Added ${summary.copied} file${summary.copied === 1 ? "" : "s"} (${summary.overwritten} overwritten).`
      )
    }

    if (summary.skippedExisting > 0) {
      log.warn(
        `Skipped ${summary.skippedExisting} existing file${summary.skippedExisting === 1 ? "" : "s"}.`
      )
    }

    if (summary.missingComponents.length > 0) {
      log.warn(
        `Skipped missing components: ${Array.from(new Set(summary.missingComponents)).join(", ")}`
      )
    }

    if (summary.copied === 0) {
      if (summary.missingComponents.length > 0) {
        return err(
          new Error(
            "No files were added because all requested components were missing or unresolved."
          )
        )
      }
      return err(new Error("No files were added."))
    }

    return ok(summary)
  } catch (error) {
    return err(error as Error)
  }
}

function resolveExplicitFramework(input: {
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

async function resolveRequestedComponents(input: {
  result: ParserResult["commands"]["ui"]["commands"]["add"]
  frameworkInstalls: FrameworkInstall[]
  explicitFramework: string | null
}): Promise<string[]> {
  const fromArgs = input.result.arguments.components?.value ?? []
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

function findMatchesForComponent(input: {
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

async function buildFrameworkInstalls(
  config: HullaConfig,
  installs: Awaited<ReturnType<typeof readUIConfig>>["data"]["installs"]
): Promise<FrameworkInstall[]> {
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

async function resolveFrameworkSourceRoot(input: {
  install: Awaited<ReturnType<typeof readUIConfig>>["data"]["installs"][number]
  framework: Awaited<
    ReturnType<typeof readUIConfig>
  >["data"]["installs"][number]["frameworks"][number]
  cache: Awaited<ReturnType<typeof readUICache>>
  fetchedRootsBySource: Map<string, CachedSource>
}): Promise<{
  frameworkRoot: string
  sourceRoot: string
  commit: string | undefined
  branch: string | undefined
  refreshed: boolean
}> {
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

  let source = input.fetchedRootsBySource.get(input.install.sourceUrl)
  if (!source) {
    const fetched = await gittar({
      url: input.install.sourceUrl,
      update: "commit",
    })
    source = {
      rootDir: join(fetched.outDir, fetched.subpath ?? ""),
      commit: fetched.commit,
      branch: fetched.branch,
    }
    input.fetchedRootsBySource.set(input.install.sourceUrl, source)
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

async function listFilesRecursive(root: string): Promise<string[]> {
  const files: string[] = []
  const glob = new Bun.Glob("**/*")

  try {
    for await (const rawPath of glob.scan({
      cwd: root,
      absolute: false,
    })) {
      const normalized = rawPath.replace(/\\/g, "/")
      const absolute = join(root, normalized)
      files.push(absolute)
    }
  } catch {
    return files
  }

  return files
}

function toRelativeDisplayPath(path: string, cwd: string): string {
  const relativePath = relative(cwd, path).replace(/\\/g, "/")
  if (relativePath.length === 0) {
    return "."
  }
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`
}

function isComponentPackageJson(path: string): boolean {
  return basename(path) === "package.json"
}

async function ensureRequiredCopyFiles(input: {
  projectRoot: string
  resolvedComponents: UIAddResolvedComponent[]
}): Promise<string[]> {
  const frameworkSelections = dedupeFrameworkSelections(
    input.resolvedComponents
  )
  if (frameworkSelections.length === 0) {
    return []
  }

  const copiedPaths: string[] = []
  for (const selection of frameworkSelections) {
    const libraryConfig = await readLibraryConfig(selection.sourceRoot)
    if (!libraryConfig?.copyFiles) {
      continue
    }

    const sharedEntries = normalizeCopyEntries(libraryConfig.copyFiles.shared)
    const frameworkEntries = normalizeCopyEntries(
      libraryConfig.copyFiles[selection.frameworkName]
    )
    const requiredShared = sharedEntries.filter((entry) => entry.required)
    const requiredFramework = frameworkEntries.filter((entry) => entry.required)

    for (const entry of requiredShared) {
      const sourcePath = await resolveCopyEntrySource({
        sourceRoot: selection.sourceRoot,
        sourceFrameworkRoot: selection.sourceFrameworkRoot,
        src: entry.src,
        shared: true,
      })

      if (!sourcePath) {
        throw new Error(
          `Missing required shared library file ${entry.src} for ${selection.libraryName}/${selection.frameworkName}`
        )
      }

      const destinationRelative = toCopyDestinationRelativePath(
        selection.copyFilesRoot,
        entry.dest ?? entry.src
      )
      const destinationPath = join(input.projectRoot, destinationRelative)
      const exists = await Bun.file(destinationPath).exists()
      if (exists) {
        continue
      }

      await mkdir(dirname(destinationPath), { recursive: true })
      const sourceContent = await Bun.file(sourcePath).arrayBuffer()
      await Bun.write(destinationPath, sourceContent)
      copiedPaths.push(destinationPath)
    }

    for (const entry of requiredFramework) {
      const sourcePath = await resolveCopyEntrySource({
        sourceRoot: selection.sourceRoot,
        sourceFrameworkRoot: selection.sourceFrameworkRoot,
        src: entry.src,
        shared: false,
      })

      if (!sourcePath) {
        throw new Error(
          `Missing required framework library file ${entry.src} for ${selection.libraryName}/${selection.frameworkName}`
        )
      }

      const destinationRelative = toCopyDestinationRelativePath(
        selection.copyFilesRoot,
        entry.dest ?? entry.src
      )
      const destinationPath = join(input.projectRoot, destinationRelative)
      const exists = await Bun.file(destinationPath).exists()
      if (exists) {
        continue
      }

      await mkdir(dirname(destinationPath), { recursive: true })
      const sourceContent = await Bun.file(sourcePath).arrayBuffer()
      await Bun.write(destinationPath, sourceContent)
      copiedPaths.push(destinationPath)
    }
  }

  if (copiedPaths.length > 0) {
    log.info(
      `Added ${copiedPaths.length} required support file${copiedPaths.length === 1 ? "" : "s"}.`
    )
  }

  return copiedPaths
}

function dedupeFrameworkSelections(
  components: UIAddResolvedComponent[]
): Array<{
  sourceRoot: string
  sourceFrameworkRoot: string
  libraryName: string
  frameworkName: string
  copyFilesRoot: string
}> {
  const map = new Map<
    string,
    {
      sourceRoot: string
      sourceFrameworkRoot: string
      libraryName: string
      frameworkName: string
      copyFilesRoot: string
    }
  >()

  for (const component of components) {
    const key = [
      component.sourceRoot,
      component.sourceFrameworkRoot,
      component.libraryName,
      component.frameworkName,
      component.copyFilesRoot,
    ].join("::")

    if (!map.has(key)) {
      map.set(key, {
        sourceRoot: component.sourceRoot,
        sourceFrameworkRoot: component.sourceFrameworkRoot,
        libraryName: component.libraryName,
        frameworkName: component.frameworkName,
        copyFilesRoot: component.copyFilesRoot,
      })
    }
  }

  return Array.from(map.values())
}

async function readLibraryConfig(
  sourceRoot: string
): Promise<UILibraryWithCopyFiles | null> {
  const configPath = join(sourceRoot, "ui.config.ts")
  const configFile = Bun.file(configPath)
  if (!(await configFile.exists())) {
    return null
  }

  try {
    const loaded = (await import(configPath)) as {
      config?: UILibraryWithCopyFiles
    }
    return loaded.config ?? null
  } catch {
    return null
  }
}

function normalizeCopyEntries(entries?: CopyFileEntry[]): Array<{
  src: string
  dest?: string
  required: boolean
}> {
  if (!entries || entries.length === 0) {
    return []
  }

  return entries.map((entry) => ({
    src: normalizeProjectRelativePath(entry.src),
    dest:
      typeof entry.dest === "string"
        ? normalizeProjectRelativePath(entry.dest)
        : undefined,
    required: entry.required !== false,
  }))
}

function toCopyDestinationRelativePath(
  copyFilesRoot: string,
  destinationTemplate: string
): string {
  const normalizedRoot = normalizeProjectRelativePath(copyFilesRoot)
  const normalizedDest = normalizeProjectRelativePath(destinationTemplate)

  if (
    normalizedDest === normalizedRoot ||
    normalizedDest.startsWith(`${normalizedRoot}/`)
  ) {
    return normalizedDest
  }

  return normalizeProjectRelativePath(
    join(normalizedRoot, normalizedDest).replace(/\\/g, "/")
  )
}

async function resolveCopyEntrySource(input: {
  sourceRoot: string
  sourceFrameworkRoot: string
  src: string
  shared: boolean
}): Promise<string | null> {
  const normalizedSrc = normalizeProjectRelativePath(input.src)
  const candidates = input.shared
    ? [
        join(input.sourceFrameworkRoot, normalizedSrc),
        join(input.sourceRoot, normalizedSrc),
      ]
    : [join(input.sourceFrameworkRoot, normalizedSrc)]

  for (const candidate of candidates) {
    if (await Bun.file(candidate).exists()) {
      return candidate
    }
  }

  return null
}

async function installComponentDependencies(input: {
  config: HullaConfig
  projectRoot: string
  componentPackageJsonPaths: string[]
}): Promise<void> {
  if (input.componentPackageJsonPaths.length === 0) {
    return
  }

  const projectPackageJson = await readPackageJson(
    join(input.projectRoot, "package.json")
  )
  const installedDeps = new Set<string>([
    ...Object.keys(projectPackageJson?.dependencies ?? {}),
    ...Object.keys(projectPackageJson?.devDependencies ?? {}),
  ])

  const depsMap = new Map<string, string>()
  const devDepsMap = new Map<string, string>()

  for (const packageJsonPath of input.componentPackageJsonPaths) {
    const packageJson = await readPackageJson(packageJsonPath)
    if (!packageJson) {
      continue
    }

    for (const [name, version] of Object.entries(
      packageJson.dependencies ?? {}
    )) {
      if (!depsMap.has(name)) {
        depsMap.set(name, version)
      }
    }

    for (const [name, version] of Object.entries(
      packageJson.devDependencies ?? {}
    )) {
      if (!devDepsMap.has(name)) {
        devDepsMap.set(name, version)
      }
    }
  }

  for (const dependencyName of depsMap.keys()) {
    devDepsMap.delete(dependencyName)
  }

  const { toInstall: depsToInstall, skipped: skippedDeps } =
    filterAndFormatDeps(depsMap, installedDeps)
  const { toInstall: devDepsToInstall, skipped: skippedDevDeps } =
    filterAndFormatDeps(devDepsMap, installedDeps)

  const hasAnythingToInstall =
    depsToInstall.length > 0 || devDepsToInstall.length > 0
  if (!hasAnythingToInstall) {
    if (skippedDeps.length > 0 || skippedDevDeps.length > 0) {
      log.info("All dependencies from added components are already installed.")
    }
    return
  }

  const boxLines: string[] = []
  if (depsToInstall.length > 0) {
    boxLines.push(d.highlight("Dependencies:"))
    for (const dependency of depsToInstall) {
      boxLines.push(`  ${d.success("+")} ${dependency}`)
    }
  }

  if (devDepsToInstall.length > 0) {
    if (boxLines.length > 0) {
      boxLines.push("")
    }
    boxLines.push(d.highlight("Dev Dependencies:"))
    for (const dependency of devDepsToInstall) {
      boxLines.push(`  ${d.success("+")} ${dependency}`)
    }
  }

  const skipped = [...skippedDeps, ...skippedDevDeps]
  if (skipped.length > 0) {
    if (boxLines.length > 0) {
      boxLines.push("")
    }
    boxLines.push(d.secondary("Already installed:"))
    for (const dependency of skipped) {
      boxLines.push(`  ${d.secondary("~")} ${dependency}`)
    }
  }

  box(boxLines.join("\n"), "Component dependencies")

  const shouldInstall = await confirm({
    message: "Install dependencies required by added components now?",
    initialValue: true,
  })
  if (!shouldInstall) {
    log.warn(
      "Skipped dependency installation. Install these dependencies manually before using the components."
    )
    return
  }

  if (depsToInstall.length > 0) {
    await runInstallScript({
      script: input.config.cli.scripts.add,
      packages: depsToInstall,
      label: "dependencies",
      cwd: input.projectRoot,
    })
  }

  if (devDepsToInstall.length > 0) {
    await runInstallScript({
      script: input.config.cli.scripts.addDev,
      packages: devDepsToInstall,
      label: "dev dependencies",
      cwd: input.projectRoot,
    })
  }
}

async function readPackageJson(path: string): Promise<PackageJson | null> {
  const file = Bun.file(path)
  if (!(await file.exists())) {
    return null
  }
  try {
    return (await file.json()) as PackageJson
  } catch {
    return null
  }
}

function filterAndFormatDeps(
  depsMap: Map<string, string>,
  installedDeps: Set<string>
): { toInstall: string[]; skipped: string[] } {
  const toInstall: string[] = []
  const skipped: string[] = []
  for (const [name, version] of depsMap.entries()) {
    if (installedDeps.has(name)) {
      skipped.push(name)
      continue
    }
    toInstall.push(version === "*" ? name : `${name}@${version}`)
  }
  return { toInstall, skipped }
}

async function runInstallScript(input: {
  script: string
  packages: string[]
  label: string
  cwd: string
}): Promise<void> {
  const [command, ...args] = input.script.split(" ")
  const proc = Bun.spawn([command, ...args, ...input.packages], {
    cwd: input.cwd,
    stdout: "inherit",
    stderr: "inherit",
  })
  await proc.exited
  if (proc.exitCode !== 0) {
    throw new Error(
      `Failed to install ${input.label} (exit code: ${proc.exitCode}).`
    )
  }
}

async function runPostAddUpdateStep(input: {
  postAddUpdateStep: UIProjectConfigSchema["postAddUpdateStep"]
  projectRoot: string
  changedFilePaths: string[]
}): Promise<void> {
  const configuredCommand = input.postAddUpdateStep.trim()
  if (!configuredCommand || input.changedFilePaths.length === 0) {
    return
  }

  const changedProjectRelativeFiles = input.changedFilePaths.map((path) =>
    normalizePath(relative(input.projectRoot, path))
  )
  const filesLabel =
    changedProjectRelativeFiles.length === 1
      ? "1 file"
      : `${changedProjectRelativeFiles.length} files`
  const escapedFiles = changedProjectRelativeFiles.map(shellEscape).join(" ")
  const script = configuredCommand.includes("{files}")
    ? configuredCommand.replaceAll("{files}", escapedFiles)
    : `${configuredCommand} ${escapedFiles}`

  log.info(`Running post add/update command on ${filesLabel}...`)
  const proc = Bun.spawn(["sh", "-lc", script], {
    cwd: input.projectRoot,
    stdout: "inherit",
    stderr: "inherit",
  })

  await proc.exited
  if (proc.exitCode !== 0) {
    throw new Error(
      `Failed to run post add/update command (exit code: ${proc.exitCode}).`
    )
  }
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}
