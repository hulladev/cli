import { d } from "@/decorators"
import {
  detectScriptsAndManager,
  getInitConfirmationAndPackageJson,
} from "@/lib/init/autodetect.init"
import { validateDirectoryAndGetConfig } from "@/lib/init/validators.init"
import { resolveAbsolute } from "@/lib/shared/bunUtils"
import { getSchemaUrl } from "@/lib/shared/constants"
import { writeConfig } from "@/lib/shared/writers"
import { confirm } from "@/prompts/confirm"
import { intro } from "@/prompts/intro"
import { log } from "@/prompts/log"
import { outro } from "@/prompts/outro"
import type {
  HandlerFunction,
  HullaConfig,
  PackageManager,
  RawHullaConfig,
} from "@/types"
import type { Err, Ok } from "@hulla/control"
import { err, ok } from "@hulla/control"
import { dirname } from "node:path"
import { ConfigSchema, type HullaConfigSchema } from "schemas/hulla.schema"

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
  const configPath = commandResult.arguments.config?.value
  const dir = getProjectDirFromConfigOption(configPath)
  intro(
    `🚀 Setting up a new ${d.highlight("hulla")} project in: ${d.path(dir)}`
  )

  const result = await initHullaProject(dir, "overwrite", configPath)
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
  mode: "check" | "overwrite" = "check",
  configPath?: string
): Promise<Ok<HullaConfig> | Err<Error>> {
  try {
    // 1. Validate directory and check existing config
    const existingConfig = await validateDirectoryAndGetConfig(dir, configPath)
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

    // 3. Detect and configure scripts
    const { scripts } = await detectScriptsAndManager(packageJson, dir)

    const outputConfigPath = resolveAbsolute(dir, ".hulla/hulla.json")
    const rawConfig: RawHullaConfig = {
      $schema: getSchemaUrl(),
      cli: {
        scripts,
      },
      configs: {
        ui: ".hulla/ui.json",
      },
    }
    const parsedConfig = ConfigSchema.parse(rawConfig)
    const config: HullaConfig = {
      ...parsedConfig,
      path: outputConfigPath,
      rawConfig,
    }

    log.info(`Writing config to ${d.path(outputConfigPath)}`)
    await writeConfig(config, outputConfigPath)

    return ok(config)
  } catch (error) {
    return err(error as Error)
  }
}

export function getProjectDirFromConfigOption(configPath?: string): string {
  if (!configPath) {
    return process.cwd()
  }

  return dirname(resolveAbsolute(process.cwd(), configPath))
}
