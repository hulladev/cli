import { commonArguments } from "@/app/arguments"
import { command, flag, infiniteSequence } from "@hulla/args"

export const packagesSequence = infiniteSequence({
  name: "packages",
  description: "@hulla/* packages with optional versions or tags",
})

export const installCommand = command({
  name: "install",
  alias: ["i", "add"],
  description: "Install @hulla/* packages and optionally add package scripts",
  arguments: [
    ...commonArguments,
    flag({
      name: "scripts",
      long: ["scripts", "db-scripts"],
      short: [],
      description: "Add missing scripts for the selected packages",
    }),
    flag({
      name: "no-scripts",
      short: [],
      description: "Skip package script setup",
    }),
    flag({
      name: "dev",
      short: "D",
      description: "Install the selected packages as development dependencies",
    }),
    packagesSequence,
  ],
})
