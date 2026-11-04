import { commonArguments, frameworkOption } from "@/app/arguments"
import { command, infiniteSequence, option } from "@hulla/args"

export const uiListCommand = command({
  name: "list",
  alias: ["ls", "search"],
  description:
    "Discover component families and exports in the selected registry",
  arguments: [
    ...commonArguments,
    frameworkOption,
    option({
      name: "source",
      short: [],
      description: "Registry URL or local directory to inspect",
    }),
    infiniteSequence({
      name: "query",
      description: "Filter by family, export, or source filename",
    }),
  ],
})
