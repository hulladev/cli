import type { HullaConfig } from "@/types.private"
import { existsSync } from "fs"
import { readFile } from "fs/promises"
import { join } from "path"

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
): Promise<HullaConfig | null> {
  const errors: string[] = []

  for await (const p of path) {
    try {
      if (!existsSync(join(dir, p))) continue
      const config = await readFile(join(dir, p), {
        encoding: "utf-8",
        flag: "r",
      })
      return { ...JSON.parse(config), path: join(dir, p) }
    } catch (error) {
      // Collect parsing errors for potential debugging
      if (existsSync(join(dir, p))) {
        errors.push(
          `Failed to parse ${p}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
      continue
    }
  }

  // If we found config files but couldn't parse any of them, throw an error
  if (errors.length > 0) {
    throw new Error(
      `Found config files but failed to parse them:\n${errors.join("\n")}`
    )
  }

  return null
}
