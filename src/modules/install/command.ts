import { configOption, helpFlag, yesFlag } from "@/app/arguments"
import { command, infiniteSequence } from "@hulla/args"

export const packagesSequence = infiniteSequence({
  name: "packages",
  description: "Packages to install",
})

export const installCommand = command({
  name: "install",
  alias: ["i", "add"],
  description: "Install a package",
  arguments: [helpFlag, yesFlag, packagesSequence, configOption],
})
