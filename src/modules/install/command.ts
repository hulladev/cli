import { configOption, helpFlag, yesFlag } from "@/app/arguments"
import { command, infiniteSequence } from "@hulla/args"

export const packagesSequence = infiniteSequence({
  name: "packages",
  description: "Package names (accepted; currently unused)",
})

export const installCommand = command({
  name: "install",
  alias: ["i", "add"],
  description: "Check that the selected project directory exists",
  arguments: [helpFlag, yesFlag, packagesSequence, configOption],
})
