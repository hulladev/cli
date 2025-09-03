import type { Command } from "@/cli"
import {
  detectScriptsAndManager,
  getInitConfirmationAndPackageJson,
} from "@/lib/init/autodetect.init"
import { validateDirectoryAndGetConfig } from "@/lib/init/validators.init"
import { writeConfig } from "@/lib/shared/writers"
import { intro } from "@/prompts/intro"
import { log } from "@/prompts/log"
import type { HullaConfig, PackageManager } from "@/types.private"
import type { Err, Ok } from "@hulla/control"
import { err, ok } from "@hulla/control"
import { join } from "node:path"
import pc from "picocolors"
import type { HullaConfigSchema } from "schemas/hulla.types"
import type { HandlerOutput } from "../types.handler"

export type InitUserAction = "editScripts" | "editPackageManager" | "use"

export type InitScriptManagerProps = {
  scripts: HullaConfigSchema["cli"]["scripts"] | undefined
  packageManager: PackageManager | "other" | null
  didManuallyEditScripts: boolean
  executePhase?: InitUserAction
}

export async function init(c: Command<"init">): Promise<HandlerOutput> {
  const dir = c.arguments.path?.value ?? process.cwd()
  intro(`🚀 Setting up a new ${pc.blue("hulla")} project in: ${pc.green(dir)}`)

  const result = await initHullaProject(dir)
  if (result.isErr()) {
    return err(result.error)
  }

  return ok({
    type: "success",
    message: "Hulla project initialized",
    fn: "success",
  })
}

export async function initHullaProject(
  dir: string
): Promise<Ok<HullaConfig> | Err<Error>> {
  try {
    // 1. Validate directory and check existing config
    const existingConfig = await validateDirectoryAndGetConfig(dir)
    if (existingConfig) return ok(existingConfig)

    // 2. Get user confirmation and package.json
    const packageJson = await getInitConfirmationAndPackageJson(dir)
    if (!packageJson) {
      return err(new Error("Initialization cancelled or no package.json found"))
    }

    // 3. Detect and configure scripts and package manager
    const { scripts, packageManager } = await detectScriptsAndManager(
      packageJson,
      dir
    )

    const configPath = join(dir, ".hulla/hulla.json")
    const config: HullaConfig = {
      cli: {
        scripts,
        packageManager,
      },
      path: configPath,
    }

    log.info(`Writing config to ${pc.green(configPath)}`)
    await writeConfig(config, configPath)
    log.success(`Config created ✅`)

    return ok(config)
  } catch (error) {
    return err(error as Error)
  }
}
