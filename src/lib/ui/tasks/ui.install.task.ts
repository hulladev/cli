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
import { log } from "@/prompts/log"
import { multiselect } from "@/prompts/multiselect"
import { spinner } from "@/prompts/spinner"
import { text } from "@/prompts/text"
import type { HullaConfig, UISelectedFramework } from "@/types"
import { keys } from "@/utils/objects"
import gittar from "@hulla/gittar"
import { join, posix } from "path"
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
    const componentsRoot = await requestProjectPath({
      message: `Output directory for components from ${d.highlight(lib.config.name)}:`,
      initialValue: existingInstall?.componentsRoot ?? "src/components",
      placeholder: "src/components",
    })

    const hasCopyFiles = hasCopyFileEntries(
      lib.config,
      selectedFrameworkEntries.map(({ name }) => name)
    )
    const copyFilesRoot = hasCopyFiles
      ? await requestProjectPath({
          message: `Output directory for copied library files from ${d.highlight(lib.config.name)}:`,
          initialValue:
            existingInstall?.copyFilesRoot ?? posix.dirname(componentsRoot),
          placeholder: posix.dirname(componentsRoot),
        })
      : posix.dirname(componentsRoot)

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
      const sharedCopyEntries = normalizeCopyEntries(
        lib.config.copyFiles?.shared
      )
      const frameworkCopyEntries = normalizeCopyEntries(
        lib.config.copyFiles?.[framework.name]
      )
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
      sharedCopyEntries: normalizeCopyEntries(lib.config.copyFiles?.shared),
      frameworks: copyFrameworks,
    })
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

  return { selectedFrameworks, installDrafts, copyContexts }
}

async function requestProjectPath(input: {
  message: string
  initialValue: string
  placeholder: string
}): Promise<string> {
  const result = await text({
    message: input.message,
    initialValue: input.initialValue,
    placeholder: input.placeholder,
    validate: (value) => {
      const normalized = normalizeProjectRelativePath(value ?? "")
      return normalized.length > 0 ? undefined : "Path is required"
    },
  })

  return normalizeProjectRelativePath(result)
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
    return normalizeProjectRelativePath(
      posix.join(input.copyFilesRoot, targetPath)
    )
  })
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
