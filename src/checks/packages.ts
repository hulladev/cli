import { readJsonFile } from "@/platform/fs/bun"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import type { CheckContext, CheckResult } from "./types"

type InstalledPackage = {
  name: string
  version: string
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

// Read manifests without importing package entrypoints or executing project code.
// Walking node_modules also supports packages that do not export package.json.
export async function findInstalledPackage(
  root: string,
  name: string
): Promise<InstalledPackage | null> {
  let directory = root
  while (true) {
    const path = join(directory, "node_modules", name, "package.json")
    const manifest = await readJsonFile<InstalledPackage>(path)
    if (manifest) {
      if (manifest.name !== name || typeof manifest.version !== "string") {
        throw new Error(`Invalid installed package manifest: ${path}`)
      }
      return manifest
    }
    const parent = dirname(directory)
    if (parent === directory) return null
    directory = parent
  }
}

export async function checkPackages(
  context: CheckContext,
  names: string[],
  options: { runtime?: boolean } = {}
): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  for (const name of [...new Set(names)].sort()) {
    try {
      if (!Object.hasOwn(context.dependencies, name)) {
        results.push({
          id: `declared:${name}`,
          status: "failure",
          message: `${name} is required but is not declared in this package.`,
          fix: `Add ${name} to this package's dependencies.`,
        })
      }
      const installed = await findInstalledPackage(context.root, name)
      if (!installed) {
        results.push({
          id: `package:${name}`,
          status: "failure",
          message: `${name} is not installed.`,
          fix: `Install dependencies in this workspace; declare ${name} here if it is required.`,
        })
        continue
      }
      const spec = context.dependencies[name]
      const matches = !spec || matchesVersion(installed.version, spec)
      results.push({
        id: `package:${name}`,
        status: matches === false ? "failure" : "pass",
        message: `${name}@${installed.version}${matches === false ? ` does not satisfy declared ${spec}.` : " is installed."}`,
        ...(matches === false
          ? { fix: "Reinstall dependencies to match package.json." }
          : {}),
      })

      let entrypoint = false
      try {
        const path = Bun.resolveSync(name, context.root)
        entrypoint = existsSync(path)
      } catch {
        // Report a missing/broken runtime export, without loading it.
      }
      if (!entrypoint && options.runtime !== false)
        results.push({
          id: `entrypoint:${name}`,
          status: "failure",
          message: `${name} has no resolvable runtime entrypoint.`,
          fix: "Reinstall the package, or build it if it is a local workspace dependency.",
        })

      // Resolve peers from the consumer, not the CLI's dependency tree. A peer
      // visible only inside an adapter's private dependencies cannot serve it.
      for (const [peer, range] of Object.entries(
        installed.peerDependencies ?? {}
      )) {
        const resolved = await findInstalledPackage(context.root, peer)
        const optional = installed.peerDependenciesMeta?.[peer]?.optional
        if (!resolved && optional) continue
        const matches = resolved && matchesVersion(resolved.version, range)
        results.push({
          id: `peer:${name}:${peer}`,
          status:
            !resolved || matches === false
              ? "failure"
              : matches === null
                ? "warning"
                : "pass",
          message: !resolved
            ? `${name} requires peer ${peer}@${range}, which is not installed.`
            : `${name} requires ${peer}@${range}; found ${resolved.version}.${matches === null ? " This range could not be checked." : ""}`,
          ...(!resolved || matches === false
            ? {
                fix: `Install a compatible ${peer}@${range} in this workspace.`,
              }
            : {}),
        })
      }
    } catch (error) {
      results.push({
        id: `package:${name}`,
        status: "failure",
        message: error instanceof Error ? error.message : String(error),
        fix: "Check the installed package manifest and reinstall dependencies.",
      })
    }
  }
  return results
}

function matchesVersion(version: string, range: string): boolean | null {
  if (/^(workspace:|file:|link:|git\+)|:\/\//.test(range)) return null
  // Bun.semver accepts non-semver strings as unsatisfied; distinguish those
  // from a real version conflict rather than rejecting tags such as "latest".
  if (!/^(?:[~^<>=*v\d]|\bx\b)/.test(range)) return null
  try {
    return Bun.semver.satisfies(version, range)
  } catch {
    return null
  }
}
