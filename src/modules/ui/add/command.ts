import { commonArguments, uiSetupArguments } from "@/app/arguments"
import { command, infiniteSequence } from "@hulla/args"

export const componentsSequence = infiniteSequence({
  name: "components",
  description: "Component names (omit to select interactively)",
})

export const uiAddCommand = command({
  name: "add",
  alias: ["a"],
  description:
    "Add or update components; configure UI automatically on first use",
  arguments: [...commonArguments, ...uiSetupArguments, componentsSequence],
})
