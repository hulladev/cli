import { configOption, helpFlag, yesFlag } from "@/app/arguments"
import { command } from "@hulla/args"

export const apiGenerateCommand = command({
  name: "generate",
  description: "Generate @hulla/api artifacts",
  arguments: [helpFlag, yesFlag, configOption],
})

export const apiDevCommand = command({
  name: "dev",
  description: "Watch and regenerate @hulla/api artifacts",
  arguments: [helpFlag, yesFlag, configOption],
})

export const apiInitCommand = command({
  name: "init",
  description: "Detect and scaffold an @hulla/api procedure project",
  arguments: [helpFlag, yesFlag, configOption],
})

export const apiCommand = command({
  name: "api",
  description: "Generate @hulla/api contracts and clients",
  arguments: [helpFlag, yesFlag, configOption],
  commands: [apiInitCommand, apiGenerateCommand, apiDevCommand],
})
