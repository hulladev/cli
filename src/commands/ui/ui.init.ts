import { helpFlag } from "@/arguments/flags/help.flag"
import { configOption } from "@/arguments/options/config.option"
import { command } from "@hulla/args"

export const uiInit = command({
  name: "init",
  alias: ["i"],
  description: "Initialize a new UI project",
  arguments: [helpFlag, configOption, configOption],
})

export type UiInitCommand = typeof uiInit
