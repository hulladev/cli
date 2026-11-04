import { commonArguments } from "@/app/arguments"
import { command, infiniteSequence } from "@hulla/args"

export const packagesSequence = infiniteSequence({
  name: "packages",
  description: "Packages to install",
})

export const installCommand = command({
  name: "install",
  alias: ["i", "add"],
  description: "Check that the selected project directory exists",
  arguments: [...commonArguments, packagesSequence],
})
