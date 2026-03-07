import { initModule } from "@/modules/init"
import { installModule } from "@/modules/install"
import { uiModule } from "@/modules/ui"
import { parser } from "@hulla/args"
import { configOption, helpFlag, versionFlag, yesFlag } from "./arguments"
import type { CommandModule } from "./types"

export const commandModules: CommandModule[] = [
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
  arguments: [versionFlag, helpFlag, yesFlag, configOption],
  commands: commandModules.map((module) => module.definition) as unknown as [],
})
