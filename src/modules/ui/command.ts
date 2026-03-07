import {
  configOption,
  frameworkOption,
  helpFlag,
  yesFlag,
} from "@/app/arguments"
import { command } from "@hulla/args"
import { uiAddCommand } from "./add/command"
import { uiInitCommand } from "./init/command"
import { uiRemoveCommand } from "./remove/command"

export const uiCommand = command({
  name: "ui",
  description: "CLI for @hulla/ui",
  arguments: [helpFlag, yesFlag, configOption, frameworkOption],
  commands: [uiAddCommand, uiRemoveCommand, uiInitCommand],
})
