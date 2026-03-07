import { getCliCwd } from "@/app/runtime"
import { d } from "@/decorators"
import {
  getProjectRootFromConfigPath,
  normalizeProjectRelativePath,
  readUIConfig,
} from "@/lib/ui/config"
import { createUnifiedDiff } from "@/modules/ui/tsconfig/diff"
import { box } from "@/prompts/box"
import { confirm } from "@/prompts/confirm"
import { log } from "@/prompts/log"
import { isPromptNonInteractive } from "@/prompts/runtime"
import type {
  TsconfigPatchPlan,
  UIAddResolvedComponent,
  UIAddSummary,
} from "@/types"
import { err, ok, type Err, type Ok } from "@hulla/control"
import { mkdir } from "node:fs/promises"
import { dirname, join } from "path"
import type { AliasRewriteMapping, CreateUiAddTaskInput } from "../types"
import {
  formatPostAddUpdateDiffPreview,
  installComponentDependencies,
  runPostAddUpdateStep,
} from "./dependencies"
import {
  buildFrameworkInstalls,
  findMatchesForComponent,
  resolveExplicitFramework,
  resolveRequestedComponents,
  selectMatchingFramework,
} from "./selection"
import {
  ensureRequiredCopyFiles,
  isComponentPackageJson,
  listFilesRecursive,
  resolveAliasMappingsForComponent,
  toRelativeDisplayPath,
} from "./support-files"

const REWRITE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"])

export async function createUiAddTask({
  config,
  parserResult,
  result,
}: CreateUiAddTaskInput): Promise<Ok<UIAddSummary> | Err<Error>> {
  try {
    const uiConfig = await readUIConfig(config)
    if (uiConfig.data.installs.length === 0) {
      return err(
        new Error(
          "No UI installs found. Run `hulla ui init` before adding components."
        )
      )
    }

    const explicitFramework = resolveExplicitFramework({
      parserResult,
      result,
    })

    const frameworkInstalls = await buildFrameworkInstalls(
      config,
      uiConfig.data.installs
    )

    if (frameworkInstalls.length === 0) {
      return err(
        new Error(
          "No framework installs could be resolved from ui.json. Run `hulla ui init` again."
        )
      )
    }

    const availableFrameworkNames = Array.from(
      new Set(frameworkInstalls.map((item) => item.frameworkName))
    ).sort()
    if (
      explicitFramework &&
      !availableFrameworkNames
        .map((name) => name.toLowerCase())
        .includes(explicitFramework.toLowerCase())
    ) {
      return err(
        new Error(
          `Framework ${d.highlight(explicitFramework)} is not configured. Available: ${availableFrameworkNames.join(", ")}`
        )
      )
    }

    const requestedFromArgs = Array.isArray(result.arguments.components?.value)
      ? result.arguments.components.value.filter(
          (value: string) => value.trim().length > 0
        )
      : []
    if (isPromptNonInteractive() && requestedFromArgs.length === 0) {
      return err(
        new Error(
          "Prompt required but --yes was used: component input is required. Pass explicit component names, e.g. `hulla ui add --yes --framework react button`."
        )
      )
    }

    const requestedComponentInputs = await resolveRequestedComponents({
      result,
      frameworkInstalls,
      explicitFramework,
    })
    if (requestedComponentInputs.length === 0) {
      return err(new Error("No components selected."))
    }

    const missingComponents: string[] = []
    let promptedFrameworkSelections = 0
    const resolvedComponents: UIAddResolvedComponent[] = []

    for (const componentInput of requestedComponentInputs) {
      const matches = findMatchesForComponent({
        frameworkInstalls,
        componentInput,
        explicitFramework,
      })

      if (matches.length === 0) {
        missingComponents.push(componentInput)
        continue
      }

      const selection = await selectMatchingFramework(
        componentInput,
        matches,
        explicitFramework
      )
      const chosen = selection.chosen
      if (selection.prompted) {
        promptedFrameworkSelections += 1
      }

      if (!chosen) {
        missingComponents.push(componentInput)
        continue
      }

      const canonicalName =
        chosen.componentsByLowerName.get(componentInput) ?? componentInput
      resolvedComponents.push({
        componentInput,
        componentName: canonicalName,
        sourceUrl: chosen.sourceUrl,
        libraryName: chosen.libraryName,
        frameworkName: chosen.frameworkName,
        sourceRoot: chosen.sourceRoot,
        sourceFrameworkRoot: chosen.sourceFrameworkRoot,
        sourceComponentDir: join(chosen.sourceFrameworkRoot, canonicalName),
        outputPath: chosen.outputPath,
        codeRoot: chosen.codeRoot,
        copyFilesRoot: chosen.copyFilesRoot,
      })
    }

    const projectRoot = getProjectRootFromConfigPath(config.path)
    const changedFilePaths = new Set<string>()
    const aliasMappingsCache = new Map<string, AliasRewriteMapping[]>()
    const summary: UIAddSummary = {
      copied: 0,
      overwritten: 0,
      skippedExisting: 0,
      unchangedExisting: 0,
      missingComponents,
      promptedFrameworkSelections,
    }
    const componentPackageJsonSourcePaths = new Set<string>()

    for (const component of resolvedComponents) {
      const sourceFiles = await listFilesRecursive(component.sourceComponentDir)
      if (sourceFiles.length === 0) {
        summary.missingComponents.push(component.componentInput)
        continue
      }

      const destinationComponentDir = join(
        projectRoot,
        normalizeProjectRelativePath(component.outputPath),
        component.componentName
      )

      for (const sourcePath of sourceFiles) {
        const relativePath = normalizeProjectRelativePath(
          sourcePath.slice(component.sourceComponentDir.length + 1)
        )
        if (isComponentPackageJson(relativePath)) {
          componentPackageJsonSourcePaths.add(sourcePath)
          continue
        }
        const destinationPath = join(destinationComponentDir, relativePath)
        const sourceFile = Bun.file(sourcePath)
        const destinationFile = Bun.file(destinationPath)
        const destinationExists = await destinationFile.exists()
        const shouldRewrite = isRewriteCandidate(relativePath)
        let sourceContent: ArrayBuffer | string
        if (shouldRewrite) {
          const sourceText = await sourceFile.text()
          const mappings = await resolveAliasMappingsForComponent({
            component,
            cache: aliasMappingsCache,
          })
          sourceContent = rewriteMappedImports(sourceText, mappings)
        } else {
          sourceContent = await sourceFile.arrayBuffer()
        }

        if (destinationExists) {
          const destinationDisplayPath = toRelativeDisplayPath(
            destinationPath,
            getCliCwd()
          )
          const beforeText = await destinationFile.text()
          const rawAfterText =
            typeof sourceContent === "string"
              ? sourceContent
              : await sourceFile.text()
          const previewFormatting =
            typeof sourceContent === "string"
              ? await formatPostAddUpdateDiffPreview({
                  postAddUpdateStep: uiConfig.data.postAddUpdateStep,
                  projectRoot,
                  files: [{ path: destinationPath, content: sourceContent }],
                })
              : new Map<string, string>()
          const afterText =
            previewFormatting.get(destinationPath) ?? rawAfterText

          if (beforeText === afterText) {
            summary.unchangedExisting += 1
            continue
          }

          if (
            previewFormatting.size === 0 &&
            (await hasMatchingContent(destinationFile, sourceContent))
          ) {
            summary.unchangedExisting += 1
            continue
          }

          const patch: TsconfigPatchPlan = {
            targetPath: destinationPath,
            beforeText,
            afterText,
            mode: "update",
          }

          box(
            createUnifiedDiff(patch, getCliCwd()),
            `File exists: ${destinationDisplayPath}`
          )

          const shouldOverwrite = await confirm({
            message: `Overwrite ${d.path(destinationDisplayPath)}?`,
            initialValue: true,
          })
          if (!shouldOverwrite) {
            summary.skippedExisting += 1
            continue
          }
        }

        await mkdir(dirname(destinationPath), { recursive: true })
        await Bun.write(destinationPath, sourceContent)
        changedFilePaths.add(destinationPath)
        summary.copied += 1
        if (destinationExists) {
          summary.overwritten += 1
        }
      }
    }

    const supportFilePaths = await ensureRequiredCopyFiles({
      projectRoot,
      resolvedComponents,
    })
    for (const path of supportFilePaths) {
      changedFilePaths.add(path)
    }
    summary.copied += supportFilePaths.length

    if (summary.copied > 0) {
      await installComponentDependencies({
        config,
        projectRoot,
        componentPackageJsonPaths: Array.from(componentPackageJsonSourcePaths),
      })

      await runPostAddUpdateStep({
        postAddUpdateStep: uiConfig.data.postAddUpdateStep,
        projectRoot,
        changedFilePaths: Array.from(changedFilePaths),
      })
    }

    if (summary.copied > 0) {
      log.success(
        `Added ${summary.copied} file${summary.copied === 1 ? "" : "s"} (${summary.overwritten} overwritten).`
      )
    }

    if (summary.skippedExisting > 0) {
      log.warn(
        `Skipped ${summary.skippedExisting} existing file${summary.skippedExisting === 1 ? "" : "s"}.`
      )
    }

    if (summary.unchangedExisting > 0) {
      log.info(
        `${summary.unchangedExisting} existing file${summary.unchangedExisting === 1 ? " already matches" : " already match"}.`
      )
    }

    if (summary.missingComponents.length > 0) {
      log.warn(
        `Skipped missing components: ${Array.from(new Set(summary.missingComponents)).join(", ")}`
      )
    }

    if (summary.copied === 0) {
      if (summary.missingComponents.length > 0) {
        return err(
          new Error(
            "No files were added because all requested components were missing or unresolved."
          )
        )
      }
      if (summary.unchangedExisting > 0) {
        return ok(summary)
      }
      return err(new Error("No files were added."))
    }

    return ok(summary)
  } catch (error) {
    return err(error as Error)
  }
}

function isRewriteCandidate(path: string): boolean {
  for (const extension of REWRITE_EXTENSIONS) {
    if (path.endsWith(extension)) {
      return true
    }
  }
  return false
}

function rewriteMappedImports(
  content: string,
  mappings: AliasRewriteMapping[]
): string {
  if (mappings.length === 0) {
    return content
  }

  const rewriteSpecifier = (specifier: string): string => {
    for (const mapping of mappings) {
      if (specifier === mapping.from) {
        return mapping.to
      }
      if (specifier.startsWith(`${mapping.from}/`)) {
        return `${mapping.to}${specifier.slice(mapping.from.length)}`
      }
    }
    return specifier
  }

  const rewrittenStatic = content.replace(
    /\b(import|export)\s+[^\n;]*?\sfrom\s*(["'])([^"']+)\2/g,
    (full, _keyword, quote, specifier) => {
      const rewritten = rewriteSpecifier(specifier)
      return full.replace(
        `${quote}${specifier}${quote}`,
        `${quote}${rewritten}${quote}`
      )
    }
  )

  return rewrittenStatic.replace(
    /\bimport\s*\(\s*(["'])([^"']+)\1\s*\)/g,
    (full, quote, specifier) => {
      const rewritten = rewriteSpecifier(specifier)
      return full.replace(
        `${quote}${specifier}${quote}`,
        `${quote}${rewritten}${quote}`
      )
    }
  )
}

export async function hasMatchingContent(
  destinationFile: Bun.BunFile,
  sourceContent: ArrayBuffer | string
): Promise<boolean> {
  if (typeof sourceContent === "string") {
    return (await destinationFile.text()) === sourceContent
  }

  const existing = Buffer.from(await destinationFile.arrayBuffer())
  return existing.equals(Buffer.from(sourceContent))
}
