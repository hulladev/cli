import { option } from "@hulla/args"

export const pathOption = option({
  name: "path",
  description: "Path to the config file",
})

export type PathOption = typeof pathOption
