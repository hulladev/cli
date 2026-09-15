import type { CommandModule } from "@/app/types"
import { apiCommand } from "./command"
import { runApi } from "./run"

export const apiModule: CommandModule = {
  name: "api",
  definition: apiCommand,
  requiresProjectConfig: true,
  run: runApi,
}
