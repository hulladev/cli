import { flag } from "@hulla/args"

export const helpFlag = flag({
  name: "help",
  description: "Show the help message",
})

export type HelpFlag = typeof helpFlag
