import type { HullaConfig, RawHullaConfig } from "@/app/types"
import { basename, dirname, resolve } from "node:path"
import { ConfigSchema } from "schemas/hulla.schema"

export function getProjectRootFromConfigPath(configPath: string): string {
  const configDir = dirname(configPath.replace(/\\/g, "/"))
  return basename(configDir) === ".hulla" ? dirname(configDir) : configDir
}

export function resolveHullaConfig(
  rawConfig: RawHullaConfig,
  configPath: string
): HullaConfig {
  const path = resolve(configPath)
  const config = ConfigSchema.parse(rawConfig)
  const root = getProjectRootFromConfigPath(path)

  return {
    ...config,
    cli: {
      ...config.cli,
      cacheDir: resolve(root, config.cli.cacheDir),
    },
    path,
    rawConfig,
  }
}
