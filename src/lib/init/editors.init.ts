import type { InitScriptManagerProps } from "@/handlers/commands/init.handler"
import { select } from "@/prompts/select"
import type { PackageManager } from "@/types.private"
import type { HullaConfigSchema } from "schemas/hulla.types"
import { PACKAGE_MANAGERS } from "../constants"
import { getConfigScripts } from "../shared/getConfigScripts"
import { loopSelectProperties, manualScriptsInput } from "./scripts.init"

export const handlePackageManagerEdit = async (
  props: InitScriptManagerProps
): Promise<{
  scripts: HullaConfigSchema["cli"]["scripts"]
  packageManager: PackageManager | "other"
}> => {
  const packageManagerConfirmed = await select({
    message: "What package manager would you like to use?",
    options: [
      ...PACKAGE_MANAGERS,
      { label: "Other (specify)", value: "other" as const },
    ],
    initialValue: (props.packageManager as PackageManager) ?? "npm",
  })

  if (packageManagerConfirmed !== "other") {
    const scripts = getConfigScripts(packageManagerConfirmed)
    return loopSelectProperties({
      scripts,
      packageManager: packageManagerConfirmed,
      didManuallyEditScripts: false,
    })
  }

  const scriptValues = await manualScriptsInput(props.scripts)
  return loopSelectProperties({
    scripts: scriptValues,
    packageManager: "other",
    didManuallyEditScripts: true,
  })
}

export const handleScriptsEdit = async (
  props: InitScriptManagerProps
): Promise<{
  scripts: HullaConfigSchema["cli"]["scripts"]
  packageManager: PackageManager | "other"
}> => {
  const scriptValues = await manualScriptsInput(props.scripts)
  return loopSelectProperties({
    scripts: scriptValues,
    packageManager: props.packageManager ?? "other",
    didManuallyEditScripts: true,
  })
}
