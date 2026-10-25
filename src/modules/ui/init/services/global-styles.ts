import { getCliCwd } from "@/app/runtime"
import { d } from "@/decorators"
import { log } from "@/prompts/log"
import type { UISelectedFramework } from "@/types"
import { dirname, join, relative, sep } from "path"

type CreateUiGlobalStylesTaskInput = {
  frameworks: UISelectedFramework[]
}

const ASTRO_ENTRY_FILES = [
  "src/layouts/Layout.astro",
  "src/layouts/BaseLayout.astro",
  "src/pages/index.astro",
]

const REACT_ENTRY_FILES = [
  "src/main.tsx",
  "src/main.jsx",
  "src/index.tsx",
  "src/index.jsx",
  "src/main.ts",
  "src/main.js",
]

const SOLID_ENTRY_FILES = [
  "src/index.tsx",
  "src/index.jsx",
  "src/main.tsx",
  "src/main.jsx",
]

export async function createUiGlobalStylesTask({
  frameworks,
}: CreateUiGlobalStylesTaskInput): Promise<string[]> {
  const projectRoot = getCliCwd()
  const destinations = Array.from(
    new Set(
      frameworks.flatMap((framework) => framework.globalStyleDestinations)
    )
  )
  if (destinations.length === 0) {
    return []
  }

  const host = selectHostFramework(frameworks)
  if (!host) {
    log.warn(
      "The selected UI library includes global styles, but the CLI cannot activate them for the selected framework. Import them from your application entrypoint manually."
    )
    return []
  }

  const entryPath = await findEntryPath(projectRoot, host)
  if (!entryPath) {
    log.warn(
      `Could not find a ${host} application entrypoint. Import ${destinations.map((path) => d.path(path)).join(", ")} manually.`
    )
    return []
  }

  let content = await Bun.file(entryPath).text()
  const imported: string[] = []
  for (const destination of destinations) {
    const stylePath = join(projectRoot, destination)
    if (!(await Bun.file(stylePath).exists())) {
      log.warn(
        `Global style ${d.path(destination)} was declared by the UI registry but was not copied.`
      )
      continue
    }

    const specifier = toImportSpecifier(entryPath, stylePath)
    const updated = injectGlobalStyleImport(content, specifier, host)
    if (updated === content) {
      continue
    }
    content = updated
    imported.push(destination)
  }

  if (imported.length === 0) {
    return []
  }

  await Bun.write(entryPath, content)
  log.info(
    `Activated ${imported.map((path) => d.path(path)).join(", ")} in ${d.path(relative(projectRoot, entryPath))}.`
  )
  return [entryPath]
}

export function injectGlobalStyleImport(
  content: string,
  specifier: string,
  framework: "astro" | "react" | "solid"
): string {
  if (hasStyleImport(content, specifier)) {
    return content
  }

  const statement = `import "${specifier}"`
  if (framework !== "astro") {
    return `${statement}\n${content}`
  }

  const frontmatter = /^(?:\uFEFF)?---\s*\r?\n/.exec(content)
  if (frontmatter) {
    const insertAt = frontmatter[0].length
    return `${content.slice(0, insertAt)}${statement}\n${content.slice(insertAt)}`
  }

  return `---\n${statement}\n---\n\n${content}`
}

export function selectHostFramework(
  frameworks: Pick<UISelectedFramework, "name">[]
): "astro" | "react" | "solid" | null {
  const selected = new Set(
    frameworks.map((framework) => framework.name.toLowerCase())
  )
  if (selected.has("astro")) return "astro"
  if (selected.has("react")) return "react"
  if (selected.has("solid")) return "solid"
  return null
}

export async function findEntryPath(
  projectRoot: string,
  framework: "astro" | "react" | "solid"
): Promise<string | null> {
  const candidates =
    framework === "astro"
      ? ASTRO_ENTRY_FILES
      : framework === "react"
        ? REACT_ENTRY_FILES
        : SOLID_ENTRY_FILES

  for (const candidate of candidates) {
    const path = join(projectRoot, candidate)
    if (await Bun.file(path).exists()) {
      return path
    }
  }
  return null
}

function hasStyleImport(content: string, specifier: string): boolean {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`import\\s*["']${escaped}["']`).test(content)
}

function toImportSpecifier(entryPath: string, stylePath: string): string {
  const path = relative(dirname(entryPath), stylePath).split(sep).join("/")
  return path.startsWith(".") ? path : `./${path}`
}
