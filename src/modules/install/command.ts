import { commonArguments } from "@/app/arguments"
import { command, infiniteSequence } from "@hulla/args"

export const packagesSequence = infiniteSequence({
  name: "packages",
  description: "Packages to install",
})

export const installCommand = command({
  name: "install",
  alias: ["i", "add"],
  description: "Reserved command; use your package manager or hulla ui add",
  arguments: [...commonArguments, packagesSequence],
})
