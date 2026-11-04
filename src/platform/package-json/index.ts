import type { PackageManager } from "@/app/types"
import { filesExist, readJsonFile, resolveAbsolute } from "@/platform/fs/bun"
import { existsSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

export type PackageJson = {
  name: string
  version?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  packageManager?: string
  workspaces?: string[] | { packages: string[] }
}

export async function getPackageJson(
  dir: string,
  path: string
): Promise<PackageJson | null> {
  const fullPath = resolveAbsolute(dir, path)
  return readJsonFile<PackageJson>(fullPath)
}

export async function getPackageManagerFromLockfile(
  dir: string
): Promise<PackageManager | null> {
  const detections = await getLockfileDetections(dir)
  assertUnambiguousLockfiles(detections)
  return detections[0]?.manager ?? null
}

export type PackageManagerDetection = {
  manager: PackageManager
  /** Present when declared in packageManager; lockfiles usually do not identify a CLI version. */
  version?: string
  sourcePath: string
  warnings: string[]
}

/** Only inherit from a declared workspace containing this package, within its Git boundary. */
export async function getProjectPackageDirectories(
  dir: string
): Promise<string[]> {
  const projectRoot = resolve(dir)
  const directories = [projectRoot]
  let candidate = projectRoot

  while (!existsSync(join(candidate, ".git"))) {
    const parent = dirname(candidate)
    if (parent === candidate) break
    candidate = parent

    const packageJson = await getPackageJson(candidate, "package.json")
    const workspaces = packageJson?.workspaces
    const patterns = Array.isArray(workspaces)
      ? [...workspaces]
      : [...(workspaces?.packages ?? [])]
    const pnpmPath = join(candidate, "pnpm-workspace.yaml")
    if (await Bun.file(pnpmPath).exists()) {
      const yaml = Bun.YAML.parse(await Bun.file(pnpmPath).text()) as {
        packages?: unknown
      } | null
      if (Array.isArray(yaml?.packages)) {
        patterns.push(
          ...yaml.packages.filter(
            (value): value is string => typeof value === "string"
          )
        )
      }
    }

    const packagePath = relative(candidate, projectRoot).replace(/\\/g, "/")
    const matches = (pattern: string) =>
      new Bun.Glob(pattern.replace(/^\.\//, "").replace(/\/+$/, "")).match(
        packagePath
      )
    if (
      patterns.some(
        (pattern) => !pattern.startsWith("!") && matches(pattern)
      ) &&
      !patterns.some(
        (pattern) => pattern.startsWith("!") && matches(pattern.slice(1))
      )
    ) {
      directories.push(candidate)
      break
    }
  }

  return directories
}

/** Explicit packageManager fields take precedence over lockfiles, nearest package first. */
export async function detectPackageManager(
  dir: string
): Promise<PackageManagerDetection | null> {
  const directories = await getProjectPackageDirectories(dir)
  const lockfiles = (
    await Promise.all(directories.map(getLockfileDetections))
  ).flat()

  for (const directory of directories) {
    const packageJson = await getPackageJson(directory, "package.json")
    if (!packageJson?.packageManager) continue

    const sourcePath = join(directory, "package.json")
    const name = packageJson.packageManager.split("@")[0]
    if (
      name !== "npm" &&
      name !== "pnpm" &&
      name !== "yarn" &&
      name !== "bun"
    ) {
      throw new Error(
        `Unsupported packageManager ${JSON.stringify(packageJson.packageManager)} in ${sourcePath}. Set a supported packageManager (npm, pnpm, yarn, bun), or configure custom cli.scripts in .hulla/hulla.json.`
      )
    }

    return {
      manager: name,
      version: packageJson.packageManager.split("@")[1],
      sourcePath,
      warnings: lockfiles
        .filter((lockfile) => lockfile.manager !== name)
        .map(
          (lockfile) =>
            `Ignoring ${lockfile.sourcePath}: it indicates ${lockfile.manager}, but ${sourcePath} explicitly selects ${name}. Remove stale lockfiles if they are no longer used.`
        ),
    }
  }

  assertUnambiguousLockfiles(lockfiles)
  return lockfiles[0] ? { ...lockfiles[0], warnings: [] } : null
}

type LockfileDetection = Pick<PackageManagerDetection, "manager" | "sourcePath">

async function getLockfileDetections(
  dir: string
): Promise<LockfileDetection[]> {
  const lockfiles = [
    { file: "package-lock.json", pm: "npm" as const },
    { file: "pnpm-lock.yaml", pm: "pnpm" as const },
    { file: "yarn.lock", pm: "yarn" as const },
    { file: "bun.lockb", pm: "bun" as const },
    { file: "bun.lock", pm: "bun" as const },
  ]

  const paths = lockfiles.map(({ file }) => resolveAbsolute(dir, file))
  const existsMap = await filesExist(paths)
  return lockfiles.flatMap(({ pm }, i) =>
    existsMap.get(paths[i]) ? [{ manager: pm, sourcePath: paths[i] }] : []
  )
}

function assertUnambiguousLockfiles(lockfiles: LockfileDetection[]): void {
  if (new Set(lockfiles.map(({ manager }) => manager)).size > 1) {
    throw new Error(
      `Conflicting package manager lockfiles: ${lockfiles.map(({ sourcePath }) => sourcePath).join(", ")}. Set packageManager in package.json to select the intended manager, or remove stale lockfiles.`
    )
  }
}
