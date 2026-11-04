import { commonArguments, uiSetupArguments } from "@/app/arguments"
import { command } from "@hulla/args"

export const uiInitCommand = command({
  name: "init",
  alias: ["i"],
  description: "Configure UI sources and output paths",
  arguments: [...commonArguments, ...uiSetupArguments],
})
