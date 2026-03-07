import { configOption, helpFlag, yesFlag } from "@/app/arguments"
import { command } from "@hulla/args"
import { componentsSequence } from "../add/command"

export const uiRemoveCommand = command({
  name: "remove",
  alias: ["r"],
  description: "Remove a UI component",
  arguments: [helpFlag, yesFlag, configOption, componentsSequence],
})
