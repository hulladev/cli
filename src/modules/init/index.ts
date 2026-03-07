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
  requiresProjectConfig: false,
  run: runInit,
}

export { ensureProjectConfig, getProjectDirFromConfigOption, initHullaProject }
