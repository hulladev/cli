import {
  getPackageJson,
  getProjectPackageDirectories,
} from "@/platform/package-json"
import { log } from "@/terminal/prompts/log"
import { createRequire } from "node:module"
import { join, relative } from "node:path"
import {
  classifyDependencySpecs,
  type ClassifiedDependencies,
} from "./dependency-versions"

/** Library-declared development dependencies can be supplied by a declared workspace root.
 * Runtime dependencies deliberately do not use this path.
 */
export async function classifyWorkspaceDevDependencies(input: {
  dependencies: Iterable<[string, string]>
  projectRoot: string
}): Promise<ClassifiedDependencies> {
  const directories = await getProjectPackageDirectories(input.projectRoot)
  const local = await getPackageJson(input.projectRoot, "package.json")
  const remaining: Array<[string, string]> = []
  const inherited: ClassifiedDependencies["satisfied"] = []
  for (const [name, required] of input.dependencies) {
    if (local?.dependencies?.[name] || local?.devDependencies?.[name]) {
      remaining.push([name, required])
      continue
    }
    let supplied = false
    for (const directory of directories.slice(1)) {
      const root = await getPackageJson(directory, "package.json")
      const declared =
        root?.devDependencies?.[name] ?? root?.dependencies?.[name]
      if (!declared) continue
      let installed = declared
      try {
        const path = createRequire(join(directory, "package.json")).resolve(
          `${name}/package.json`
        )
        installed = (await Bun.file(path).json()).version as string
      } catch {
        // Without an installed version, only an exact version or identical/unconstrained
        // declaration proves compatibility. Do not infer what an unknown tool does.
      }
      const compatible =
        required === "*" ||
        (/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(installed)
          ? Bun.semver.satisfies(installed, required)
          : declared === required)
      if (!compatible)
        throw new Error(
          `Cannot reuse workspace dev dependency ${name}@${declared} from ${join(directory, "package.json")}; the registry requires ${required}. Install a compatible version at the root, or explicitly declare the dependency in this app.`
        )
      inherited.push({ name, installed, required })
      log.info(
        `Reusing workspace dev dependency ${name}@${installed} from ${relative(input.projectRoot, directory) || "."}.`
      )
      supplied = true
      break
    }
    if (!supplied) remaining.push([name, required])
  }
  const result = classifyDependencySpecs({
    dependencies: remaining,
    projectPackageJson: local,
  })
  result.satisfied.push(...inherited)
  return result
}
