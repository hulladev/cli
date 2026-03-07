import type { CommandModule } from "@/app/types"
import { uiCommand } from "./command"
import { runUi } from "./run"

export const uiModule: CommandModule = {
  name: "ui",
  definition: uiCommand,
  run: runUi,
}
