import { flag } from "@hulla/args"

export const cleanFlag = flag({
  name: "clean",
})

export type CleanFlag = typeof cleanFlag
