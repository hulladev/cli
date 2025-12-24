import type { HullaConfig, RawHullaConfig } from "@/types"
import { ConfigSchema } from "schemas/hulla.schema"
import { readJsonFromPaths, resolveAbsolute } from "./bunUtils"

export async function getHullaConfig(
  dir: string,
  paths: string[] = [
    ".hulla/hulla.json",
    ".hulla/config.json",
    ".hulla/hulla.config.json",
    "hulla.json",
    "hulla.config.json",
    ".hulla/config.ts",
  ]
): Promise<HullaConfig | null> {
  const fullPaths = paths.map((p) => resolveAbsolute(dir, p))
  const result = await readJsonFromPaths<RawHullaConfig>(fullPaths)

  if (!result) return null

  const config = ConfigSchema.parse(result.data)

  return {
    ...config,
    path: result.path,
    rawConfig: result.data,
  }
}
