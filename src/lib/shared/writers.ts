import type { HullaConfig } from "@/types.private"
import { omit } from "@/utils/objects"
import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { HullaConfigSchema } from "schemas/hulla.types"

export async function writeConfig(
  config: HullaConfigSchema | HullaConfig,
  filePath: string
) {
  try {
    const dir = dirname(filePath)

    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }

    await writeFile(
      filePath,
      JSON.stringify(omit(config as HullaConfig, ["path"]), null, 2)
    )
  } catch (error) {
    throw new Error(
      `Failed to write config file: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
