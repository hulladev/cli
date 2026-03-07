import { flag, option } from "@hulla/args"

export const helpFlag = flag({
  name: "help",
  description: "Show the help message",
})

export const versionFlag = flag({
  name: "version",
  description: "Show the version number",
})

export const yesFlag = flag({
  name: "yes",
  short: "y",
  description: "Run non-interactively and accept confirmations",
})

export const cleanFlag = flag({
  name: "clean",
})

export const configOption = option({
  name: "config",
  description: "Path to the config file",
})

export const frameworkOption = option({
  name: "framework",
  description: "The framework to use",
})
