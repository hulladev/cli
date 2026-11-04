import { getStringOption } from "@/app/options"
import { commandErr, commandOk } from "@/app/result"
import type { CommandContext, CommandModule, ParserResult } from "@/app/types"
import {
  getProjectRootFromConfigPath,
  normalizeProjectRelativePath,
  readUIConfig,
} from "@/modules/ui/config"
import { d } from "@/terminal/format"
import { confirm } from "@/terminal/prompts/confirm"
import { rm, stat } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"
import {
  buildFrameworkInstalls,
  findMatchesForComponent,
  selectMatchingFramework,
} from "../add/services/selection"
import { removeComponentStyles } from "../shared/component-styles"

export async function runUiRemove({
  context,
  result,
}: {
  context: CommandContext
  result: ParserResult["commands"]["ui"]["commands"]["remove"]
}) {
  try {
    const requested = normalizeComponentInputs(
      Array.isArray(result.arguments.components?.value)
        ? result.arguments.components.value
        : []
    )
    if (requested.length === 0) {
      return commandErr(
        new Error(
          "Component input is required. Pass one or more component names to `hulla ui remove`."
        )
      )
    }

    const uiConfig = await readUIConfig(context.config)
    const frameworks = await buildFrameworkInstalls(
      context.config,
      uiConfig.data.installs
    )
    const explicitFramework = resolveExplicitFramework(context.parserResult)
    const projectRoot = getProjectRootFromConfigPath(context.config.path)
    const removed: string[] = []
    const missing: string[] = []

    for (const componentInput of requested) {
      const matches = findMatchesForComponent({
        frameworkInstalls: frameworks,
        componentInput,
        explicitFramework,
      })
      if (matches.length === 0) {
        missing.push(componentInput)
        continue
      }

      const selection = await selectMatchingFramework(
        componentInput,
        matches,
        explicitFramework
      )
      if (!selection.chosen) {
        missing.push(componentInput)
        continue
      }

      const componentName =
        selection.chosen.componentsByLowerName.get(componentInput) ??
        componentInput
      const outputRoot = resolve(
        projectRoot,
        normalizeProjectRelativePath(selection.chosen.outputPath)
      )
      const destination = resolve(outputRoot, componentName)
      assertWithin(outputRoot, destination)

      if (!(await directoryExists(destination))) {
        missing.push(componentName)
        continue
      }

      const approved = await confirm({
        message: `Remove ${d.path(relative(projectRoot, destination))}?`,
        initialValue: false,
      })
      if (!approved) continue

      await rm(destination, { recursive: true, force: false })
      await removeComponentStyles({
        projectRoot,
        frameworks: frameworks.map((framework) => framework.frameworkName),
        componentRoot: destination,
      })
      removed.push(componentName)
    }

    return commandOk("UI components removed successfully", {
      removed,
      missing,
    })
  } catch (error) {
    return commandErr(error as Error)
  }
}

function resolveExplicitFramework(parserResult: ParserResult): string | null {
  return getStringOption(parserResult, "framework")?.trim() ?? null
}

function normalizeComponentInputs(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0)
    )
  )
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

function assertWithin(parent: string, child: string): void {
  const pathFromParent = relative(parent, child)
  if (
    pathFromParent === "" ||
    pathFromParent === ".." ||
    pathFromParent.startsWith(
      `..${process.platform === "win32" ? "\\" : "/"}`
    ) ||
    isAbsolute(pathFromParent)
  ) {
    throw new Error(`Refusing to remove unsafe component path: ${child}`)
  }
}

export const uiRemoveRunner: CommandModule["run"] = runUiRemove
