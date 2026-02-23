import { d } from "@/decorators"
import {
  getProjectRootFromConfigPath,
  normalizePath,
  normalizeProjectRelativePath,
} from "@/lib/ui/config"
import { confirm } from "@/prompts/confirm"
import { log } from "@/prompts/log"
import { spinner } from "@/prompts/spinner"
import type { HullaConfig } from "@/types"
import { mkdir } from "node:fs/promises"
import { dirname, join, posix } from "path"
import type { UICopyEntry, UICopyLibraryContext } from "./ui.install.task"

export type UiCopySummary = {
  copied: number
  overwritten: number
  skippedExisting: number
  skippedOptional: number
  missingRequired: number
  missingOptional: number
  invalidEntries: number
  rewrittenFiles: number
  unresolvedAliasImports: number
}

type CreateUiCopyTaskInput = {
  config: HullaConfig
  copyContexts: UICopyLibraryContext[]
}

type CopyOperation = {
  libraryName: string
  frameworkName: string
  srcRelative: string
  destTemplate: string
  destRelative: string
  srcCandidates: string[]
  destAbsolute: string
  required: boolean
  componentsRoot: string
  copyFilesRoot: string
}

type AliasMapping = {
  from: string
  to: string
}

const REWRITE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"])

export async function createUiCopyTask({
  config,
  copyContexts,
}: CreateUiCopyTaskInput): Promise<UiCopySummary> {
  const summary: UiCopySummary = {
    copied: 0,
    overwritten: 0,
    skippedExisting: 0,
    skippedOptional: 0,
    missingRequired: 0,
    missingOptional: 0,
    invalidEntries: 0,
    rewrittenFiles: 0,
    unresolvedAliasImports: 0,
  }

  if (copyContexts.length === 0) {
    log.info("No copy files configured. Skipping copied library files step.")
    return summary
  }

  const projectRoot = getProjectRootFromConfigPath(config.path)
  const operations = buildCopyOperations({
    copyContexts,
    projectRoot,
    onInvalidEntry: ({ message, required }) => {
      summary.invalidEntries += 1
      if (required) {
        summary.missingRequired += 1
      }
      log.warn(message)
    },
  })

  if (operations.length === 0) {
    log.info("No valid copy file operations found. Skipping copy phase.")
    if (summary.missingRequired > 0) {
      throw new Error(
        "Required copy file entries are invalid. Aborting ui init."
      )
    }
    return summary
  }

  const hasOptional = operations.some((operation) => !operation.required)
  let includeOptional = true
  if (hasOptional) {
    includeOptional = await confirm({
      message: "Include optional copied library files?",
      initialValue: true,
    })
  }

  const filteredOperations = includeOptional
    ? operations
    : operations.filter((operation) => operation.required)
  if (!includeOptional) {
    summary.skippedOptional += operations.length - filteredOperations.length
  }

  if (filteredOperations.length === 0) {
    log.info("No copied library files selected.")
    if (summary.missingRequired > 0) {
      throw new Error("Required copied files are missing or invalid.")
    }
    return summary
  }

  const existingByDest = await Promise.all(
    filteredOperations.map(async (operation) => {
      const exists = await Bun.file(operation.destAbsolute).exists()
      return [operation.destAbsolute, exists] as const
    })
  ).then((pairs) => new Map(pairs))

  const existingCount = Array.from(existingByDest.values()).filter(
    Boolean
  ).length
  let overwriteExisting = true
  if (existingCount > 0) {
    overwriteExisting = await confirm({
      message: `Found ${existingCount} existing copied library files. Overwrite them?`,
      initialValue: false,
    })
  }

  const s = spinner()
  s.start("Copying library files...")

  for (const operation of filteredOperations) {
    const sourcePath = await resolveExistingSource(operation.srcCandidates)
    if (!sourcePath) {
      if (operation.required) {
        summary.missingRequired += 1
        s.stop("Failed to copy required library files")
        throw new Error(
          `Missing required source file ${operation.srcRelative} for ${operation.libraryName}/${operation.frameworkName}`
        )
      }
      summary.missingOptional += 1
      log.warn(
        `Skipping missing optional file ${d.path(operation.srcRelative)} from ${d.highlight(operation.libraryName)} (${operation.frameworkName})`
      )
      continue
    }
    const sourceFile = Bun.file(sourcePath)

    const destinationExists =
      existingByDest.get(operation.destAbsolute) === true
    if (destinationExists && !overwriteExisting) {
      summary.skippedExisting += 1
      continue
    }

    await mkdir(dirname(operation.destAbsolute), { recursive: true })

    const rewriteCandidate = isRewriteCandidate(operation.destRelative)
    if (rewriteCandidate) {
      const sourceText = await sourceFile.text()
      const rewriteResult = rewriteAliasedImports(sourceText, {
        mappings: createAliasMappings(operation),
      })
      if (rewriteResult.unresolved > 0) {
        summary.unresolvedAliasImports += rewriteResult.unresolved
        log.warn(
          `Unresolved aliased imports in ${d.path(operation.destRelative)} (${rewriteResult.unresolved})`
        )
      }
      if (rewriteResult.changed) {
        summary.rewrittenFiles += 1
      }
      await Bun.write(operation.destAbsolute, rewriteResult.content)
    } else {
      const sourceBuffer = await sourceFile.arrayBuffer()
      await Bun.write(operation.destAbsolute, sourceBuffer)
    }

    summary.copied += 1
    if (destinationExists) {
      summary.overwritten += 1
    }
  }

  s.stop("Library files copied successfully")

  if (summary.missingOptional > 0) {
    log.warn(
      `Skipped ${summary.missingOptional} optional copied files because sources were missing.`
    )
  }

  if (summary.skippedExisting > 0) {
    log.info(`Skipped ${summary.skippedExisting} existing copied files.`)
  }

  if (summary.rewrittenFiles > 0) {
    log.info(`Rewrote imports in ${summary.rewrittenFiles} copied files.`)
  }

  if (summary.missingRequired > 0) {
    throw new Error("Missing required copied files. Aborting ui init.")
  }

  return summary
}

function buildCopyOperations(input: {
  copyContexts: UICopyLibraryContext[]
  projectRoot: string
  onInvalidEntry: (input: { message: string; required: boolean }) => void
}): CopyOperation[] {
  const operationsByDest = new Map<string, CopyOperation>()

  for (const context of input.copyContexts) {
    for (const framework of context.frameworks) {
      for (const entry of context.sharedCopyEntries) {
        const operation = createCopyOperation({
          projectRoot: input.projectRoot,
          context,
          frameworkName: framework.name,
          frameworkTemplatePath: framework.templatePath,
          sourceLevel: "shared",
          entry,
        })

        if (!operation.valid) {
          input.onInvalidEntry({
            message: operation.reason,
            required: entry.required !== false,
          })
          continue
        }

        if (!operationsByDest.has(operation.value.destRelative)) {
          operationsByDest.set(operation.value.destRelative, operation.value)
        }
      }

      for (const entry of framework.copyEntries) {
        const operation = createCopyOperation({
          projectRoot: input.projectRoot,
          context,
          frameworkName: framework.name,
          frameworkTemplatePath: framework.templatePath,
          sourceLevel: "framework",
          entry,
        })

        if (!operation.valid) {
          input.onInvalidEntry({
            message: operation.reason,
            required: entry.required !== false,
          })
          continue
        }

        if (!operationsByDest.has(operation.value.destRelative)) {
          operationsByDest.set(operation.value.destRelative, operation.value)
        }
      }
    }
  }

  return Array.from(operationsByDest.values())
}

function createCopyOperation(input: {
  projectRoot: string
  context: UICopyLibraryContext
  frameworkName: string
  frameworkTemplatePath: string
  sourceLevel: "shared" | "framework"
  entry: UICopyEntry
}): { valid: true; value: CopyOperation } | { valid: false; reason: string } {
  const rawSrc = normalizePath(input.entry.src)
  const rawDest = normalizePath(input.entry.dest ?? input.entry.src)

  const srcValidation = validateRelativePath(rawSrc)
  if (!srcValidation.valid) {
    return {
      valid: false,
      reason: `Invalid source path ${d.path(rawSrc)} in ${d.highlight(input.context.libraryName)} (${input.frameworkName}): ${srcValidation.reason}`,
    }
  }

  const destValidation = validateRelativePath(rawDest)
  if (!destValidation.valid) {
    return {
      valid: false,
      reason: `Invalid destination path ${d.path(rawDest)} in ${d.highlight(input.context.libraryName)} (${input.frameworkName}): ${destValidation.reason}`,
    }
  }

  const rootValidation = validateRelativePath(input.context.copyFilesRoot)
  if (!rootValidation.valid) {
    return {
      valid: false,
      reason: `Invalid copy files output directory ${d.path(input.context.copyFilesRoot)}: ${rootValidation.reason}`,
    }
  }

  const destRelative = remapFirstSegment(
    destValidation.value,
    rootValidation.value
  )
  const frameworkRoot = join(
    input.context.rootDir,
    normalizeProjectRelativePath(input.frameworkTemplatePath)
  )
  const srcCandidates = dedupePaths(
    input.sourceLevel === "shared"
      ? [
          join(frameworkRoot, srcValidation.value),
          join(input.context.rootDir, srcValidation.value),
        ]
      : [join(frameworkRoot, srcValidation.value)]
  )
  const destAbsolute = join(input.projectRoot, destRelative)

  return {
    valid: true,
    value: {
      libraryName: input.context.libraryName,
      frameworkName: input.frameworkName,
      srcRelative: srcValidation.value,
      destTemplate: destValidation.value,
      destRelative,
      srcCandidates,
      destAbsolute,
      required: input.entry.required !== false,
      componentsRoot: input.context.componentsRoot,
      copyFilesRoot: input.context.copyFilesRoot,
    },
  }
}

function dedupePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.map((path) => normalizePath(path))))
}

async function resolveExistingSource(
  candidates: string[]
): Promise<string | null> {
  for (const candidate of candidates) {
    const exists = await Bun.file(candidate).exists()
    if (exists) {
      return candidate
    }
  }
  return null
}

function validateRelativePath(
  value: string
): { valid: true; value: string } | { valid: false; reason: string } {
  const normalized = normalizeProjectRelativePath(value)
  if (normalized === ".") {
    return { valid: false, reason: "Path cannot resolve to project root" }
  }

  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    return { valid: false, reason: "Absolute paths are not allowed" }
  }

  const segments = normalized.split("/")
  if (segments.some((segment) => segment === "..")) {
    return { valid: false, reason: "Parent directory traversal is not allowed" }
  }

  return { valid: true, value: normalized }
}

function remapFirstSegment(
  destTemplate: string,
  copyFilesRoot: string
): string {
  const destSegments = normalizeProjectRelativePath(destTemplate)
    .split("/")
    .filter((segment) => segment.length > 0)
  if (destSegments.length === 1) {
    return normalizeProjectRelativePath(
      posix.join(copyFilesRoot, destSegments[0] as string)
    )
  }
  const rest = destSegments.slice(1)
  return normalizeProjectRelativePath(posix.join(copyFilesRoot, ...rest))
}

function isRewriteCandidate(path: string): boolean {
  for (const extension of REWRITE_EXTENSIONS) {
    if (path.endsWith(extension)) {
      return true
    }
  }
  return false
}

function createAliasMappings(operation: CopyOperation): AliasMapping[] {
  const mappings: AliasMapping[] = []

  mappings.push({
    from: normalizeProjectRelativePath("src/components"),
    to: normalizeProjectRelativePath(operation.componentsRoot),
  })

  const sourceDir = dirname(operation.destTemplate)
  const targetDir = dirname(operation.destRelative)
  if (sourceDir !== "." && targetDir !== ".") {
    mappings.push({
      from: normalizeProjectRelativePath(sourceDir),
      to: normalizeProjectRelativePath(targetDir),
    })
  }

  mappings.push({
    from: normalizeProjectRelativePath(operation.destTemplate),
    to: normalizeProjectRelativePath(operation.destRelative),
  })

  const unique = new Map<string, AliasMapping>()
  for (const mapping of mappings) {
    unique.set(`${mapping.from}->${mapping.to}`, mapping)
  }

  return Array.from(unique.values()).sort(
    (a, b) => b.from.length - a.from.length
  )
}

function rewriteAliasedImports(
  content: string,
  input: { mappings: AliasMapping[] }
): { content: string; changed: boolean; unresolved: number } {
  let changed = false
  let unresolved = 0

  const rewrite = (specifier: string): string => {
    if (!specifier.startsWith("@/")) {
      return specifier
    }

    const source = normalizeProjectRelativePath(specifier.slice(2))
    for (const mapping of input.mappings) {
      if (source === mapping.from) {
        const next = `@/${mapping.to}`
        if (next !== specifier) changed = true
        return next
      }
      if (source.startsWith(`${mapping.from}/`)) {
        const suffix = source.slice(mapping.from.length + 1)
        const next = `@/${normalizeProjectRelativePath(posix.join(mapping.to, suffix))}`
        if (next !== specifier) changed = true
        return next
      }
    }

    unresolved += 1
    return specifier
  }

  const rewrittenStatic = content.replace(
    /\b(import|export)\s+[^\n;]*?\sfrom\s*(["'])([^"']+)\2/g,
    (full, keyword, quote, specifier) => {
      const updated = rewrite(specifier)
      return full.replace(
        `${quote}${specifier}${quote}`,
        `${quote}${updated}${quote}`
      )
    }
  )

  const rewrittenDynamic = rewrittenStatic.replace(
    /\bimport\s*\(\s*(["'])([^"']+)\1\s*\)/g,
    (full, quote, specifier) => {
      const updated = rewrite(specifier)
      return full.replace(
        `${quote}${specifier}${quote}`,
        `${quote}${updated}${quote}`
      )
    }
  )

  return {
    content: rewrittenDynamic,
    changed,
    unresolved,
  }
}
