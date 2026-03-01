import { flag } from "@hulla/args"

export const yesFlag = flag({
  name: "yes",
  short: "y",
  description: "Run non-interactively and accept confirmations",
})

export type YesFlag = typeof yesFlag
