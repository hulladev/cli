import { requestCliExit } from "@/app/runtime"
import type { HullaConfig } from "@/app/types"
import { writeJsonFile } from "@/platform/fs/bun"
import { omit } from "@/shared/utils/objects"
import { d } from "@/terminal/format"
import { log } from "@/terminal/prompts/log"
import { resolve } from "node:path"
import { ConfigSchema, DEFAULT_CACHE_DIR } from "schemas/hulla.schema"
import type { HullaConfigSchema } from "schemas/hulla.types"
import { getProjectRootFromConfigPath } from "./resolve-hulla-config"

/**
 * Remove default values from config to keep JSON clean
 * Returns object with $schema first to ensure it appears first in JSON
 */
function removeDefaults(
  config: HullaConfigSchema,
  filePath: string,
  originalCacheDir?: string
): {
  $schema?: string
  cli: {
    scripts: HullaConfigSchema["cli"]["scripts"]
    cache?: boolean
    cacheDir?: string
    logs?: boolean
  }
  configs?: HullaConfigSchema["configs"]
} {
  const root = getProjectRootFromConfigPath(resolve(filePath))
  const cacheDir = resolve(root, config.cli.cacheDir)
  const defaultCacheDir = resolve(root, DEFAULT_CACHE_DIR)
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
  if (cacheDir !== defaultCacheDir) {
    cli.cacheDir =
      originalCacheDir !== undefined &&
      resolve(root, originalCacheDir) === cacheDir
        ? originalCacheDir
        : config.cli.cacheDir
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
    requestCliExit(1)
  }
  const dataToWrite = removeDefaults(
    validatedConfig.data,
    filePath,
    "rawConfig" in config ? config.rawConfig.cli.cacheDir : undefined
  )

  await writeJsonFile(filePath, dataToWrite, true)
}
