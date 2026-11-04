import type { PackageManager } from "@/app/types"
import { d } from "@/decorators"
import type { PackageJson } from "@/platform/package-json"
import { detectPackageManager, getPackageJson } from "@/platform/package-json"
import { confirm } from "@/prompts/confirm"
import { log } from "@/prompts/log"
import { cliPrefix } from "@/prompts/templates/cliPrefix"
import {
  isPromptNonInteractive,
  NonInteractivePromptError,
} from "@/terminal/prompts/runtime"
import type { HullaConfigSchema } from "schemas/hulla.types"
import { getConfigScripts } from "./config-scripts"
import { loopSelectProperties } from "./editors.init"

export const detectScriptsAndManager = async (
  dir: string
): Promise<{
  scripts: HullaConfigSchema["cli"]["scripts"]
  packageManager: PackageManager | "other"
}> => {
  const detection = await detectPackageManager(dir)
  if (detection) {
    for (const warning of detection.warnings) await log.warn(warning)
    await log.info(
      `${cliPrefix} Autodetected ${d.success(detection.manager)} as package manager from ${d.path(detection.sourcePath)}`
    )
    return await loopSelectProperties({
      scripts: getConfigScripts(detection.manager),
      packageManager: detection.manager,
      didManuallyEditScripts: false,
    })
  }

  // Failed to auto-detect, prompt user for values
  if (isPromptNonInteractive()) {
    throw new NonInteractivePromptError({
      prompt: "select",
      reason: "the package manager could not be detected.",
      hint: "Set packageManager in the app or workspace package.json, create a lockfile with your package manager, or run hulla init without --yes to choose install scripts.",
    })
  }
  return await loopSelectProperties({
    scripts: undefined,
    packageManager: null,
    didManuallyEditScripts: false,
    executePhase: "editPackageManager",
  })
}

export const getInitConfirmationAndPackageJson = async (
  dir: string,
  skipConfirmation = false
): Promise<PackageJson | null> => {
  if (!skipConfirmation) {
    log.warn(`There's no .hulla project in ${dir}`)
    const initConfirmed = await confirm({
      message:
        "Would you like to initialize a new hulla CLI project in this directory?",
      initialValue: true,
    })

    if (!initConfirmed) {
      return null
    }
  }

  const packageJson = await getPackageJson(dir, "package.json")
  if (!packageJson) {
    log.error("No package.json found in the directory")
    return null
  }

  return packageJson
}
