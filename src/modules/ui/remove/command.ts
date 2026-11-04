import { commonArguments, frameworkOption } from "@/app/arguments"
import { command } from "@hulla/args"
import { componentsSequence } from "../add/command"

export const uiRemoveCommand = command({
  name: "remove",
  alias: ["r"],
  description: "Remove a UI component",
  arguments: [...commonArguments, frameworkOption, componentsSequence],
})
