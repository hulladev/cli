import type { PackageManager } from "@/types"
import type { HullaConfigSchema } from "schemas/hulla.types"

export function getConfigScripts(
  packageManager: PackageManager
): HullaConfigSchema["cli"]["scripts"] {
  switch (packageManager) {
    case "npm":
      return {
        add: "npm install",
        addDev: "npm install --save-dev",
        uninstall: "npm uninstall",
        upgrade: "npm update",
      }
    case "pnpm":
      return {
        add: "pnpm add",
        addDev: "pnpm add -D",
        uninstall: "pnpm remove",
        upgrade: "pnpm upgrade",
      }
    case "yarn":
      return {
        add: "yarn add",
        addDev: "yarn add -D",
        uninstall: "yarn remove",
        upgrade: "yarn upgrade",
      }
    case "bun":
      return {
        add: "bun add",
        addDev: "bun add -D",
        uninstall: "bun remove",
        upgrade: "bun update",
      }
  }
}
