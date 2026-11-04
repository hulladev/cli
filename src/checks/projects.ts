import { readJsonFile } from "@/platform/fs/bun"
import type { PackageJson } from "@/platform/package-json"
import { readdir } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"

const ignored = new Set(["node_modules", "dist", "build", "coverage"])

export async function discoverCheckProjects(cwd: string): Promise<string[]> {
  let root = resolve(cwd)
  while (!(await Bun.file(join(root, "package.json")).exists())) {
    const parent = dirname(root)
    if (parent === root) throw new Error(`No package.json found from ${cwd}`)
    root = parent
  }

  const projects = new Set<string>()
  await addProject(root)
  return [...projects].sort()

  async function addProject(directory: string): Promise<void> {
    if (projects.has(directory)) return
    projects.add(directory)
    // The runner reports invalid manifests per project. Do not let one broken
    // workspace suppress diagnostics for its siblings during discovery.
    let manifest: PackageJson | null
    try {
      manifest = await readJsonFile<PackageJson>(
        join(directory, "package.json")
      )
    } catch {
      return
    }
    const patterns = Array.isArray(manifest?.workspaces)
      ? manifest.workspaces
      : (manifest?.workspaces?.packages ?? [])
    if (
      !Array.isArray(patterns) ||
      !patterns.every((pattern) => typeof pattern === "string")
    )
      return
    if (!patterns.length) return
    const includes = patterns
      .filter((pattern) => !pattern.startsWith("!"))
      .map((pattern) => new Bun.Glob(pattern.replace(/\/$/, "")))
    const excludes = patterns
      .filter((pattern) => pattern.startsWith("!"))
      .map((pattern) => new Bun.Glob(pattern.slice(1).replace(/\/$/, "")))
    await visit(directory)

    async function visit(parent: string): Promise<void> {
      const entries = await readdir(parent, { withFileTypes: true })
      for (const entry of entries.sort((a, b) =>
        a.name.localeCompare(b.name)
      )) {
        if (
          !entry.isDirectory() ||
          entry.name.startsWith(".") ||
          ignored.has(entry.name)
        )
          continue
        const path = join(parent, entry.name)
        const local = relative(directory, path).replace(/\\/g, "/")
        if (excludes.some((glob) => glob.match(local))) continue
        if (
          includes.some((glob) => glob.match(local)) &&
          (await Bun.file(join(path, "package.json")).exists())
        )
          await addProject(path)
        await visit(path)
      }
    }
  }
}
