import { flag } from "@hulla/args"

export const versionFlag = flag({
  name: "version",
  description: "Show the version number",
})

export type VersionFlag = typeof versionFlag
