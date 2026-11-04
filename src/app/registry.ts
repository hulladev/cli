import { apiModule } from "@/modules/api"
import { initModule } from "@/modules/init"
import { installModule } from "@/modules/install"
import { uiModule } from "@/modules/ui"
import { parser } from "@hulla/args"
import { commonArguments, versionFlag } from "./arguments"
import type { CommandModule } from "./types"

export const commandModules: CommandModule[] = [
  apiModule,
  installModule,
  initModule,
  uiModule,
]

export const cli = parser({
  name: "hulla",
  settings: {
    startIndex: 2,
    sharedDash: true,
  },
  arguments: [versionFlag, ...commonArguments],
  commands: commandModules.map((module) => module.definition) as unknown as [],
})
