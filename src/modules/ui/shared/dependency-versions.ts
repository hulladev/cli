import type { PackageJson } from "@/platform/package-json"

export type ClassifiedDependencies = {
  toInstall: string[]
  toUpdate: Array<{
    name: string
    installed: string
    required: string
    spec: string
  }>
  satisfied: Array<{
    name: string
    installed: string
    required: string
  }>
}

export function classifyDependencySpecs(input: {
  dependencies: Iterable<[string, string]>
  projectPackageJson: PackageJson | null
}): ClassifiedDependencies {
  const result: ClassifiedDependencies = {
    toInstall: [],
    toUpdate: [],
    satisfied: [],
  }

  for (const [name, required] of input.dependencies) {
    const installed = getInstalledDependencyVersion(
      input.projectPackageJson,
      name
    )
    const spec = formatDependencySpec(name, required)

    if (!installed) {
      result.toInstall.push(spec)
      continue
    }

    if (isVersionBehind(installed, required)) {
      result.toUpdate.push({
        name,
        installed,
        required,
        spec,
      })
      continue
    }

    result.satisfied.push({
      name,
      installed,
      required,
    })
  }

  return result
}

export function extractDependencyName(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    return ""
  }

  if (trimmed.startsWith("@")) {
    const separator = trimmed.indexOf("@", 1)
    if (separator === -1) {
      return trimmed
    }
    return trimmed.slice(0, separator)
  }

  const separator = trimmed.indexOf("@")
  if (separator === -1) {
    return trimmed
  }
  return trimmed.slice(0, separator)
}

function getInstalledDependencyVersion(
  packageJson: PackageJson | null,
  name: string
): string | null {
  return (
    packageJson?.dependencies?.[name] ??
    packageJson?.devDependencies?.[name] ??
    null
  )
}

function formatDependencySpec(name: string, version: string): string {
  return version === "*" ? name : `${name}@${version}`
}

function isVersionBehind(installed: string, required: string): boolean {
  const installedVersion = coerceComparableVersion(installed)
  const requiredVersion = coerceComparableVersion(required)

  if (!installedVersion || !requiredVersion) {
    return false
  }

  return compareVersions(installedVersion, requiredVersion) < 0
}

type ComparableVersion = {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

function coerceComparableVersion(spec: string): ComparableVersion | null {
  const normalized = spec.trim()
  if (
    normalized === "" ||
    normalized === "*" ||
    normalized.startsWith("workspace:") ||
    normalized.startsWith("file:") ||
    normalized.startsWith("link:") ||
    normalized.startsWith("git+") ||
    normalized.includes("://")
  ) {
    return null
  }

  const match = normalized.match(/(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/)
  if (!match) {
    return null
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [],
  }
}

function compareVersions(a: ComparableVersion, b: ComparableVersion): number {
  if (a.major !== b.major) {
    return a.major - b.major
  }
  if (a.minor !== b.minor) {
    return a.minor - b.minor
  }
  if (a.patch !== b.patch) {
    return a.patch - b.patch
  }

  const aStable = a.prerelease.length === 0
  const bStable = b.prerelease.length === 0
  if (aStable && !bStable) {
    return 1
  }
  if (!aStable && bStable) {
    return -1
  }

  const length = Math.max(a.prerelease.length, b.prerelease.length)
  for (let i = 0; i < length; i++) {
    const aPart = a.prerelease[i]
    const bPart = b.prerelease[i]
    if (aPart === undefined) {
      return -1
    }
    if (bPart === undefined) {
      return 1
    }
    if (aPart === bPart) {
      continue
    }

    const aNumber = Number(aPart)
    const bNumber = Number(bPart)
    const aIsNumber = !Number.isNaN(aNumber)
    const bIsNumber = !Number.isNaN(bNumber)

    if (aIsNumber && bIsNumber) {
      return aNumber - bNumber
    }
    if (aIsNumber) {
      return -1
    }
    if (bIsNumber) {
      return 1
    }

    return aPart.localeCompare(bPart)
  }

  return 0
}
