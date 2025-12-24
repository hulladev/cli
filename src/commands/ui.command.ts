import { helpFlag } from "@/arguments/flags/help.flag"
import { configOption } from "@/arguments/options/config.option"
import { command } from "@hulla/args"
import { uiAdd } from "./ui/ui.add"
import { uiInit } from "./ui/ui.init"
import { uiRemove } from "./ui/ui.remove"

export const ui = command({
  name: "ui",
  description: "CLI for @hulla/ui",
  arguments: [helpFlag, configOption],
  commands: [uiAdd, uiRemove, uiInit],
})

export type UiCommand = typeof ui
