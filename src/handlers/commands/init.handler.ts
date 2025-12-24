import { d } from "@/decorators"
import {
  detectScriptsAndManager,
  getInitConfirmationAndPackageJson,
} from "@/lib/init/autodetect.init"
import { validateDirectoryAndGetConfig } from "@/lib/init/validators.init"
import { resolveAbsolute } from "@/lib/shared/bunUtils"
import { writeConfig } from "@/lib/shared/writers"
import { confirm } from "@/prompts/confirm"
import { intro } from "@/prompts/intro"
import { log } from "@/prompts/log"
import { outro } from "@/prompts/outro"
import type {
  HandlerFunction,
  HullaConfig,
  PackageManager,
} from "@/types"
import type { Err, Ok } from "@hulla/control"
import { err, ok } from "@hulla/control"
import type { HullaConfigSchema } from "schemas/hulla.types"

export type InitUserAction = "editScripts" | "editPackageManager" | "use"

export type InitScriptManagerProps = {
  scripts: HullaConfigSchema["cli"]["scripts"] | undefined
  packageManager: PackageManager | "other" | null
  didManuallyEditScripts: boolean
  executePhase?: InitUserAction
}

export const init: HandlerFunction<"commands", "init", HullaConfig> = async ({
  result: commandResult,
}) => {
  const dir = commandResult.arguments.config?.value ?? process.cwd()
  intro(
    `🚀 Setting up a new ${d.highlight("hulla")} project in: ${d.path(dir)}`
  )

  const result = await initHullaProject(dir, "overwrite")
  if (result.isErr()) {
    return err(result.error)
  }

  return ok({
    data: result.value,
    meta: { on: "commands", key: "init" },
    message: `Project was sucessfully initialized 🎉`,
  })
}

export async function initHullaProject(
  dir: string,
  mode: "check" | "overwrite" = "check"
): Promise<Ok<HullaConfig> | Err<Error>> {
  try {
    // 1. Validate directory and check existing config
    const existingConfig = await validateDirectoryAndGetConfig(dir)
    const hasExistingConfig = !!existingConfig
    if (existingConfig) {
      if (mode === "check") {
        return ok(existingConfig)
      }
      log.warn(
        `A ${d.path(existingConfig.path)} config already exists in this directory`
      )
      const overwriteConfirmed = await confirm({
        message: `Would you like to overwrite it?`,
        initialValue: false,
      })
      if (!overwriteConfirmed) {
        outro(`${d.package("error")} Initialization cancelled ✖︎`)
        process.exit(0)
      }
    }

    // 2. Get user confirmation and package.json
    // Skip confirmation if we're overwriting an existing config (already confirmed above)
    const packageJson = await getInitConfirmationAndPackageJson(
      dir,
      hasExistingConfig
    )
    if (!packageJson) {
      return err(new Error("Initialization cancelled or no package.json found"))
    }

    // 3. Detect and configure scripts and package manager
    const { scripts, packageManager } = await detectScriptsAndManager(
      packageJson,
      dir
    )

    const configPath = resolveAbsolute(dir, ".hulla/hulla.json")
    const config: HullaConfig = {
      cli: {
        scripts,
        packageManager,
      },
      path: configPath,
    }

    log.info(`Writing config to ${d.path(configPath)}`)
    await writeConfig(config, configPath)

    return ok(config)
  } catch (error) {
    return err(error as Error)
  }
}
