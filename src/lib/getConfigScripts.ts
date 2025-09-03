import { PackageManager } from "@/types.private"
import type { HullaConfigSchema } from "schemas/hulla.schema"

export function getConfigScripts(
  packageManager: PackageManager
): HullaConfigSchema["cli"]["scripts"] {
  switch (packageManager) {
    case "npm":
      return {
        install: "npm install",
        installDev: "npm install --save-dev",
        uninstall: "npm uninstall",
        upgrade: "npm update",
      }
    case "pnpm":
      return {
        install: "pnpm add",
        installDev: "pnpm add -D",
        uninstall: "pnpm remove",
        upgrade: "pnpm upgrade",
      }
    case "yarn":
      return {
        install: "yarn add",
        installDev: "yarn add -D",
        uninstall: "yarn remove",
        upgrade: "yarn upgrade",
      }
    case "bun":
      return {
        install: "bun add",
        installDev: "bun add -D",
        uninstall: "bun remove",
        upgrade: "bun update",
      }
  }
}
