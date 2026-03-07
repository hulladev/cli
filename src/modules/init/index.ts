import type { CommandModule } from "@/app/types"
import { initCommand } from "./command"
import {
  ensureProjectConfig,
  getProjectDirFromConfigOption,
  initHullaProject,
  runInit,
} from "./run"

export const initModule: CommandModule = {
  name: "init",
  definition: initCommand,
  run: runInit,
}

export { ensureProjectConfig, getProjectDirFromConfigOption, initHullaProject }
