import { d } from "@/decorators"
import { getUILibCacheKey, updateUICache } from "@/lib/cache"
import { resolveAbsolute } from "@/lib/shared/bunUtils"
import { detectFrameworkDetailed } from "@/lib/shared/detectFramework"
import type { PackageJson } from "@/lib/shared/getPackageFiles"
import {
  defaultUISources,
  normalizeProjectRelativePath,
  type UIProjectConfig,
} from "@/lib/ui/config"
import { box } from "@/prompts/box"
import { confirm } from "@/prompts/confirm"
import { log } from "@/prompts/log"
import { multiselect } from "@/prompts/multiselect"
import { spinner } from "@/prompts/spinner"
import { text } from "@/prompts/text"
import type { HullaConfig, UISelectedFramework } from "@/types"
import { entries, keys, values } from "@/utils/objects"
import gittar from "@hulla/gittar"
import { join, posix } from "path"
import { cwd } from "process"
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

type FetchedLibrary = {
  url: string
  rootDir: string
  config: UILibraryWithCopyFiles
  commit: string | undefined
  branch: string | undefined
}

type NormalizedCopyFile = {
  src: string
  dest: string
  required: boolean
  description?: string
}

type UILibraryWithCopyFiles = UILibrary & {
  copyFiles?: {
    shared?: NormalizedCopyFile[]
  } & Record<string, NormalizedCopyFile[]>
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
}> {
  const libSources =
    uiConfig.sources.length > 0 ? uiConfig.sources : defaultUISources

  const s = spinner()
  s.start("Fetching UI Libraries...")
  const libs = await Promise.all(
    libSources.map(async (url) => {
      const lib = await gittar({
        url,
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
        url,
        rootDir,
        config: configContent,
        commit: lib.commit,
        branch: lib.branch,
      } satisfies FetchedLibrary
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

  const { detections: detectedFrameworks, packageJsons } =
    await detectFrameworkDetailed()
  const detectedMap = new Map(
    detectedFrameworks.map((detection) => [
      detection.framework.toLowerCase(),
      detection,
    ])
  )

  const cacheItems: UICacheItem[] = []
  const installDrafts: UIInstallDraft[] = []
  const selectedFrameworks: UISelectedFramework[] = []

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

    const draftFrameworks: UIInstallDraftFramework[] = []

    for (const framework of selectedFrameworkEntries) {
      const templatePath = normalizeTemplatePath(framework.templatePath)
      const outputPath = normalizeProjectRelativePath(
        posix.join(componentsRoot, templatePath)
      )
      const frameworkCopyDestinations = getCopyDestinations({
        copyFiles: lib.config.copyFiles,
        framework: framework.name,
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
    }

    installDrafts.push({
      sourceUrl: lib.url,
      libraryName: lib.config.name,
      componentsRoot,
      copyFilesRoot,
      frameworks: draftFrameworks,
    })
  }

  await updateUICache(
    config,
    Object.fromEntries(
      cacheItems.map((item) => [
        getUILibCacheKey(item.config.name, item.url),
        item,
      ])
    )
  )

  // Collect dependencies from all selected framework package.json files
  const depsMap = new Map<string, string>()
  const devDepsMap = new Map<string, string>()

  for (const cacheItem of cacheItems) {
    for (const frameworkPath of values(cacheItem.frameworks)) {
      const packageJsonPath = join(frameworkPath, "package.json")
      const packageJson = await readFrameworkPackageJson(packageJsonPath)
      if (!packageJson) continue

      if (packageJson.dependencies) {
        for (const [name, version] of entries(packageJson.dependencies)) {
          if (!depsMap.has(name)) {
            depsMap.set(name, version)
          }
        }
      }

      if (packageJson.devDependencies) {
        for (const [name, version] of entries(packageJson.devDependencies)) {
          if (!devDepsMap.has(name)) {
            devDepsMap.set(name, version)
          }
        }
      }
    }
  }

  const rootPackageJsonPath = resolveAbsolute(cwd(), "package.json")
  const projectPackageJson = packageJsons.get(rootPackageJsonPath)
  const installedDeps = new Set<string>([
    ...keys(projectPackageJson?.dependencies ?? {}),
    ...keys(projectPackageJson?.devDependencies ?? {}),
  ])

  const { toInstall: depsToInstall, skipped: skippedDeps } =
    filterAndFormatDeps(depsMap, installedDeps)
  const { toInstall: devDepsToInstall, skipped: skippedDevDeps } =
    filterAndFormatDeps(devDepsMap, installedDeps)

  const hasAnythingToInstall =
    depsToInstall.length > 0 || devDepsToInstall.length > 0
  const allSkipped = [...skippedDeps, ...skippedDevDeps]

  if (!hasAnythingToInstall) {
    log.info("All required dependencies are already installed")
    return { selectedFrameworks, installDrafts }
  }

  const boxLines: string[] = []

  if (depsToInstall.length > 0) {
    boxLines.push(d.highlight("Dependencies:"))
    depsToInstall.forEach((dep) => boxLines.push(`  ${d.success("+")} ${dep}`))
  }

  if (devDepsToInstall.length > 0) {
    if (boxLines.length > 0) boxLines.push("")
    boxLines.push(d.highlight("Dev Dependencies:"))
    devDepsToInstall.forEach((dep) =>
      boxLines.push(`  ${d.success("+")} ${dep}`)
    )
  }

  if (allSkipped.length > 0) {
    if (boxLines.length > 0) boxLines.push("")
    boxLines.push(d.secondary("Already installed:"))
    allSkipped.forEach((dep) => boxLines.push(`  ${d.secondary("~")} ${dep}`))
  }

  box(boxLines.join("\n"), "Required Dependencies")

  const shouldInstall = await confirm({
    message: "Would you like to install these dependencies now?",
    initialValue: true,
  })

  if (!shouldInstall) {
    log.warn(
      "Make sure to install the dependencies manually, otherwise the UI library may not work properly"
    )
    return { selectedFrameworks, installDrafts }
  }

  if (allSkipped.length > 0) {
    log.info(`Skipping already installed: ${allSkipped.join(", ")}`)
  }

  if (depsToInstall.length > 0) {
    const { add } = config.cli.scripts
    const [command, ...args] = add.split(" ")
    s.start("Installing dependencies...")
    const proc = Bun.spawn([command, ...args, ...depsToInstall], {
      stdout: "inherit",
      stderr: "inherit",
    })
    await proc.exited
    if (proc.exitCode !== 0) {
      s.stop("Failed to install dependencies")
      throw new Error(
        `Failed to install dependencies (exit code: ${proc.exitCode})`
      )
    }
    s.stop("Dependencies installed successfully")
  }

  if (devDepsToInstall.length > 0) {
    const { addDev } = config.cli.scripts
    const [command, ...args] = addDev.split(" ")
    s.start("Installing dev dependencies...")
    const proc = Bun.spawn([command, ...args, ...devDepsToInstall], {
      stdout: "inherit",
      stderr: "inherit",
    })
    await proc.exited
    if (proc.exitCode !== 0) {
      s.stop("Failed to install dev dependencies")
      throw new Error(
        `Failed to install dev dependencies (exit code: ${proc.exitCode})`
      )
    }
    s.stop("Dev dependencies installed successfully")
  }

  return { selectedFrameworks, installDrafts }
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
  const sharedFiles = config.copyFiles?.shared ?? []
  if (sharedFiles.length > 0) {
    return true
  }

  return frameworks.some(
    (framework) => (config.copyFiles?.[framework] ?? []).length > 0
  )
}

function getCopyDestinations(input: {
  copyFiles: UILibraryWithCopyFiles["copyFiles"]
  framework: string
  copyFilesRoot: string
}): string[] {
  const sharedFiles = input.copyFiles?.shared ?? []
  const frameworkFiles = input.copyFiles?.[input.framework] ?? []
  const allFiles = [...sharedFiles, ...frameworkFiles]

  return allFiles.map((file) => {
    const targetPath = file.dest ?? file.src
    return normalizeProjectRelativePath(
      posix.join(input.copyFilesRoot, targetPath)
    )
  })
}

function normalizeTemplatePath(value: string): string {
  return normalizeProjectRelativePath(value)
}

async function readFrameworkPackageJson(
  path: string
): Promise<PackageJson | null> {
  try {
    const file = Bun.file(path)
    if (!(await file.exists())) return null
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
  for (const [name, version] of depsMap) {
    if (installedDeps.has(name)) {
      skipped.push(name)
      continue
    }
    toInstall.push(version === "*" ? name : `${name}@${version}`)
  }
  return { toInstall, skipped }
}
