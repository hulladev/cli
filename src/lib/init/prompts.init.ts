import type { InitUserAction } from "@/handlers/commands/init.handler"
import { select } from "@/prompts/select"

export const getUserChoice = async (
  didManuallyEditScripts: boolean
): Promise<InitUserAction> => {
  return await select({
    message: "What would you like to do?",
    options: [
      { label: "Edit scripts", value: "editScripts" },
      { label: "Edit package manager", value: "editPackageManager" },
      {
        label: didManuallyEditScripts
          ? "Use the suggested script values ✅"
          : "The values you provided are correct ✅",
        value: "use",
      },
    ],
    initialValue: "use",
  })
}
