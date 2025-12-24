import type { PackageManager } from "@/types"
import type { HullaConfigSchema } from "schemas/hulla.types"

export const PACKAGE_MANAGERS: Array<{ label: string; value: PackageManager }> =
  [
    { label: "npm", value: "npm" },
    { label: "pnpm", value: "pnpm" },
    { label: "yarn", value: "yarn" },
    { label: "bun", value: "bun" },
  ]

export const SCRIPT_KEYS = [
  "add",
  "addDev",
  "uninstall",
  "upgrade",
] as const satisfies Array<keyof HullaConfigSchema["cli"]["scripts"]>
