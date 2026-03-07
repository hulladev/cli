import {
  configOption,
  frameworkOption,
  helpFlag,
  yesFlag,
} from "@/app/arguments"
import { command, infiniteSequence } from "@hulla/args"

export const componentsSequence = infiniteSequence({
  name: "components",
  description: "Add a new UI component",
})

export const uiAddCommand = command({
  name: "add",
  alias: ["a"],
  description: "Add a new UI component",
  arguments: [
    helpFlag,
    yesFlag,
    configOption,
    frameworkOption,
    componentsSequence,
  ],
})
