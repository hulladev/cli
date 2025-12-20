import { helpFlag } from "@/arguments/flags/help.flag"
import { configOption } from "@/arguments/options/config.option"
import { packagesSequence } from "@/arguments/sequences/packages"
import { command } from "@hulla/args"

export const install = command({
  name: "install",
  alias: ["i", "add"],
  description: "Install a package",
  arguments: [helpFlag, packagesSequence, configOption],
})

export type InstallCommand = typeof install
