import { parser } from "@hulla/args"
import { helpFlag } from "./arguments/flags/help.flag"
import { versionFlag } from "./arguments/flags/version.flag"
import { configOption } from "./arguments/options/config.option"
import { init } from "./commands/init.command"
import { install } from "./commands/install.command"

export const cli = parser({
  name: "hulla",
  settings: {
    startIndex: 2,
    sharedDash: true,
  },
  arguments: [versionFlag, helpFlag, configOption],
  commands: [install, init],
})

type Cli = Awaited<ReturnType<(typeof cli)["parse"]>>
export type Arg<K extends keyof Cli["arguments"]> = Cli["arguments"][K]
export type Command<K extends keyof Cli["commands"]> = Cli["commands"][K]
