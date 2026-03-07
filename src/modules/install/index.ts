import type { CommandModule } from "@/app/types"
import { installCommand } from "./command"
import { runInstall } from "./run"

export const installModule: CommandModule = {
  name: "install",
  definition: installCommand,
  requiresProjectConfig: false,
  run: runInstall,
}
