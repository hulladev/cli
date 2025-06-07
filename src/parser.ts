import { flag, parser } from "@hulla/args"

export const cli = parser({
  name: "hulla",
  settings: {
    startIndex: 2,
  },
  arguments: [
    flag({
      name: "version",
      description: "Show the version number",
    }),
    flag({
      name: "help",
      description: "Show the help message",
    }),
  ],
})
