import { d } from "@/decorators"
import { log } from "@/prompts/log"
import type { HullaConfig } from "@/types"
import { omit } from "@/utils/objects"
import { ConfigSchema } from "schemas/hulla.schema"
import type { HullaConfigSchema } from "schemas/hulla.types"
import { writeJsonFile } from "./bunUtils"

/**
 * Remove default values from config to keep JSON clean
 * Returns object with $schema first to ensure it appears first in JSON
 */
function removeDefaults(config: HullaConfigSchema): Partial<HullaConfigSchema> {
  const cli: HullaConfigSchema["cli"] = {
    scripts: config.cli.scripts,
  }

  // Only include optional fields if they differ from defaults
  if (config.cli.cache !== true) {
    cli.cache = config.cli.cache
  }
  if (config.cli.cacheDir !== "~/.cache/hulla") {
    cli.cacheDir = config.cli.cacheDir
  }
  if (config.cli.logs !== true) {
    cli.logs = config.cli.logs
  }

  // Build result with $schema first to ensure it appears first in JSON
  const result: Partial<HullaConfigSchema> = {}

  // Always include $schema first if present
  if (config.$schema) {
    result.$schema = config.$schema
  }

  result.cli = cli

  return result
}

export async function writeConfig(
  config: HullaConfigSchema | HullaConfig,
  filePath: string
) {
  const dataWithoutPath = omit(config as HullaConfig, ["path"])
  const validatedConfig = ConfigSchema.safeParse(dataWithoutPath)
  if (!validatedConfig.success) {
    log.error(
      `${d.package("error")} Invalid config: ${validatedConfig.error.message}`
    )
    process.exit(1)
  }
  const dataToWrite = removeDefaults(validatedConfig.data)

  await writeJsonFile(filePath, dataToWrite, true)
}
