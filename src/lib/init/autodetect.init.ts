import { confirm } from "@/prompts/confirm"
import { log } from "@/prompts/log"
import { cliPrefix } from "@/prompts/templates/cliPrefix"
import type { PackageManager } from "@/types"
import { returnOnMatch } from "@/utils/strings"
import pc from "picocolors"
import type { HullaConfigSchema } from "schemas/hulla.types"
import { getConfigScripts } from "../shared/getConfigScripts"
import type { PackageJson } from "../shared/getPackageFiles"
import {
  getPackageJson,
  getPackageManagerFromLockfile,
} from "../shared/getPackageFiles"
import { loopSelectProperties } from "./editors.init"

export const detectScriptsAndManager = async (
  packageJson: PackageJson,
  dir: string
): Promise<{
  scripts: HullaConfigSchema["cli"]["scripts"]
  packageManager: PackageManager | "other"
}> => {
  let scripts: HullaConfigSchema["cli"]["scripts"] | undefined
  let packageManager: PackageManager | "other" | null = null

  // Attempt to auto-detect package manager and scripts
  const detectedPackageManager = packageJson.packageManager
    ? returnOnMatch(packageJson.packageManager, "pnpm", "npm", "yarn", "bun")
    : await getPackageManagerFromLockfile(dir)

  if (detectedPackageManager) {
    packageManager = detectedPackageManager
    scripts = getConfigScripts(detectedPackageManager)
  }

  if (scripts && packageManager) {
    await log.info(
      `${cliPrefix} Autodetected ${pc.green(packageManager)} as package manager`
    )
    return await loopSelectProperties({
      scripts,
      packageManager,
      didManuallyEditScripts: false,
    })
  }

  // Failed to auto-detect, prompt user for values
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
