import { option } from "@hulla/args"

export const configOption = option({
  name: "config",
  description: "Path to the config file",
})

export type ConfigOption = typeof configOption
