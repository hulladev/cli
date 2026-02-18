import { d } from "@/decorators"
import { getUILibCacheKey, updateUICache } from "@/lib/cache"
import { resolveAbsolute } from "@/lib/shared/bunUtils"
import { detectFrameworkDetailed } from "@/lib/shared/detectFramework"
import type { PackageJson } from "@/lib/shared/getPackageFiles"
import { box } from "@/prompts/box"
import { confirm } from "@/prompts/confirm"
import { log } from "@/prompts/log"
import { multiselect } from "@/prompts/multiselect"
import { spinner } from "@/prompts/spinner"
import type { HullaConfig, UISelectedFramework } from "@/types"
import { entries, keys, values } from "@/utils/objects"
import gittar from "@hulla/gittar"
import type { UILibrary } from "@hulla/ui"
import { join } from "path"
import { cwd } from "process"
import { defaultUiConfig, type UICacheItem } from "schemas/hulla.schema"

export async function createUiInstallTask(
  config: HullaConfig
): Promise<{ selectedFrameworks: UISelectedFramework[] }> {
  const libUrls = config.ui?.libs ?? defaultUiConfig.libs

  const s = spinner()
  s.start("Fetching UI Libraries...")
  const libs = await Promise.all(
    libUrls.map(async ({ url }) => {
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
      const configContent = (await (await import(filePath)).config) as UILibrary
      return { ...lib, rootDir, config: configContent, url }
    })
  ).then((results) => results.filter((lib) => lib !== null))
  s.stop("UI Libraries fetched successfully")

  let selectedLibs: typeof libs = []

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

  // Map all frameworks with resolved paths
  const cacheItems: UICacheItem[] = await Promise.all(
    selectedLibs.map(async (lib) => {
      const frameworkKeys = keys(lib.config.frameworks)
      const frameworkEntries = frameworkKeys.map((framework) => [
        framework,
        join(lib.rootDir, lib.config.frameworks[framework]),
      ])

      // Create a map of detected frameworks for quick lookup
      const detectedMap = new Map(
        detectedFrameworks.map((d) => [d.framework.toLowerCase(), d])
      )

      // Find initial values (frameworks that match detection)
      const initialValues: number[] = []
      frameworkEntries.forEach(([framework], index) => {
        const detected = detectedMap.get(framework.toLowerCase())
        if (detected) {
          initialValues.push(index)
        }
      })

      let selectedFrameworks: UICacheItem["frameworks"] = {}
      if (frameworkKeys.length >= 2) {
        const selectedIndexes = await multiselect({
          message: `UI Library ${d.highlight(lib.config.name)} ${d.secondary(`(${lib.url})`)} supports the following frameworks. Which ones would you like to use?\n`,
          initialValues: initialValues,
          options: frameworkEntries.map(([framework], index) => {
            const detected = detectedMap.get(framework.toLowerCase())
            const hint = detected
              ? `detected: ${d.highlight(detected.dependency)}@${detected.version} in ${d.path("./" + detected.packageJsonPath)}`
              : undefined
            return {
              label: framework,
              value: index,
              ...(hint && { hint }),
            }
          }),
        })
        selectedFrameworks = Object.fromEntries(
          selectedIndexes.map((index) => [
            frameworkEntries[index][0],
            frameworkEntries[index][1],
          ])
        )
      } else if (frameworkKeys.length === 1) {
        // If only one framework is available, auto-select it
        const [framework] = frameworkEntries[0]
        selectedFrameworks = {
          [framework]: frameworkEntries[0][1],
        }
      }

      return {
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
        frameworks: selectedFrameworks,
      }
    })
  )

  updateUICache(
    config,
    Object.fromEntries(
      cacheItems.map((item) => [
        getUILibCacheKey(item.config.name, item.url),
        item,
      ])
    )
  )

  const selectedFrameworks = extractSelectedFrameworks(cacheItems)

  // Collect dependencies from all selected framework package.json files
  const depsMap = new Map<string, string>()
  const devDepsMap = new Map<string, string>()

  for (const cacheItem of cacheItems) {
    for (const frameworkPath of values(cacheItem.frameworks)) {
      const packageJsonPath = join(frameworkPath, "package.json")
      const packageJson = await readFrameworkPackageJson(packageJsonPath)
      if (!packageJson) continue

      // Merge dependencies
      if (packageJson.dependencies) {
        for (const [name, version] of entries(packageJson.dependencies)) {
          if (!depsMap.has(name)) {
            depsMap.set(name, version)
          }
        }
      }

      // Merge devDependencies
      if (packageJson.devDependencies) {
        for (const [name, version] of entries(packageJson.devDependencies)) {
          if (!devDepsMap.has(name)) {
            devDepsMap.set(name, version)
          }
        }
      }
    }
  }

  // Use the already-read project package.json to check existing deps
  const rootPackageJsonPath = resolveAbsolute(cwd(), "package.json")
  const projectPackageJson = packageJsons.get(rootPackageJsonPath)
  const installedDeps = new Set<string>([
    ...keys(projectPackageJson?.dependencies ?? {}),
    ...keys(projectPackageJson?.devDependencies ?? {}),
  ])

  // Filter out already installed dependencies
  const { toInstall: depsToInstall, skipped: skippedDeps } =
    filterAndFormatDeps(depsMap, installedDeps)
  const { toInstall: devDepsToInstall, skipped: skippedDevDeps } =
    filterAndFormatDeps(devDepsMap, installedDeps)

  // Check if there's anything to install
  const hasAnythingToInstall =
    depsToInstall.length > 0 || devDepsToInstall.length > 0
  const allSkipped = [...skippedDeps, ...skippedDevDeps]

  if (!hasAnythingToInstall) {
    log.info("All required dependencies are already installed")
    return { selectedFrameworks }
  }

  // Build box content showing full dependency overview
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

  // Ask for confirmation
  const shouldInstall = await confirm({
    message: "Would you like to install these dependencies now?",
    initialValue: true,
  })

  if (!shouldInstall) {
    log.warn(
      "Make sure to install the dependencies manually, otherwise the UI library may not work properly"
    )
    return { selectedFrameworks }
  }

  // Log skipped dependencies after confirmation
  if (allSkipped.length > 0) {
    log.info(`Skipping already installed: ${allSkipped.join(", ")}`)
  }

  // Install dependencies
  if (depsToInstall.length > 0) {
    const { add } = config.cli.scripts
    const [command, ...args] = add.split(" ")
    s.start(`Installing dependencies...`)
    const proc = Bun.spawn([command, ...args, ...depsToInstall], {
      stdout: "inherit",
      stderr: "inherit",
    })
    await proc.exited
    if (proc.exitCode !== 0) {
      s.stop(`Failed to install dependencies`)
      throw new Error(
        `Failed to install dependencies (exit code: ${proc.exitCode})`
      )
    }
    s.stop(`Dependencies installed successfully`)
  }

  // Install devDependencies
  if (devDepsToInstall.length > 0) {
    const { addDev } = config.cli.scripts
    const [command, ...args] = addDev.split(" ")
    s.start(`Installing dev dependencies...`)
    const proc = Bun.spawn([command, ...args, ...devDepsToInstall], {
      stdout: "inherit",
      stderr: "inherit",
    })
    await proc.exited
    if (proc.exitCode !== 0) {
      s.stop(`Failed to install dev dependencies`)
      throw new Error(
        `Failed to install dev dependencies (exit code: ${proc.exitCode})`
      )
    }
    s.stop(`Dev dependencies installed successfully`)
  }

  return { selectedFrameworks }
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
    // If version is "*", just use the package name
    // Otherwise use name@version syntax
    toInstall.push(version === "*" ? name : `${name}@${version}`)
  }
  return { toInstall, skipped }
}

function extractSelectedFrameworks(
  cacheItems: UICacheItem[]
): UISelectedFramework[] {
  const frameworks = cacheItems.flatMap((item) =>
    entries(item.frameworks).map(([name, frameworkPath]) => ({
      name,
      templateTsconfigPath: join(frameworkPath, "tsconfig.json"),
    }))
  )

  const deduped = new Map<string, UISelectedFramework>()
  for (const framework of frameworks) {
    const key = `${framework.name.toLowerCase()}:${framework.templateTsconfigPath}`
    if (!deduped.has(key)) {
      deduped.set(key, framework)
    }
  }

  return [...deduped.values()]
}
