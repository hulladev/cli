import { getCliCwd } from "@/app/runtime"
import { d } from "@/decorators"
import { box } from "@/prompts/box"
import { confirm } from "@/prompts/confirm"
import { log } from "@/prompts/log"
import type { UISelectedFramework } from "@/types"
import { join, relative } from "path"

type CreateUiViteTaskInput = {
  frameworks: UISelectedFramework[]
}

type BuildConfigKind = "astro" | "vite"

type UpdateBuildConfigInput = {
  aliasTarget?: string
  kind: BuildConfigKind
  tailwind: boolean
}

type BuildConfigUpdate = {
  content: string
  changes: string[]
}

const VITE_CONFIG_FILES = [
  "vite.config.ts",
  "vite.config.mts",
  "vite.config.js",
  "vite.config.mjs",
]

const ASTRO_CONFIG_FILES = [
  "astro.config.ts",
  "astro.config.mts",
  "astro.config.js",
  "astro.config.mjs",
]

export async function createUiViteTask({
  frameworks,
}: CreateUiViteTaskInput): Promise<string[]> {
  frameworks = frameworks.filter(
    (framework) => framework.name.toLowerCase() !== "react-native"
  )
  if (frameworks.length === 0) {
    return []
  }

  const usesAstroHost = frameworks.some(
    (framework) => framework.name.toLowerCase() === "astro"
  )
  const usesGlobalStyles = frameworks.some(
    (framework) => framework.globalStyleDestinations.length > 0
  )
  if (usesAstroHost && !usesGlobalStyles) {
    return []
  }
  const kind: BuildConfigKind = usesAstroHost ? "astro" : "vite"
  const cliCwd = getCliCwd()
  const configPath = await findBuildConfigPath(cliCwd, kind)
  if (!configPath) {
    log.warn(
      `Could not find an ${kind === "astro" ? "Astro" : "Vite"} config. Add @tailwindcss/vite to the host build plugins manually.`
    )
    return []
  }

  const codeRoots = Array.from(
    new Set(frameworks.map((framework) => framework.codeRoot))
  ).filter((value) => value.length > 0)
  const selectedRoot = codeRoots[0] ?? "."
  if (!usesAstroHost && codeRoots.length > 1) {
    log.warn(
      `Multiple code roots were selected (${codeRoots.join(", ")}). Using ${d.path(selectedRoot)} for the Vite @ alias.`
    )
  }

  const original = await Bun.file(configPath).text()
  const updated = updateBuildConfig(original, {
    kind,
    tailwind: usesGlobalStyles,
    ...(usesAstroHost
      ? {}
      : { aliasTarget: toConfigRelativeDirectory(selectedRoot) }),
  })
  if (updated.changes.length === 0) {
    return []
  }

  box(
    updated.changes.map((change) => `+ ${change}`).join("\n"),
    `Proposed changes: ${relative(cliCwd, configPath)}`
  )

  const shouldApply = await confirm({
    message: "Apply these UI build configuration changes?",
    initialValue: true,
  })
  if (!shouldApply) {
    log.warn("Skipped UI build configuration updates.")
    return []
  }

  await Bun.write(configPath, updated.content)
  log.info("UI build configuration updated successfully.")
  return [configPath]
}

export function updateBuildConfig(
  original: string,
  input: UpdateBuildConfigInput
): BuildConfigUpdate {
  let content = original
  const changes: string[] = []

  if (input.tailwind && !hasTailwindPlugin(content)) {
    const withPlugin = injectPlugin(content, input.kind)
    if (withPlugin) {
      content = withPlugin
      changes.push(
        input.kind === "astro"
          ? "vite.plugins += tailwindcss()"
          : "plugins += tailwindcss()"
      )
    }
  }

  if (
    input.tailwind &&
    hasTailwindPlugin(content) &&
    !hasTailwindImport(content)
  ) {
    content = insertImport(
      content,
      'import tailwindcss from "@tailwindcss/vite"'
    )
    changes.unshift('import tailwindcss from "@tailwindcss/vite"')
  }

  if (input.aliasTarget && !hasAtAlias(content)) {
    const withAlias = injectViteAlias(content, input.aliasTarget)
    if (withAlias) {
      content = withAlias
      if (!hasFileUrlToPathImport(content)) {
        content = insertImport(
          content,
          'import { fileURLToPath } from "node:url"'
        )
        changes.push('import fileURLToPath from "node:url"')
      }
      changes.push(`resolve.alias["@"] = ${input.aliasTarget}`)
    }
  }

  return { content, changes }
}

async function findBuildConfigPath(
  cwd: string,
  kind: BuildConfigKind
): Promise<string | null> {
  const candidates = kind === "astro" ? ASTRO_CONFIG_FILES : VITE_CONFIG_FILES
  for (const fileName of candidates) {
    const path = join(cwd, fileName)
    if (await Bun.file(path).exists()) {
      return path
    }
  }
  return null
}

function insertImport(content: string, statement: string): string {
  const imports = Array.from(content.matchAll(/^import[^\n]*\n/gm))
  if (imports.length === 0) {
    return `${statement}\n${content}`
  }

  const lastImport = imports.at(-1)
  if (!lastImport || lastImport.index === undefined) {
    return `${statement}\n${content}`
  }
  const insertAt = lastImport.index + lastImport[0].length
  return `${content.slice(0, insertAt)}${statement}\n${content.slice(insertAt)}`
}

function injectPlugin(content: string, kind: BuildConfigKind): string | null {
  if (kind === "astro") {
    const viteMatch = /vite\s*:\s*\{/.exec(content)
    if (viteMatch) {
      return injectArrayEntryOrProperty(
        content,
        viteMatch.index + viteMatch[0].length,
        "plugins",
        "tailwindcss()",
        4
      )
    }
  }

  const defineConfigMatch = /defineConfig\s*\(\s*\{/.exec(content)
  if (!defineConfigMatch) {
    return null
  }

  const objectStart = defineConfigMatch.index + defineConfigMatch[0].length
  if (kind === "astro") {
    const snippet = `\n  vite: {\n    plugins: [tailwindcss()],\n  },\n`
    return `${content.slice(0, objectStart)}${snippet}${content.slice(objectStart)}`
  }

  return injectArrayEntryOrProperty(
    content,
    objectStart,
    "plugins",
    "tailwindcss()",
    2
  )
}

function injectArrayEntryOrProperty(
  content: string,
  objectStart: number,
  property: string,
  entry: string,
  indent: number
): string {
  const remainder = content.slice(objectStart)
  const arrayMatch = new RegExp(`${property}\\s*:\\s*\\[`).exec(remainder)
  if (arrayMatch) {
    const insertAt = objectStart + arrayMatch.index + arrayMatch[0].length
    return `${content.slice(0, insertAt)}${entry}, ${content.slice(insertAt)}`
  }

  const spaces = " ".repeat(indent)
  const snippet = `\n${spaces}${property}: [${entry}],\n`
  return `${content.slice(0, objectStart)}${snippet}${normalizeObjectRemainder(
    content.slice(objectStart),
    indent
  )}`
}

function injectViteAlias(content: string, aliasTarget: string): string | null {
  const targetExpression = `fileURLToPath(new URL("${aliasTarget}", import.meta.url))`
  const objectAlias = /alias\s*:\s*\{/.exec(content)
  if (objectAlias) {
    const insertAt = objectAlias.index + objectAlias[0].length
    return `${content.slice(0, insertAt)}\n      "@": ${targetExpression},\n${content.slice(insertAt)}`
  }

  const arrayAlias = /alias\s*:\s*\[/.exec(content)
  if (arrayAlias) {
    const insertAt = arrayAlias.index + arrayAlias[0].length
    return `${content.slice(0, insertAt)}\n      { find: "@", replacement: ${targetExpression} },\n${content.slice(insertAt)}`
  }

  const resolveMatch = /resolve\s*:\s*\{/.exec(content)
  if (resolveMatch) {
    const insertAt = resolveMatch.index + resolveMatch[0].length
    const snippet = `\n    alias: { "@": ${targetExpression} },\n`
    return `${content.slice(0, insertAt)}${snippet}${content.slice(insertAt)}`
  }

  const defineConfigMatch = /defineConfig\s*\(\s*\{/.exec(content)
  if (!defineConfigMatch) {
    return null
  }

  const insertAt = defineConfigMatch.index + defineConfigMatch[0].length
  const snippet = `\n  resolve: {\n    alias: { "@": ${targetExpression} },\n  },\n`
  return `${content.slice(0, insertAt)}${snippet}${normalizeObjectRemainder(
    content.slice(insertAt),
    2
  )}`
}

function normalizeObjectRemainder(content: string, indent: number): string {
  if (content.startsWith("\n") || content.startsWith("\r\n")) {
    return content
  }
  return content.replace(/^[ \t]*/, " ".repeat(indent))
}

function hasTailwindImport(content: string): boolean {
  return /from\s+["']@tailwindcss\/vite["']/.test(content)
}

function hasTailwindPlugin(content: string): boolean {
  return /tailwindcss\s*\(\s*\)/.test(content)
}

function hasFileUrlToPathImport(content: string): boolean {
  return /import\s*\{[^}]*fileURLToPath[^}]*\}\s*from\s*["']node:url["']/.test(
    content
  )
}

function hasAtAlias(content: string): boolean {
  return /alias\s*:\s*(\{[\s\S]*?["']@['"]\s*:|\[[\s\S]*?find\s*:\s*["']@['"])/.test(
    content
  )
}

function toConfigRelativeDirectory(codeRoot: string): string {
  const normalized = codeRoot.replaceAll("\\", "/").replace(/^\.\//, "")
  return normalized === "." || normalized === "" ? "./" : `./${normalized}`
}
