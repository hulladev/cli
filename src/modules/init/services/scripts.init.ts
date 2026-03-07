import { text } from "@/prompts/text"
import { SCRIPT_KEYS } from "@/shared/constants"
import type { HullaConfigSchema } from "schemas/hulla.types"

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
