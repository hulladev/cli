import { helpFlag } from "@/arguments/flags/help.flag"
import { pathOption } from "@/arguments/options/path.option"
import { packagesSequence } from "@/arguments/sequences/packages"
import { command } from "@hulla/args"

export const install = command({
  name: "install",
  alias: ["i", "add"],
  description: "Install a package",
  arguments: [helpFlag, packagesSequence, pathOption],
})

export type InstallCommand = typeof install
