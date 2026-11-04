import { cleanFlag, configOption, helpFlag, yesFlag } from "@/app/arguments"
import { command } from "@hulla/args"

export const initCommand = command({
  name: "init",
  alias: ["initialize"],
  description: "Initialize project configuration for the hulla CLI",
  arguments: [configOption, helpFlag, yesFlag, cleanFlag],
})
