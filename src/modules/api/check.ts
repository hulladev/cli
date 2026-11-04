import { checkConfigSyntax } from "@/checks/config"
import { checkPackages } from "@/checks/packages"
import type {
  CheckContext,
  CheckResult,
  IntegrationCheck,
} from "@/checks/types"
import { existsSync, statSync } from "node:fs"
import { resolve } from "node:path"

function apiPackages(context: CheckContext): string[] {
  return Object.keys(context.dependencies).filter(
    (name) => name === "@hulla/api" || name.startsWith("@hulla/api-")
  )
}

export const apiCheck: IntegrationCheck = {
  name: "api",
  detect: (context) =>
    apiPackages(context).length > 0 ||
    (context.config !== null &&
      context.config.configs.api !== "api.config.ts") ||
    existsSync(
      resolve(context.root, context.config?.configs.api ?? "api.config.ts")
    ),
  async check(context) {
    const names = apiPackages(context)
    if (!names.includes("@hulla/api")) names.push("@hulla/api")
    const results = await checkPackages(context, names)
    const configured =
      context.apiConfigPath ?? context.config?.configs.api ?? "api.config.ts"
    const path = resolve(context.root, configured)
    if (existsSync(path)) {
      results.push({
        id: "api:config",
        status: statSync(path).isFile() ? "pass" : "failure",
        message: statSync(path).isFile()
          ? `API generator config exists (${configured}); its code was not evaluated.`
          : `API generator config is not a file (${configured}).`,
      })
      if (statSync(path).isFile()) results.push(await checkConfigSyntax(path))
      results.push({
        id: "api:generator",
        status: "warning",
        message:
          "Generator exports and output are not validated by this static check; API 2 runtime/client use does not require generation.",
        fix: "Before using api generate, confirm the installed API version supports the CLI's legacy generator workflow.",
      })
    } else if (context.apiConfigPath || configured !== "api.config.ts") {
      results.push({
        id: "api:config",
        status: "failure",
        message: `Configured API generator file is missing: ${configured}.`,
        fix: "Restore the file or correct the configured API path.",
      })
    }
    return results satisfies CheckResult[]
  },
}
