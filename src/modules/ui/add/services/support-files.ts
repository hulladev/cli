import {
  normalizePath,
  normalizeProjectRelativePath,
} from "@/modules/ui/config"
import type { UIAddResolvedComponent } from "@/modules/ui/types"
import { log } from "@/terminal/prompts/log"
import { mkdir } from "node:fs/promises"
import { basename, dirname, join, relative } from "path"
import type {
  AliasRewriteMapping,
  CopyFileEntry,
  FrameworkSelection,
  UILibraryWithCopyFiles,
} from "../types"

export async function listFilesRecursive(root: string): Promise<string[]> {
  const files: string[] = []
  const glob = new Bun.Glob("**/*")

  try {
    for await (const rawPath of glob.scan({
      cwd: root,
      absolute: false,
    })) {
      const normalized = rawPath.replace(/\\/g, "/")
      const absolute = join(root, normalized)
      files.push(absolute)
    }
  } catch {
    return files
  }

  return files
}

export function toRelativeDisplayPath(path: string, cwd: string): string {
  const relativePath = relative(cwd, path).replace(/\\/g, "/")
  if (relativePath.length === 0) {
    return "."
  }
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`
}

export function isComponentPackageJson(path: string): boolean {
  return basename(path) === "package.json"
}

export async function resolveAliasMappingsForComponent(input: {
  component: UIAddResolvedComponent
  cache: Map<string, AliasRewriteMapping[]>
}): Promise<AliasRewriteMapping[]> {
  const key = [
    input.component.sourceRoot,
    input.component.frameworkName,
    input.component.copyFilesRoot,
    input.component.codeRoot,
  ].join("::")

  const cached = input.cache.get(key)
  if (cached) {
    return cached
  }

  const config = await readLibraryConfig(input.component.sourceRoot)
  if (!config?.copyFiles) {
    input.cache.set(key, [])
    return []
  }

  const entries = [
    ...normalizeCopyEntries(config.copyFiles.shared),
    ...normalizeCopyEntries(config.copyFiles[input.component.frameworkName]),
  ]
  const mappings: AliasRewriteMapping[] = []

  for (const entry of entries) {
    const template = entry.dest ?? entry.src
    const fromAlias = toAliasPathFromTemplate(template)
    const destinationRelative = toCopyDestinationRelativePath(
      input.component.copyFilesRoot,
      template
    )
    const toAlias = toAliasPathFromDestination(
      destinationRelative,
      input.component.codeRoot
    )

    if (!fromAlias || !toAlias) {
      continue
    }

    const from = `@/${fromAlias}`
    const to = `@/${toAlias}`
    if (from === to) {
      continue
    }
    mappings.push({ from, to })
  }

  const unique = new Map<string, AliasRewriteMapping>()
  for (const mapping of mappings) {
    unique.set(`${mapping.from}->${mapping.to}`, mapping)
  }

  const result = Array.from(unique.values()).sort(
    (a, b) => b.from.length - a.from.length
  )
  input.cache.set(key, result)
  return result
}

export async function ensureRequiredCopyFiles(input: {
  projectRoot: string
  resolvedComponents: UIAddResolvedComponent[]
}): Promise<string[]> {
  const frameworkSelections = dedupeFrameworkSelections(
    input.resolvedComponents
  )
  if (frameworkSelections.length === 0) {
    return []
  }

  const copiedPaths: string[] = []
  for (const selection of frameworkSelections) {
    const libraryConfig = await readLibraryConfig(selection.sourceRoot)
    if (!libraryConfig?.copyFiles) {
      continue
    }

    const sharedEntries = normalizeCopyEntries(libraryConfig.copyFiles.shared)
    const frameworkEntries = normalizeCopyEntries(
      libraryConfig.copyFiles[selection.frameworkName]
    )
    const requiredShared = sharedEntries.filter((entry) => entry.required)
    const requiredFramework = frameworkEntries.filter((entry) => entry.required)

    for (const entry of requiredShared) {
      const sourcePath = await resolveCopyEntrySource({
        sourceRoot: selection.sourceRoot,
        sourceFrameworkRoot: selection.sourceFrameworkRoot,
        src: entry.src,
        shared: true,
      })

      if (!sourcePath) {
        throw new Error(
          `Missing required shared library file ${entry.src} for ${selection.libraryName}/${selection.frameworkName}`
        )
      }

      const destinationRelative = toCopyDestinationRelativePath(
        selection.copyFilesRoot,
        entry.dest ?? entry.src
      )
      const destinationPath = join(input.projectRoot, destinationRelative)
      const exists = await Bun.file(destinationPath).exists()
      if (exists) {
        continue
      }

      await mkdir(dirname(destinationPath), { recursive: true })
      const sourceContent = await Bun.file(sourcePath).arrayBuffer()
      await Bun.write(destinationPath, sourceContent)
      copiedPaths.push(destinationPath)
    }

    for (const entry of requiredFramework) {
      const sourcePath = await resolveCopyEntrySource({
        sourceRoot: selection.sourceRoot,
        sourceFrameworkRoot: selection.sourceFrameworkRoot,
        src: entry.src,
        shared: false,
      })

      if (!sourcePath) {
        throw new Error(
          `Missing required framework library file ${entry.src} for ${selection.libraryName}/${selection.frameworkName}`
        )
      }

      const destinationRelative = toCopyDestinationRelativePath(
        selection.copyFilesRoot,
        entry.dest ?? entry.src
      )
      const destinationPath = join(input.projectRoot, destinationRelative)
      const exists = await Bun.file(destinationPath).exists()
      if (exists) {
        continue
      }

      await mkdir(dirname(destinationPath), { recursive: true })
      const sourceContent = await Bun.file(sourcePath).arrayBuffer()
      await Bun.write(destinationPath, sourceContent)
      copiedPaths.push(destinationPath)
    }
  }

  if (copiedPaths.length > 0) {
    log.info(
      `Added ${copiedPaths.length} required support file${copiedPaths.length === 1 ? "" : "s"}.`
    )
  }

  return copiedPaths
}

async function readLibraryConfig(
  sourceRoot: string
): Promise<UILibraryWithCopyFiles | null> {
  const configPath = join(sourceRoot, "ui.config.ts")
  const configFile = Bun.file(configPath)
  if (!(await configFile.exists())) {
    return null
  }

  try {
    const loaded = (await import(configPath)) as {
      config?: UILibraryWithCopyFiles
    }
    return loaded.config ?? null
  } catch {
    return null
  }
}

function normalizeCopyEntries(entries?: CopyFileEntry[]): Array<{
  src: string
  dest?: string
  required: boolean
}> {
  if (!entries || entries.length === 0) {
    return []
  }

  return entries.map((entry) => ({
    src: normalizeProjectRelativePath(entry.src),
    dest:
      typeof entry.dest === "string"
        ? normalizeProjectRelativePath(entry.dest)
        : undefined,
    required: entry.required !== false,
  }))
}

function toCopyDestinationRelativePath(
  copyFilesRoot: string,
  destinationTemplate: string
): string {
  const normalizedRoot = normalizeProjectRelativePath(copyFilesRoot)
  const normalizedDest = normalizeProjectRelativePath(destinationTemplate)

  if (normalizedDest === "src") {
    return normalizedRoot
  }

  if (normalizedDest.startsWith("src/")) {
    return normalizeProjectRelativePath(
      join(normalizedRoot, normalizedDest.slice("src/".length)).replace(
        /\\/g,
        "/"
      )
    )
  }

  if (
    normalizedDest === normalizedRoot ||
    normalizedDest.startsWith(`${normalizedRoot}/`)
  ) {
    return normalizedDest
  }

  return normalizeProjectRelativePath(
    join(normalizedRoot, normalizedDest).replace(/\\/g, "/")
  )
}

function toAliasPathFromTemplate(template: string): string {
  const normalized = normalizeProjectRelativePath(template)
  const withoutSrc =
    normalized === "src"
      ? ""
      : normalized.startsWith("src/")
        ? normalized.slice("src/".length)
        : normalized

  return stripKnownExtension(withoutSrc)
}

function toAliasPathFromDestination(
  destinationRelative: string,
  codeRoot: string
): string | null {
  const normalizedDestination = normalizePath(
    normalizeProjectRelativePath(destinationRelative)
  )
  const normalizedCodeRoot = normalizePath(
    normalizeProjectRelativePath(codeRoot)
  )

  const relativePath =
    normalizedCodeRoot === "."
      ? normalizedDestination
      : normalizePath(relative(normalizedCodeRoot, normalizedDestination))

  if (relativePath.startsWith("..")) {
    return null
  }

  const normalizedRelative = normalizeProjectRelativePath(relativePath)
  return stripKnownExtension(normalizedRelative)
}

function stripKnownExtension(path: string): string {
  return path.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/i, "")
}

function dedupeFrameworkSelections(
  components: UIAddResolvedComponent[]
): FrameworkSelection[] {
  const map = new Map<string, FrameworkSelection>()

  for (const component of components) {
    const key = [
      component.sourceRoot,
      component.sourceFrameworkRoot,
      component.libraryName,
      component.frameworkName,
      component.copyFilesRoot,
    ].join("::")

    if (!map.has(key)) {
      map.set(key, {
        sourceRoot: component.sourceRoot,
        sourceFrameworkRoot: component.sourceFrameworkRoot,
        libraryName: component.libraryName,
        frameworkName: component.frameworkName,
        copyFilesRoot: component.copyFilesRoot,
      })
    }
  }

  return Array.from(map.values())
}

async function resolveCopyEntrySource(input: {
  sourceRoot: string
  sourceFrameworkRoot: string
  src: string
  shared: boolean
}): Promise<string | null> {
  const normalizedSrc = normalizeProjectRelativePath(input.src)
  const candidates = input.shared
    ? [
        join(input.sourceFrameworkRoot, normalizedSrc),
        join(input.sourceRoot, normalizedSrc),
      ]
    : [join(input.sourceFrameworkRoot, normalizedSrc)]

  for (const candidate of candidates) {
    if (await Bun.file(candidate).exists()) {
      return candidate
    }
  }

  return null
}
