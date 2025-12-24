import type { PackageManager } from "@/types"
import type { HullaConfigSchema } from "schemas/hulla.types"
import packageJson from "../../../package.json"

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

/**
 * Get the schema URL for the installed package version
 * Uses the version from package.json to ensure schema matches installed version
 */
export function getSchemaUrl(): string {
  const version = packageJson.version
  return `https://raw.githubusercontent.com/hulladev/cli/v${version}/schemas/hulla.schema.json`
}
