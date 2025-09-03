import type { PackageManager } from "@/types.private"
import { existsSync } from "fs"
import { readFile } from "fs/promises"
import { join } from "path"

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
  try {
    const packageJson = await readFile(join(dir, path), {
      encoding: "utf-8",
      flag: "r",
    })
    return JSON.parse(packageJson)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null // File doesn't exist, return null as expected
    }
    throw new Error(
      `Failed to read or parse package.json: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export function getPackageManagerFromLockfile(
  dir: string
): PackageManager | null {
  if (existsSync(join(dir, "package-lock.json"))) {
    return "npm"
  }
  if (existsSync(join(dir, "pnpm-lock.yaml"))) {
    return "pnpm"
  }
  if (existsSync(join(dir, "yarn.lock"))) {
    return "yarn"
  }
  if (existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock"))) {
    return "bun"
  }
  return null
}
