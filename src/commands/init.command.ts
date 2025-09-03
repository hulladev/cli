import { command } from "@hulla/args"
import { pathOption } from "@/arguments/options/path.option"
import { helpFlag } from "@/arguments/flags/help.flag"
import { cleanFlag } from "@/arguments/flags/clean.flag"

export const init = command({
  name: "init",
  alias: ["initialize"],
  description: "Initialize a new Hulla project",
  arguments: [pathOption, helpFlag, cleanFlag],
})

export type InitCommand = typeof init
