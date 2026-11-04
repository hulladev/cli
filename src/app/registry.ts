import { checkModules } from "@/checks/commands"
import { apiModule } from "@/modules/api"
import { initModule } from "@/modules/init"
import { installModule } from "@/modules/install"
import { uiModule } from "@/modules/ui"
import { parser } from "@hulla/args"
import { checkFlag, commonArguments, versionFlag } from "./arguments"
import type { CommandModule } from "./types"

export const commandModules: CommandModule[] = [
  apiModule,
  installModule,
  initModule,
  uiModule,
  ...checkModules,
]

export const cliDefinition = {
  name: "hulla",
  settings: {
    startIndex: 2,
    sharedDash: true,
  },
  arguments: [versionFlag, checkFlag, ...commonArguments],
  commands: commandModules.map((module) => module.definition) as unknown as [],
}

export const cli = parser(cliDefinition)
