import { helpFlag } from "@/arguments/flags/help.flag"
import { yesFlag } from "@/arguments/flags/yes.flag"
import { configOption } from "@/arguments/options/config.option"
import { packagesSequence } from "@/arguments/sequences/packages"
import { command } from "@hulla/args"

export const install = command({
  name: "install",
  alias: ["i", "add"],
  description: "Install a package",
  arguments: [helpFlag, yesFlag, packagesSequence, configOption],
})

export type InstallCommand = typeof install
