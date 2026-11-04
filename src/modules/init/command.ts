import { cleanFlag, commonArguments } from "@/app/arguments"
import { command } from "@hulla/args"

export const initCommand = command({
  name: "init",
  alias: ["initialize"],
  description: "Configure the hulla CLI for an existing project",
  arguments: [...commonArguments, cleanFlag],
})
