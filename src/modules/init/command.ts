import { cleanFlag, configOption, helpFlag, yesFlag } from "@/app/arguments"
import { command } from "@hulla/args"

export const initCommand = command({
  name: "init",
  alias: ["initialize"],
  description: "Initialize a new Hulla project",
  arguments: [configOption, helpFlag, yesFlag, cleanFlag],
})
