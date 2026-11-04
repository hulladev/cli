import type { HullaConfig } from "@/app/types"
import { getProjectRootFromConfigPath, readUIConfig } from "@/modules/ui/config"
import { resolveUISource } from "@/modules/ui/source"
import { directoryExists } from "@/platform/fs/bun"
import gittar from "@hulla/gittar"
import { join } from "node:path"
import ts from "typescript"
import {
  buildFrameworkInstalls,
  discoverComponentsForFramework,
} from "../add/services/selection"
import type { FrameworkInstall } from "../add/types"

export type ComponentCatalogEntry = {
  family: string
  library: string
  framework: string
  source: string
  exports: string[]
  files: string[]
}

type ComponentCatalogSource = Pick<
  FrameworkInstall,
  | "sourceUrl"
  | "libraryName"
  | "frameworkName"
  | "sourceFrameworkRoot"
  | "componentsByLowerName"
>

/** Inspect source rather than importing component modules or maintaining a built-in component map. */
export async function inspectComponentCatalog(
  frameworks: ComponentCatalogSource[]
): Promise<ComponentCatalogEntry[]> {
  const entries: ComponentCatalogEntry[] = []
  for (const framework of frameworks) {
    for (const family of framework.componentsByLowerName.values()) {
      const files = await Array.fromAsync(
        new Bun.Glob("**/*").scan({
          cwd: join(framework.sourceFrameworkRoot, family),
          onlyFiles: true,
        })
      )
      const exports = new Set<string>()
      for (const file of files.filter(
        (file) => /\.[cm]?[jt]sx?$/.test(file) && !/\.d\.[cm]?ts$/.test(file)
      )) {
        const path = join(framework.sourceFrameworkRoot, family, file)
        const tree = ts.createSourceFile(
          path,
          await Bun.file(path).text(),
          ts.ScriptTarget.Latest,
          true
        )
        for (const statement of tree.statements) {
          if (
            ts.isExportDeclaration(statement) &&
            statement.exportClause &&
            ts.isNamedExports(statement.exportClause)
          ) {
            for (const element of statement.exportClause.elements)
              exports.add(element.name.text)
          }
          if (
            !ts.canHaveModifiers(statement) ||
            !ts
              .getModifiers(statement)
              ?.some(
                (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
              )
          )
            continue
          if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) {
              collectBindingNames(declaration.name, exports)
            }
          } else if (
            "name" in statement &&
            statement.name &&
            ts.isIdentifier(statement.name as ts.Node)
          ) {
            exports.add((statement.name as ts.Identifier).text)
          }
        }
      }
      entries.push({
        family,
        library: framework.libraryName,
        framework: framework.frameworkName,
        source: framework.sourceUrl,
        exports: [...exports].sort(),
        files: files.sort(),
      })
    }
  }
  return entries.sort(
    (a, b) =>
      a.framework.localeCompare(b.framework) ||
      a.library.localeCompare(b.library) ||
      a.family.localeCompare(b.family)
  )
}

function collectBindingNames(name: ts.BindingName, exports: Set<string>): void {
  if (ts.isIdentifier(name)) exports.add(name.text)
  else
    for (const element of name.elements)
      if (ts.isBindingElement(element))
        collectBindingNames(element.name, exports)
}

export function filterComponentCatalog(
  entries: ComponentCatalogEntry[],
  query: string
): ComponentCatalogEntry[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const matches = entries.filter((entry) => {
    const searchable = [entry.family, ...entry.exports, ...entry.files]
      .join(" ")
      .toLowerCase()
    return terms.every((term) => searchable.includes(term))
  })
  const score = (entry: ComponentCatalogEntry) =>
    terms.reduce((total, term) => {
      if (entry.family.toLowerCase() === term) return total
      if (entry.exports.some((name) => name.toLowerCase() === term))
        return total + 1
      if (
        entry.files.some(
          (file) =>
            file
              .split("/")
              .at(-1)
              ?.replace(/\.[^.]+$/, "")
              .toLowerCase() === term
        )
      )
        return total + 2
      return total + 3
    }, 0)
  return matches.sort((left, right) => score(left) - score(right))
}

/** Browsing an unconfigured library must not initialize the application or copy source. */
export async function loadCatalogFrameworks(
  config: HullaConfig,
  source?: string
): Promise<ComponentCatalogSource[]> {
  const uiConfig = (await readUIConfig(config)).data
  if (!source && uiConfig.installs.length)
    return buildFrameworkInstalls(config, uiConfig.installs)
  const projectRoot = getProjectRootFromConfigPath(config.path)
  const frameworks: ComponentCatalogSource[] = []
  for (const url of source ? [source] : uiConfig.sources) {
    const resolved = resolveUISource({ source: url, projectRoot })
    const fetched =
      resolved.kind === "remote"
        ? await gittar({ url: resolved.sourceUrl, update: "commit" })
        : null
    const root =
      resolved.kind === "local"
        ? resolved.rootDir
        : join(fetched!.outDir, fetched!.subpath ?? "")
    const path = join(root, "ui.config.ts")
    if (!(await Bun.file(path).exists()))
      throw new Error(`UI source is missing ui.config.ts: ${url}`)
    const library = (await import(path)).config as {
      name: string
      frameworks: Record<string, string>
    }
    if (!library?.name || !library.frameworks)
      throw new Error(`Invalid UI library config: ${path}`)
    for (const [name, templatePath] of Object.entries(library.frameworks)) {
      const frameworkRoot = join(root, templatePath)
      if (!(await directoryExists(frameworkRoot)))
        throw new Error(
          `Framework template path not found for ${library.name}/${name}: ${frameworkRoot}`
        )
      frameworks.push({
        sourceUrl: url,
        libraryName: library.name,
        frameworkName: name,
        sourceFrameworkRoot: frameworkRoot,
        componentsByLowerName:
          await discoverComponentsForFramework(frameworkRoot),
      })
    }
  }
  return frameworks
}

export async function missingComponentMessage(input: {
  missing: string[]
  frameworks: FrameworkInstall[]
}): Promise<string> {
  const catalog = await inspectComponentCatalog(input.frameworks)
  const suggestions = input.missing.flatMap((name) => {
    const matches = filterComponentCatalog(catalog, name)
    const candidates = matches.length
      ? matches
      : catalog.filter(
          (entry) =>
            editDistance(entry.family.toLowerCase(), name) <=
            Math.max(1, Math.floor(name.length / 3))
        )
    return candidates
      .slice(0, 5)
      .map(
        (entry) =>
          `  ${name}: ${componentInstallCommand(entry)} (${entry.library}; exports: ${entry.exports.join(", ") || "see source files"})`
      )
  })
  return [
    `Unknown component families: ${input.missing.join(", ")}. No component files were copied.`,
    ...suggestions,
    "Use hulla ui list <query> to search this registry by family, export, or filename.",
  ].join("\n")
}

export function componentInstallCommand(entry: ComponentCatalogEntry): string {
  const quote = (value: string) =>
    /^[\w./:@-]+$/.test(value) ? value : `'${value.replaceAll("'", `'"'"'`)}'`
  return `hulla ui add --framework ${quote(entry.framework)} ${quote(entry.family)} --source ${quote(entry.source)}`
}

function editDistance(left: string, right: string): number {
  let row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 0; i < left.length; i++) {
    const next = [i + 1]
    for (let j = 0; j < right.length; j++)
      next.push(
        Math.min(
          next[j] + 1,
          row[j + 1] + 1,
          row[j] + Number(left[i] !== right[j])
        )
      )
    row = next
  }
  return row[right.length]
}
