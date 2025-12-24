import { helpFlag } from "@/arguments/flags/help.flag"
import { configOption } from "@/arguments/options/config.option"
import { command, infiniteSequence } from "@hulla/args"

export const components = infiniteSequence({
  name: "components",
  description: "Add a new UI component",
})

export const uiAdd = command({
  name: "add",
  alias: ["a"],
  description: "Add a new UI component",
  arguments: [helpFlag, configOption, components],
})

export type UiAddCommand = typeof uiAdd
