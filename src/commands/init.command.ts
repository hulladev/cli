import { cleanFlag } from "@/arguments/flags/clean.flag"
import { helpFlag } from "@/arguments/flags/help.flag"
import { yesFlag } from "@/arguments/flags/yes.flag"
import { configOption } from "@/arguments/options/config.option"
import { command } from "@hulla/args"

export const init = command({
  name: "init",
  alias: ["initialize"],
  description: "Initialize a new Hulla project",
  arguments: [configOption, helpFlag, yesFlag, cleanFlag],
})

export type InitCommand = typeof init
