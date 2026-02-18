import { getPackageJson } from "@/lib/shared/getPackageFiles"

export async function getTypescriptMajorVersion(
  cwd: string
): Promise<number | null> {
  const packageJson = await getPackageJson(cwd, "package.json")
  if (!packageJson) {
    return null
  }

  const rawVersion =
    packageJson.devDependencies?.typescript ??
    packageJson.dependencies?.typescript
  if (!rawVersion) {
    return null
  }

  const match = rawVersion.match(/(\d+)/)
  if (!match) {
    return null
  }

  const major = Number.parseInt(match[1], 10)
  return Number.isNaN(major) ? null : major
}

export function canAddBaseUrl(typescriptMajor: number | null): boolean {
  return typescriptMajor !== null && typescriptMajor < 6
}
