import { commonArguments } from "@/app/arguments"
import { command, flag, infiniteSequence } from "@hulla/args"

export const packagesSequence = infiniteSequence({
  name: "packages",
  description: "@hulla/db with an optional version or tag",
})

export const installCommand = command({
  name: "install",
  alias: ["i", "add"],
  description: "Install @hulla/db and its matching development CLI",
  arguments: [
    ...commonArguments,
    flag({
      name: "db-scripts",
      short: [],
      description: "Add missing db:generate and db:dev package scripts",
    }),
    packagesSequence,
  ],
})
