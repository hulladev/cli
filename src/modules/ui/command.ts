import { checkFlag, commonArguments, uiSetupArguments } from "@/app/arguments"
import { command } from "@hulla/args"
import { uiAddCommand } from "./add/command"
import { uiInitCommand } from "./init/command"
import { uiListCommand } from "./list/command"
import { uiRemoveCommand } from "./remove/command"

export const uiCommand = command({
  name: "ui",
  description: "CLI for @hulla/ui",
  arguments: [checkFlag, ...commonArguments, ...uiSetupArguments],
  commands: [uiAddCommand, uiRemoveCommand, uiInitCommand, uiListCommand],
})
