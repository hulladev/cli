import type { HullaConfigSchema } from "schemas/hulla.types"

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun"
export type HullaConfig = HullaConfigSchema & {
  path: string
}
