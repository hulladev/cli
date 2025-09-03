import { existsSync } from "fs"
import { readFile } from "fs/promises"
import { join } from "path"
import { HullaConfigSchema } from "schemas/hulla.schema"

export async function getHullaConfig(
  dir: string,
  path: string[] = [
    ".hulla/hulla.json",
    ".hulla/config.json",
    ".hulla/hulla.config.json",
    "hulla.json",
    "hulla.config.json",
    ".hulla/config.ts",
  ]
): Promise<HullaConfigSchema | null> {
  for await (const p of path) {
    try {
      if (!existsSync(join(dir, p))) continue
      const config = await readFile(join(dir, p), {
        encoding: "utf-8",
        flag: "r",
      })
      return JSON.parse(config)
    } catch {
      continue
    }
  }
  return null
}
