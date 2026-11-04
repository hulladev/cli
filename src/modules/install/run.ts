import { commandErr } from "@/app/result"
import type { CommandModule } from "@/app/types"

export const runInstall: CommandModule["run"] = async () =>
  commandErr(
    new Error(
      "hulla install is not implemented. Use your package manager to install packages, or hulla ui add <components> to install UI source."
    )
  )

export const installRunner = runInstall
