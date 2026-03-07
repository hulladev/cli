import { d } from "@/decorators"
import { getUILibCacheKey, updateUICache } from "@/lib/cache"
import { directoryExists } from "@/lib/shared/bunUtils"
import { detectFrameworkDetailed } from "@/lib/shared/detectFramework"
import {
  defaultUISources,
  getProjectRootFromConfigPath,
  normalizeProjectRelativePath,
  type UIProjectConfig,
} from "@/lib/ui/config"
import { resolveUISource } from "@/lib/ui/source"
import { box } from "@/prompts/box"
import { confirm } from "@/prompts/confirm"
import { log } from "@/prompts/log"
import { multiselect } from "@/prompts/multiselect"
import { path } from "@/prompts/path"
import { select } from "@/prompts/select"
import { spinner } from "@/prompts/spinner"
import type { HullaConfig, UISelectedFramework } from "@/types"
import { keys } from "@/utils/objects"
import gittar from "@hulla/gittar"
import { existsSync, lstatSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { isAbsolute, join, posix, resolve } from "path"
import type { UICacheItem } from "schemas/hulla.schema"

type CreateUiInstallTaskInput = {
  config: HullaConfig
  uiConfig: UIProjectConfig
}

export type UIInstallDraftFramework = {
  id: string
  name: string
  templatePath: string
  outputPath: string
}

export type UIInstallDraft = {
  sourceUrl: string
  libraryName: string
  codeRoot: string
  componentsRoot: string
  copyFilesRoot: string
  frameworks: UIInstallDraftFramework[]
}

export type UICopyEntry = {
  src: string
  dest?: string
  required: boolean
  description?: string
}

export type UICopyFrameworkContext = {
  id: string
  name: string
  templatePath: string
  outputPath: string
  copyEntries: UICopyEntry[]
}

export type UICopyLibraryContext = {
  sourceUrl: string
  libraryName: string
  rootDir: string
  componentsRoot: string
  copyFilesRoot: string
  sharedCopyEntries: UICopyEntry[]
  frameworks: UICopyFrameworkContext[]
}

type FetchedLibrary = {
  sourceType: "local" | "remote"
  url: string
  rootDir: string
  config: UILibraryWithCopyFiles
  commit: string | undefined
  branch: string | undefined
}

type UILibraryWithCopyFiles = UILibrary & {
  copyFiles?: {
    shared?: UICopyEntry[]
  } & Record<string, UICopyEntry[]>
}

type UILibrary = {
  name: string
  url?: string
  author?: string | string[]
  frameworks: Record<string, string>
  version: string
}

export async function createUiInstallTask({
  config,
  uiConfig,
}: CreateUiInstallTaskInput): Promise<{
  selectedFrameworks: UISelectedFramework[]
  installDrafts: UIInstallDraft[]
  copyContexts: UICopyLibraryContext[]
  sharedDependencies: string[]
  sharedDevDependencies: string[]
}> {
  const projectRoot = getProjectRootFromConfigPath(config.path)
  const libSources =
    uiConfig.sources.length > 0 ? uiConfig.sources : defaultUISources

  const s = spinner()
  s.start("Fetching UI Libraries...")
  const libs = await Promise.all(
    libSources.map(async (source): Promise<FetchedLibrary | null> => {
      const resolvedSource = resolveUISource({
        source,
        projectRoot,
      })

      if (resolvedSource.kind === "local") {
        const rootDir = resolvedSource.rootDir
        const sourceExists = await directoryExists(rootDir)
        if (!sourceExists) {
          throw new Error(
            `Local UI source path not found: ${d.path(source)} (resolved: ${d.path(rootDir)})`
          )
        }

        const filePath = join(rootDir, "ui.config.ts")
        const libConfigFile = Bun.file(filePath)
        if (!(await libConfigFile.exists())) {
          throw new Error(
            `Local UI source is missing ui.config.ts: ${d.path(source)} (expected: ${d.path(filePath)})`
          )
        }

        const configContent = (await (
          await import(filePath)
        ).config) as UILibraryWithCopyFiles

        return {
          sourceType: "local",
          url: source,
          rootDir,
          config: configContent,
          commit: undefined,
          branch: undefined,
        }
      }

      const lib = await gittar({
        url: resolvedSource.sourceUrl,
        update: "commit",
      })
      const rootDir = join(lib.outDir, lib.subpath ?? "")
      const filePath = join(rootDir, "ui.config.ts")
      const libConfigFile = Bun.file(filePath)
      if (!(await libConfigFile.exists())) {
        return null
      }
      const configContent = (await (
        await import(filePath)
      ).config) as UILibraryWithCopyFiles
      return {
        sourceType: "remote",
        url: resolvedSource.sourceUrl,
        rootDir,
        config: configContent,
        commit: lib.commit,
        branch: lib.branch,
      }
    })
  ).then((results) =>
    results.filter((lib): lib is FetchedLibrary => lib !== null)
  )
  s.stop("UI Libraries fetched successfully")

  if (libs.length === 0) {
    log.warn(
      "No compatible UI libraries found. Expected a ui.config.ts in selected sources."
    )
    return {
      selectedFrameworks: [],
      installDrafts: [],
      copyContexts: [],
      sharedDependencies: [],
      sharedDevDependencies: [],
    }
  }

  let selectedLibs: FetchedLibrary[] = []

  if (libs.length >= 2) {
    const selectedIndexes = await multiselect({
      message: "Which UI libraries would you like to install?",
      options: libs.map((lib, index) => ({
        label: lib.config.name,
        hint: `${lib.url} by ${lib.config.author}`,
        value: index,
      })),
    })
    selectedLibs = selectedIndexes.map((index) => libs[index])
  } else {
    selectedLibs = libs
  }

  const { detections: detectedFrameworks } = await detectFrameworkDetailed()
  const detectedMap = new Map(
    detectedFrameworks.map((detection) => [
      detection.framework.toLowerCase(),
      detection,
    ])
  )

  const cacheItems: UICacheItem[] = []
  const installDrafts: UIInstallDraft[] = []
  const selectedFrameworks: UISelectedFramework[] = []
  const copyContexts: UICopyLibraryContext[] = []
  const sharedDependencies = new Map<string, string>()
  const sharedDevDependencies = new Map<string, string>()

  const initialCodeRoot = await resolveInitialCodeRoot({
    projectRoot,
    uiConfig,
  })
  let codeRoot = initialCodeRoot

  for (const lib of selectedLibs) {
    const frameworkKeys = keys(lib.config.frameworks)
    const frameworkEntries = frameworkKeys.map((framework) => ({
      name: framework,
      templatePath: lib.config.frameworks[framework],
      frameworkPath: join(lib.rootDir, lib.config.frameworks[framework]),
    }))

    const initialValues: number[] = []
    frameworkEntries.forEach(({ name }, index) => {
      if (detectedMap.has(name.toLowerCase())) {
        initialValues.push(index)
      }
    })

    let selectedFrameworkEntries: typeof frameworkEntries = []
    if (frameworkEntries.length >= 2) {
      const selectedIndexes = await multiselect({
        message: `UI Library ${d.highlight(lib.config.name)} ${d.secondary(`(${lib.url})`)} supports the following frameworks. Which ones would you like to use?\n`,
        initialValues,
        options: frameworkEntries.map(({ name }, index) => {
          const detected = detectedMap.get(name.toLowerCase())
          const hint = detected
            ? `detected: ${d.highlight(detected.dependency)}@${detected.version} in ${d.path("./" + detected.packageJsonPath)}`
            : undefined
          return {
            label: name,
            value: index,
            ...(hint ? { hint } : {}),
          }
        }),
      })
      selectedFrameworkEntries = selectedIndexes.map(
        (index) => frameworkEntries[index]
      )
    } else if (frameworkEntries.length === 1) {
      selectedFrameworkEntries = [frameworkEntries[0]]
    }

    if (selectedFrameworkEntries.length === 0) {
      continue
    }

    const existingInstall = uiConfig.installs.find(
      (install) => install.sourceUrl === lib.url
    )
    codeRoot = await requestProjectPath({
      message: "Code directory root for @/ alias imports:",
      initialValue: existingInstall?.codeRoot ?? codeRoot,
      projectRoot,
      createIfMissing: true,
      createLabel: "code root directory",
    })
    const pathSelection = await requestComponentsRoot({
      libraryName: lib.config.name,
      codeRoot,
      projectRoot,
      initialValue: existingInstall?.componentsRoot,
    })
    codeRoot = pathSelection.codeRoot
    const componentsRoot = pathSelection.componentsRoot

    const hasCopyFiles = hasCopyFileEntries(
      lib.config,
      selectedFrameworkEntries.map(({ name }) => name)
    )
    const copySelection = hasCopyFiles
      ? await requestCopyFilesPlan({
          libraryName: lib.config.name,
          config: lib.config,
          selectedFrameworkEntries,
          codeRoot,
          initialCopyFilesRoot: existingInstall?.copyFilesRoot,
          projectRoot,
        })
      : {
          copyFilesRoot: codeRoot,
          copyNow: true,
        }
    const copyFilesRoot = copySelection.copyFilesRoot

    const selectedFrameworkMap = Object.fromEntries(
      selectedFrameworkEntries.map((entry) => [entry.name, entry.frameworkPath])
    )

    if (lib.sourceType === "remote") {
      cacheItems.push({
        url: lib.url,
        rootDir: lib.rootDir,
        commit: lib.commit,
        branch: lib.branch,
        config: {
          name: lib.config.name,
          url: lib.config.url,
          author: lib.config.author,
          version: lib.config.version,
        },
        frameworks: selectedFrameworkMap,
      })
    }

    const draftFrameworks: UIInstallDraftFramework[] = []
    const copyFrameworks: UICopyFrameworkContext[] = []

    for (const framework of selectedFrameworkEntries) {
      const frameworkExists = await directoryExists(framework.frameworkPath)
      if (!frameworkExists) {
        throw new Error(
          `Framework template path not found for ${lib.config.name}/${framework.name}: ${d.path(framework.frameworkPath)}`
        )
      }

      const templatePath = normalizeTemplatePath(framework.templatePath)
      const outputPath = normalizeProjectRelativePath(componentsRoot)
      const frameworkPackageJson = await readFrameworkPackageJson(
        framework.frameworkPath
      )
      for (const [name, version] of Object.entries(
        frameworkPackageJson?.dependencies ?? {}
      )) {
        if (!sharedDependencies.has(name)) {
          sharedDependencies.set(name, version)
        }
      }
      for (const [name, version] of Object.entries(
        frameworkPackageJson?.devDependencies ?? {}
      )) {
        if (!sharedDevDependencies.has(name)) {
          sharedDevDependencies.set(name, version)
        }
      }
      const sharedCopyEntries = copySelection.copyNow
        ? normalizeCopyEntries(lib.config.copyFiles?.shared)
        : []
      const frameworkCopyEntries = copySelection.copyNow
        ? normalizeCopyEntries(lib.config.copyFiles?.[framework.name])
        : []
      const allCopyEntries = [...sharedCopyEntries, ...frameworkCopyEntries]
      const frameworkCopyDestinations = getCopyDestinations({
        copyFiles: allCopyEntries,
        copyFilesRoot,
      })

      const frameworkId = `${lib.url}::${framework.name}::${templatePath}`

      draftFrameworks.push({
        id: frameworkId,
        name: framework.name,
        templatePath,
        outputPath,
      })

      selectedFrameworks.push({
        id: frameworkId,
        sourceUrl: lib.url,
        libraryName: lib.config.name,
        name: framework.name,
        codeRoot,
        templatePath,
        templateTsconfigPath: join(framework.frameworkPath, "tsconfig.json"),
        outputPath,
        copyFileDestinations: frameworkCopyDestinations,
      })

      copyFrameworks.push({
        id: frameworkId,
        name: framework.name,
        templatePath,
        outputPath,
        copyEntries: frameworkCopyEntries,
      })
    }

    installDrafts.push({
      sourceUrl: lib.url,
      libraryName: lib.config.name,
      codeRoot,
      componentsRoot,
      copyFilesRoot,
      frameworks: draftFrameworks,
    })

    copyContexts.push({
      sourceUrl: lib.url,
      libraryName: lib.config.name,
      rootDir: lib.rootDir,
      componentsRoot,
      copyFilesRoot,
      sharedCopyEntries: copySelection.copyNow
        ? normalizeCopyEntries(lib.config.copyFiles?.shared)
        : [],
      frameworks: copyFrameworks,
    })

    if (!copySelection.copyNow) {
      log.warn(
        `Skipped copying library files for ${d.highlight(lib.config.name)}. You can run ui init again later after choosing an output path.`
      )
    }
  }

  if (cacheItems.length > 0) {
    await updateUICache(
      config,
      Object.fromEntries(
        cacheItems.map((item) => [
          getUILibCacheKey(item.config.name, item.url),
          item,
        ])
      )
    )
  }

  const sharedDependencyEntries = Array.from(sharedDependencies.entries()).map(
    ([name, version]) => formatDependencySpecifier(name, version)
  )
  const sharedDevDependencyEntries = Array.from(sharedDevDependencies.entries())
    .filter(([name]) => !sharedDependencies.has(name))
    .map(([name, version]) => formatDependencySpecifier(name, version))

  return {
    selectedFrameworks,
    installDrafts,
    copyContexts,
    sharedDependencies: sharedDependencyEntries,
    sharedDevDependencies: sharedDevDependencyEntries,
  }
}

async function requestComponentsRoot(input: {
  libraryName: string
  codeRoot: string
  projectRoot: string
  initialValue?: string
}): Promise<{ componentsRoot: string; codeRoot: string }> {
  let currentCodeRoot = input.codeRoot

  while (true) {
    const preferredDefault = normalizeProjectRelativePath(
      posix.join(currentCodeRoot, "components")
    )
    const initialValue = input.initialValue ?? preferredDefault

    const componentsRoot = await requestProjectPath({
      message: `Output directory for components from ${d.highlight(input.libraryName)}:`,
      initialValue,
      projectRoot: input.projectRoot,
      createIfMissing: true,
      createLabel: "components directory",
    })

    if (isPathWithinRoot(componentsRoot, currentCodeRoot)) {
      return {
        componentsRoot,
        codeRoot: currentCodeRoot,
      }
    }

    log.error(
      `Components path ${d.path(componentsRoot)} must be inside code root ${d.path(currentCodeRoot)}.`
    )

    const nextStep = await select<"retry-components" | "change-root">({
      message: "Fix components path or change code root?",
      initialValue: "retry-components",
      options: [
        {
          label: "Re-enter components path",
          value: "retry-components",
        },
        {
          label: "Change code root",
          value: "change-root",
        },
      ],
    })

    if (nextStep === "change-root") {
      currentCodeRoot = await requestProjectPath({
        message: "Code directory root for @/ alias imports:",
        initialValue: currentCodeRoot,
        projectRoot: input.projectRoot,
        createIfMissing: true,
        createLabel: "code root directory",
      })
      input.initialValue = undefined
    }
  }
}

async function requestProjectPath(input: {
  message: string
  initialValue: string
  projectRoot: string
  createIfMissing?: boolean
  createLabel?: string
}): Promise<string> {
  const result = await path({
    message: input.message,
    directory: true,
    initialValue: input.initialValue,
    validate: (value) => {
      const normalized = normalizeProjectRelativePath(value ?? "")
      if (normalized.length === 0) {
        return "Path is required"
      }

      if (isAbsolute(normalized)) {
        return "Use a project-relative path"
      }

      const pathOnDisk = resolve(input.projectRoot, normalized)
      if (existsSync(pathOnDisk)) {
        try {
          const stats = lstatSync(pathOnDisk)
          if (!stats.isDirectory()) {
            return "Please choose a directory path"
          }
        } catch {
          return "Invalid path"
        }
      }

      return undefined
    },
  })
  const normalized = normalizeProjectRelativePath(result)
  const pathOnDisk = resolve(input.projectRoot, normalized)

  if (input.createIfMissing && !existsSync(pathOnDisk)) {
    const shouldCreate = await confirm({
      message: `${input.createLabel ?? "Directory"} ${d.path(normalized)} does not exist. Create it now?`,
      initialValue: true,
    })

    if (shouldCreate) {
      await mkdir(pathOnDisk, { recursive: true })
      log.info(
        `Created ${input.createLabel ?? "directory"} ${d.path(normalized)}.`
      )
    }
  }

  return normalized
}

async function requestCopyFilesPlan(input: {
  libraryName: string
  config: UILibraryWithCopyFiles
  selectedFrameworkEntries: Array<{
    name: string
    templatePath: string
    frameworkPath: string
  }>
  codeRoot: string
  initialCopyFilesRoot?: string
  projectRoot: string
}): Promise<{ copyFilesRoot: string; copyNow: boolean }> {
  let copyFilesRoot = normalizeProjectRelativePath(
    input.initialCopyFilesRoot ?? input.codeRoot
  )

  while (true) {
    const previewDestinations = collectCopyDestinationPreview({
      config: input.config,
      frameworkNames: input.selectedFrameworkEntries.map((entry) => entry.name),
      copyFilesRoot,
    })

    const lines = [
      `${d.highlight("Library:")} ${input.libraryName}`,
      `${d.highlight("Root replacing src/:")} ${d.path(copyFilesRoot)}`,
      "",
      d.highlight("Files to be copied:"),
      ...previewDestinations,
    ]
    box(lines.join("\n"), "Copied library files")

    const approved = await confirm({
      message: "Are you happy with these copied file paths?",
      initialValue: true,
    })
    if (approved) {
      const finalRoot = await ensureDirectoryIfMissing({
        projectRoot: input.projectRoot,
        projectRelativePath: copyFilesRoot,
        createLabel: "copied files directory",
      })
      return {
        copyFilesRoot: finalRoot,
        copyNow: true,
      }
    }

    const nextStep = await select<"different-path" | "later">({
      message: "What would you like to do?",
      initialValue: "different-path",
      options: [
        {
          label: "Select different path",
          value: "different-path",
        },
        {
          label: "I'll do it later",
          value: "later",
        },
      ],
    })

    if (nextStep === "later") {
      return {
        copyFilesRoot,
        copyNow: false,
      }
    }

    copyFilesRoot = await requestProjectPath({
      message: `Output directory for copied library files from ${d.highlight(input.libraryName)}:`,
      initialValue: copyFilesRoot,
      projectRoot: input.projectRoot,
      createIfMissing: false,
    })
  }
}

function collectCopyDestinationPreview(input: {
  config: UILibraryWithCopyFiles
  frameworkNames: string[]
  copyFilesRoot: string
}): string[] {
  const destinations = new Set<string>()

  for (const entry of normalizeCopyEntries(input.config.copyFiles?.shared)) {
    const target = entry.dest ?? entry.src
    destinations.add(mapCopyDestination(target, input.copyFilesRoot))
  }

  for (const frameworkName of input.frameworkNames) {
    for (const entry of normalizeCopyEntries(
      input.config.copyFiles?.[frameworkName]
    )) {
      const target = entry.dest ?? entry.src
      destinations.add(mapCopyDestination(target, input.copyFilesRoot))
    }
  }

  const sorted = Array.from(destinations).sort()
  if (sorted.length === 0) {
    return [d.secondary("  (no files)")]
  }

  const maxPreview = 10
  const preview = sorted
    .slice(0, maxPreview)
    .map((value) => `  - ${d.path(value)}`)
  if (sorted.length > maxPreview) {
    preview.push(d.secondary(`  ...and ${sorted.length - maxPreview} more`))
  }
  return preview
}

async function ensureDirectoryIfMissing(input: {
  projectRoot: string
  projectRelativePath: string
  createLabel: string
}): Promise<string> {
  const normalized = normalizeProjectRelativePath(input.projectRelativePath)
  const fullPath = resolve(input.projectRoot, normalized)
  if (existsSync(fullPath)) {
    return normalized
  }

  const shouldCreate = await confirm({
    message: `${input.createLabel} ${d.path(normalized)} does not exist. Create it now?`,
    initialValue: true,
  })

  if (!shouldCreate) {
    return normalized
  }

  await mkdir(fullPath, { recursive: true })
  log.info(`Created ${input.createLabel} ${d.path(normalized)}.`)
  return normalized
}

function hasCopyFileEntries(
  config: UILibraryWithCopyFiles,
  frameworks: string[]
): boolean {
  const sharedFiles = normalizeCopyEntries(config.copyFiles?.shared)
  if (sharedFiles.length > 0) {
    return true
  }

  return frameworks.some(
    (framework) =>
      normalizeCopyEntries(config.copyFiles?.[framework]).length > 0
  )
}

function getCopyDestinations(input: {
  copyFiles: UICopyEntry[]
  copyFilesRoot: string
}): string[] {
  return input.copyFiles.map((file) => {
    const targetPath = file.dest ?? file.src
    return mapCopyDestination(targetPath, input.copyFilesRoot)
  })
}

function mapCopyDestination(
  destTemplate: string,
  copyFilesRoot: string
): string {
  const normalizedDest = normalizeProjectRelativePath(destTemplate)
  const normalizedRoot = normalizeProjectRelativePath(copyFilesRoot)

  if (normalizedDest === "src") {
    return normalizedRoot
  }

  if (normalizedDest.startsWith("src/")) {
    return normalizeProjectRelativePath(
      posix.join(normalizedRoot, normalizedDest.slice("src/".length))
    )
  }

  if (
    normalizedDest === normalizedRoot ||
    normalizedDest.startsWith(`${normalizedRoot}/`)
  ) {
    return normalizedDest
  }

  return normalizeProjectRelativePath(
    posix.join(normalizedRoot, normalizedDest)
  )
}

type FrameworkPackageJson = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

async function readFrameworkPackageJson(
  frameworkPath: string
): Promise<FrameworkPackageJson | null> {
  const packageJsonPath = join(frameworkPath, "package.json")
  const packageFile = Bun.file(packageJsonPath)
  if (!(await packageFile.exists())) {
    return null
  }

  try {
    return (await packageFile.json()) as FrameworkPackageJson
  } catch {
    return null
  }
}

function formatDependencySpecifier(name: string, version: string): string {
  return version === "*" ? name : `${name}@${version}`
}

function normalizeCopyEntries(entries?: UICopyEntry[]): UICopyEntry[] {
  if (!entries || entries.length === 0) {
    return []
  }
  return entries.map((entry) => ({
    src: normalizeProjectRelativePath(entry.src),
    dest:
      typeof entry.dest === "string"
        ? normalizeProjectRelativePath(entry.dest)
        : undefined,
    required: entry.required ?? true,
    description: entry.description,
  }))
}

function normalizeTemplatePath(value: string): string {
  return normalizeProjectRelativePath(value)
}

function isPathWithinRoot(path: string, root: string): boolean {
  const normalizedPath = normalizeProjectRelativePath(path)
  const normalizedRoot = normalizeProjectRelativePath(root)

  if (normalizedRoot === ".") {
    return true
  }

  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  )
}

async function resolveInitialCodeRoot(input: {
  projectRoot: string
  uiConfig: UIProjectConfig
}): Promise<string> {
  const existingRoot = findExistingCodeRoot(input.uiConfig)
  if (existingRoot) {
    return existingRoot
  }

  const inferredRoot = await inferCodeRootFromTsconfig(input.projectRoot)
  if (inferredRoot) {
    return inferredRoot
  }

  return "src"
}

function findExistingCodeRoot(uiConfig: UIProjectConfig): string | null {
  if (uiConfig.installs.length === 0) {
    return null
  }

  const firstComponentsRoot = normalizeProjectRelativePath(
    uiConfig.installs[0]?.componentsRoot ?? ""
  )
  if (firstComponentsRoot === ".") {
    return null
  }

  const segments = firstComponentsRoot.split("/")
  if (segments.length === 0 || !segments[0]) {
    return null
  }

  return segments[0]
}

async function inferCodeRootFromTsconfig(
  projectRoot: string
): Promise<string | null> {
  const tsconfigPath = join(projectRoot, "tsconfig.json")
  const file = Bun.file(tsconfigPath)

  try {
    const raw = await file.text()
    const parsed = JSON.parse(raw) as {
      include?: unknown
    }
    if (!Array.isArray(parsed.include)) {
      return null
    }

    for (const entry of parsed.include) {
      if (typeof entry !== "string") {
        continue
      }

      const normalized = normalizeProjectRelativePath(entry)
      if (normalized === "src" || normalized === "src/**") {
        return "src"
      }

      if (normalized === ".") {
        continue
      }

      const [segment] = normalized.split("/")
      if (segment) {
        return segment
      }
    }

    return null
  } catch {
    return null
  }
}
