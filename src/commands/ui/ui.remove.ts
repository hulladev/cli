import { helpFlag } from "@/arguments/flags/help.flag"
import { configOption } from "@/arguments/options/config.option"
import { command } from "@hulla/args"
import { components } from "./ui.add"

export const uiRemove = command({
  name: "remove",
  alias: ["r"],
  description: "Remove a UI component",
  arguments: [helpFlag, configOption, components],
})

export type UiRemoveCommand = typeof uiRemove
