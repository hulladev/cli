import { helpFlag } from "@/arguments/flags/help.flag"
import { yesFlag } from "@/arguments/flags/yes.flag"
import { configOption } from "@/arguments/options/config.option"
import { frameworkOption } from "@/arguments/options/framework.option"
import { command, infiniteSequence } from "@hulla/args"

export const components = infiniteSequence({
  name: "components",
  description: "Add a new UI component",
})

export const uiAdd = command({
  name: "add",
  alias: ["a"],
  description: "Add a new UI component",
  arguments: [helpFlag, yesFlag, configOption, frameworkOption, components],
})

export type UiAddCommand = typeof uiAdd
