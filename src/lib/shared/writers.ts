import { d } from "@/decorators"
import { log } from "@/prompts/log"
import type { HullaConfig } from "@/types"
import { omit } from "@/utils/objects"
import { join } from "path"
import { cwd } from "process"
import { ConfigSchema } from "schemas/hulla.schema"
import type { HullaConfigSchema } from "schemas/hulla.types"
import { writeJsonFile } from "./bunUtils"

/**
 * Remove default values from config to keep JSON clean
 * Returns object with $schema first to ensure it appears first in JSON
 */
function removeDefaults(config: HullaConfigSchema): {
  $schema?: string
  cli: {
    scripts: HullaConfigSchema["cli"]["scripts"]
    cache?: boolean
    cacheDir?: string
    logs?: boolean
  }
  configs?: HullaConfigSchema["configs"]
} {
  const defaultCacheDir = join(cwd(), ".hulla/.cache")
  const cli: {
    scripts: HullaConfigSchema["cli"]["scripts"]
    cache?: boolean
    cacheDir?: string
    logs?: boolean
  } = {
    scripts: config.cli.scripts,
  }

  // Only include optional fields if they differ from defaults
  if (config.cli.cache !== true) {
    cli.cache = config.cli.cache
  }
  if (config.cli.cacheDir !== defaultCacheDir) {
    cli.cacheDir = config.cli.cacheDir
  }
  if (config.cli.logs !== true) {
    cli.logs = config.cli.logs
  }

  // Build result with $schema first to ensure it appears first in JSON
  const result: {
    $schema?: string
    cli: {
      scripts: HullaConfigSchema["cli"]["scripts"]
      cache?: boolean
      cacheDir?: string
      logs?: boolean
    }
    configs?: HullaConfigSchema["configs"]
  } = {
    cli,
  }

  // Always include $schema first if present
  if (config.$schema) {
    result.$schema = config.$schema
  }

  result.configs = config.configs

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
