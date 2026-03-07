import { commandErr, commandOk } from "@/app/result"
import type {
  CommandModule,
  HullaConfig,
  ParserResult,
  RawHullaConfig,
} from "@/app/types"
import { writeConfig } from "@/platform/config/write-hulla-config"
import { resolveAbsolute } from "@/platform/fs/bun"
import { getSchemaUrl } from "@/shared/constants"
import { d } from "@/terminal/format"
import { confirm } from "@/terminal/prompts/confirm"
import { intro } from "@/terminal/prompts/intro"
import { log } from "@/terminal/prompts/log"
import { outro } from "@/terminal/prompts/outro"
import { err, ok } from "@hulla/control"
import { dirname } from "node:path"
import { ConfigSchema } from "schemas/hulla.schema"
import {
  detectScriptsAndManager,
  getInitConfirmationAndPackageJson,
} from "./services/autodetect.init"
import { validateDirectoryAndGetConfig } from "./services/validators.init"

export async function runInit({
  result,
}: {
  context: unknown
  result: ParserResult["commands"]["init"]
}) {
  const configPath =
    typeof result.arguments.config?.value === "string"
      ? result.arguments.config.value
      : undefined
  const dir = getProjectDirFromConfigOption(configPath)
  intro(
    `Setting up a new ${d.highlight("hulla")} project in: ${d.path(dir)}`,
    "multiple"
  )

  const initResult = await initHullaProject(dir, "overwrite", configPath)
  if (initResult.isErr()) {
    return commandErr(initResult.error)
  }

  return commandOk("Project was sucessfully initialized", initResult.value)
}

export async function ensureProjectConfig(
  configPath?: string
): Promise<HullaConfig> {
  const dir = getProjectDirFromConfigOption(configPath)
  const result = await initHullaProject(dir, "check", configPath)
  if (result.isErr()) {
    throw result.error
  }
  return result.value
}

export async function initHullaProject(
  dir: string,
  mode: "check" | "overwrite" = "check",
  configPath?: string
) {
  try {
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
        message: "Would you like to overwrite it?",
        initialValue: true,
      })
      if (!overwriteConfirmed) {
        outro(`${d.package("error")} Initialization cancelled ✖︎`)
        process.exit(0)
      }
    }

    const packageJson = await getInitConfirmationAndPackageJson(
      dir,
      hasExistingConfig
    )
    if (!packageJson) {
      return err(new Error("Initialization cancelled or no package.json found"))
    }

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

export const initRunner: CommandModule["run"] = runInit
