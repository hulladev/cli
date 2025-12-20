import type { PackageManager } from "@/types.private"
import { filesExist, readJsonFile, resolveAbsolute } from "./bunUtils"

export type PackageJson = {
  name: string
  version?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  packageManager?: string
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
  // Define lockfile patterns with their package managers
  const lockfiles = [
    { file: "package-lock.json", pm: "npm" as const },
    { file: "pnpm-lock.yaml", pm: "pnpm" as const },
    { file: "yarn.lock", pm: "yarn" as const },
    { file: "bun.lockb", pm: "bun" as const },
    { file: "bun.lock", pm: "bun" as const },
  ]

  // Check all files in parallel
  const paths = lockfiles.map(({ file }) => resolveAbsolute(dir, file))
  const existsMap = await filesExist(paths)

  // Return first match in priority order
  for (let i = 0; i < paths.length; i++) {
    if (existsMap.get(paths[i])) {
      return lockfiles[i].pm
    }
  }

  return null
}
