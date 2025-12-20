import { d } from "@/decorators"
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
          ? d.success("The values you provided are correct ✅")
          : d.success("Use the suggested script values ✅"),
        value: "use",
      },
    ],
    initialValue: "use",
  })
}
