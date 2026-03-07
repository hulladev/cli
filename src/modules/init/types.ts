import type { PackageManager } from "@/app/types"
import type { HullaConfigSchema } from "schemas/hulla.types"

export type InitUserAction = "editScripts" | "editPackageManager" | "use"

export type InitScriptManagerProps = {
  scripts: HullaConfigSchema["cli"]["scripts"] | undefined
  packageManager: PackageManager | "other" | null
  didManuallyEditScripts: boolean
  executePhase?: InitUserAction
}
