import type { UIAddResolvedComponent } from "@/modules/ui/types"
import { realpath } from "node:fs/promises"
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path"
import type { FrameworkInstall } from "../types"
import { listFilesRecursive } from "./support-files"

const scriptExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"])
const tsTranspiler = new Bun.Transpiler({ loader: "ts" })
const tsxTranspiler = new Bun.Transpiler({ loader: "tsx" })

// Families are copied intact, so inspect every source part, including re-exports and
// nested implementation files. Package dependencies remain a separate install step.
export async function resolveComponentDependencies(input: {
  components: UIAddResolvedComponent[]
  frameworkInstalls: FrameworkInstall[]
}): Promise<UIAddResolvedComponent[]> {
  const components: UIAddResolvedComponent[] = []
  const seen = new Set<string>()

  async function visit(component: UIAddResolvedComponent): Promise<void> {
    const key = JSON.stringify([
      component.sourceFrameworkRoot,
      component.frameworkName,
      component.outputPath,
      component.componentName,
    ])
    if (seen.has(key)) return
    seen.add(key)
    components.push(component)

    const install = input.frameworkInstalls.find(
      (candidate) =>
        candidate.sourceFrameworkRoot === component.sourceFrameworkRoot &&
        candidate.frameworkName === component.frameworkName &&
        candidate.outputPath === component.outputPath &&
        candidate.libraryName === component.libraryName
    )
    if (!install) {
      throw new Error(
        `Cannot resolve component dependencies for unconfigured framework ${component.frameworkName}.`
      )
    }

    const frameworkRoot = resolve(component.sourceFrameworkRoot)
    const actualFrameworkRoot = await realpath(frameworkRoot)
    const sourceFiles = await listFilesRecursive(component.sourceComponentDir)
    for (const sourcePath of sourceFiles.sort()) {
      assertWithin(frameworkRoot, resolve(sourcePath))
      assertWithin(actualFrameworkRoot, await realpath(sourcePath))
      const extension = extname(sourcePath).toLowerCase()
      if (
        !scriptExtensions.has(extension) &&
        ![".astro", ".vue", ".svelte"].includes(extension)
      )
        continue
      const scripts = getScripts(sourcePath, await Bun.file(sourcePath).text())
      for (const script of scripts) {
        for (const specifier of getModuleSpecifiers(
          script,
          extension === ".tsx" || extension === ".jsx"
        )) {
          if (!specifier.startsWith(".")) continue
          // Registry paths are portable module paths, never Windows traversals.
          if (specifier.includes("\\")) {
            throw new Error(
              `Invalid component import ${specifier} in ${sourcePath}`
            )
          }
          const target = resolve(dirname(sourcePath), specifier)
          assertWithin(frameworkRoot, target)
          const [family] = relative(frameworkRoot, target).split(sep)
          if (family === component.componentName || family === "lib") continue
          const canonicalName = install.componentsByLowerName.get(
            family.toLowerCase()
          )
          if (!canonicalName) {
            throw new Error(
              `Component ${component.componentName} imports ${specifier}, but component ${family} is unavailable for ${component.frameworkName}.`
            )
          }
          const dependency = {
            ...component,
            componentInput: canonicalName,
            componentName: canonicalName,
            sourceComponentDir: resolve(frameworkRoot, canonicalName),
          }
          const files = await listFilesRecursive(dependency.sourceComponentDir)
          if (files.length === 0) {
            throw new Error(
              `Missing component dependency ${canonicalName} for ${component.componentName} (${component.frameworkName}).`
            )
          }
          assertWithin(
            actualFrameworkRoot,
            await realpath(dependency.sourceComponentDir)
          )
          await visit(dependency)
        }
      }
    }
  }

  for (const component of input.components) await visit(component)
  return components
}

function assertWithin(parent: string, child: string): void {
  const path = relative(parent, child)
  if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new Error(`Component import escapes its framework source: ${child}`)
  }
}

function getScripts(path: string, text: string): string[] {
  const extension = extname(path).toLowerCase()
  if (scriptExtensions.has(extension)) return [text]
  if (extension === ".astro") {
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    return frontmatter ? [frontmatter[1]] : []
  }
  if (extension === ".vue" || extension === ".svelte") {
    return [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(
      (match) => match[1]
    )
  }
  return []
}

function getModuleSpecifiers(source: string, jsx: boolean): Set<string> {
  const transpiler = jsx ? tsxTranspiler : tsTranspiler
  const specifiers = new Set(
    transpiler.scanImports(source).map((item) => item.path)
  )
  // Bun's scanner intentionally erases type-only imports. Include those too:
  // consumers need the referenced source types even when there is no runtime edge.
  const nonCode =
    /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g
  const codeMask = source.replace(nonCode, (token) => " ".repeat(token.length))
  const withoutComments = source.replace(nonCode, (token) =>
    token.startsWith("//") || token.startsWith("/*")
      ? " ".repeat(token.length)
      : token
  )
  const declarations =
    /\b(?:import|export)\s+(?:type\s+)?(?:\{[^}]*\}|\*\s*(?:as\s+[\w$]+)?|[\w$]+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+[\w$]+))?)\s+from\s*(["'])([^"'\r\n]+)\1/g
  for (const match of withoutComments.matchAll(declarations)) {
    if (/^(?:import|export)\b/.test(codeMask.slice(match.index))) {
      specifiers.add(match[2])
    }
  }
  return specifiers
}
