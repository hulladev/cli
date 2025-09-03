import type { InitScriptManagerProps } from "@/handlers/commands/init.handler"
import { note } from "@/prompts/note"
import { text } from "@/prompts/text"
import type { PackageManager } from "@/types.private"
import pc from "picocolors"
import type { HullaConfigSchema } from "schemas/hulla.types"
import { SCRIPT_KEYS } from "../constants"
import { handlePackageManagerEdit, handleScriptsEdit } from "./editors.init"
import { getUserChoice } from "./prompts.init"

export const manualScriptsInput = async (
  scriptValues: HullaConfigSchema["cli"]["scripts"] | undefined
): Promise<HullaConfigSchema["cli"]["scripts"]> => {
  const result: HullaConfigSchema["cli"]["scripts"] = {
    add: "",
    addDev: "",
    uninstall: "",
    upgrade: "",
  }

  for (const key of SCRIPT_KEYS) {
    const scriptValue = await text({
      message: `What would you like to use for ${key}?`,
      placeholder: "Enter a value",
      initialValue: scriptValues?.[key] ?? "",
    })
    result[key] = scriptValue
  }

  return result
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
