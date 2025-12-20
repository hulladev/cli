import type { InitScriptManagerProps } from "@/handlers/commands/init.handler"
import { note } from "@/prompts/note"
import { select } from "@/prompts/select"
import type { PackageManager } from "@/types.private"
import pc from "picocolors"
import type { HullaConfigSchema } from "schemas/hulla.types"
import { PACKAGE_MANAGERS } from "../shared/constants"
import { getConfigScripts } from "../shared/getConfigScripts"
import { getUserChoice } from "./prompts.init"
import { manualScriptsInput } from "./scripts.init"

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

export const loopSelectProperties = async (
  props: InitScriptManagerProps
): Promise<{
  scripts: HullaConfigSchema["cli"]["scripts"]
  packageManager: PackageManager | "other"
}> => {
  // Show current scripts if available
  if (props.scripts) {
    await note(
      JSON.stringify(props.scripts, null, 2)
        .replaceAll("{", "")
        .replaceAll("}", ""),
      `${pc.bold(" We'll use the following scripts ")}`
    )
  }

  const phase =
    props.executePhase ?? (await getUserChoice(props.didManuallyEditScripts))

  switch (phase) {
    case "use":
      if (!props.scripts || !props.packageManager) {
        throw new Error("Cannot use undefined scripts or package manager")
      }
      return { scripts: props.scripts, packageManager: props.packageManager }

    case "editPackageManager":
      return await handlePackageManagerEdit(props)

    case "editScripts":
      return await handleScriptsEdit(props)

    default:
      throw new Error(`Unknown phase: ${phase}`)
  }
}
