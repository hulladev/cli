import type { HullaConfig, RawHullaConfig } from "@/app/types"
import { readJsonFile, resolveAbsolute } from "@/platform/fs/bun"
import { resolveHullaConfig } from "./resolve-hulla-config"

export async function readHullaConfig(
  dir: string,
  configPath?: string
): Promise<HullaConfig | null> {
  const resolvedPath = resolveAbsolute(dir, configPath ?? ".hulla/hulla.json")
  const data = await readJsonFile<RawHullaConfig>(resolvedPath)

  if (!data) return null

  return resolveHullaConfig(data, resolvedPath)
}

export const getHullaConfig = readHullaConfig
