import type { HullaConfig, RawHullaConfig } from "@/app/types"
import { readJsonFile, resolveAbsolute } from "@/platform/fs/bun"
import { ConfigSchema } from "schemas/hulla.schema"

export async function readHullaConfig(
  dir: string,
  configPath?: string
): Promise<HullaConfig | null> {
  const resolvedPath = resolveAbsolute(dir, configPath ?? ".hulla/hulla.json")
  const data = await readJsonFile<RawHullaConfig>(resolvedPath)

  if (!data) return null

  const config = ConfigSchema.parse(data)

  return {
    ...config,
    path: resolvedPath,
    rawConfig: data,
  }
}

export const getHullaConfig = readHullaConfig
