import { helpFlag } from "@/arguments/flags/help.flag"
import { configOption } from "@/arguments/options/config.option"
import { command } from "@hulla/args"

export const ui = command({
  name: "ui",
  description: "CLI for @hulla/ui",
  arguments: [helpFlag, configOption],
})

export type UiCommand = typeof ui
