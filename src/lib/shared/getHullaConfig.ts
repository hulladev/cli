import type { HullaConfig } from "@/types.private"
import type { HullaConfigSchema } from "schemas/hulla.types"
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
  const result = await readJsonFromPaths<HullaConfigSchema>(fullPaths)

  if (!result) return null

  return {
    ...result.data,
    path: result.path,
  }
}
