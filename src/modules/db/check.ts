import { checkConfigSyntax } from "@/checks/config"
import { checkPackages } from "@/checks/packages"
import { declares, type IntegrationCheck } from "@/checks/types"
import { existsSync, statSync } from "node:fs"
import { join } from "node:path"

export const dbCheck: IntegrationCheck = {
  name: "db",
  detect: (context) =>
    declares(context, "@hulla/db") ||
    existsSync(join(context.root, "db.config.ts")),
  async check(context) {
    const results = await checkPackages(context, ["@hulla/db"])
    const path = join(context.root, "db.config.ts")
    if (existsSync(path)) {
      if (statSync(path).isFile()) results.push(await checkConfigSyntax(path))
      results.push({
        id: "db:config",
        status: statSync(path).isFile() ? "warning" : "failure",
        message: statSync(path).isFile()
          ? "db.config.ts exists; configuration values and connectivity were not evaluated."
          : "db.config.ts is not a file.",
      })
    }
    return results
  },
}
