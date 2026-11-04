import { apiModule } from "@/modules/api"
import { initModule } from "@/modules/init"
import { installModule } from "@/modules/install"
import { uiModule } from "@/modules/ui"
import { parser } from "@hulla/args"
import { configOption, helpFlag, versionFlag, yesFlag } from "./arguments"
import type { CommandModule } from "./types"

export const commandModules: CommandModule[] = [
  apiModule,
  installModule,
  initModule,
  uiModule,
]

export const cliDefinition = {
  name: "hulla",
  description:
    "Initialize projects, install @hulla/ui source, and generate @hulla/api artifacts.",
  settings: {
    startIndex: 2,
    sharedDash: true,
  },
  arguments: [versionFlag, helpFlag, yesFlag, configOption],
  commands: commandModules.map((module) => module.definition),
}

export const cli = parser(cliDefinition)
