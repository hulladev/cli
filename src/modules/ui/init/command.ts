import { configOption, helpFlag, yesFlag } from "@/app/arguments"
import { command } from "@hulla/args"

export const uiInitCommand = command({
  name: "init",
  alias: ["i"],
  description: "Initialize a new UI project",
  arguments: [helpFlag, yesFlag, configOption],
})
