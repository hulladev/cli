import type { HullaConfig, RawHullaConfig } from "@/types"
import { ConfigSchema } from "schemas/hulla.schema"
import { readJsonFile, resolveAbsolute } from "./bunUtils"

export async function getHullaConfig(
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
