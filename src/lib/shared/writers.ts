import type { HullaConfig } from "@/types.private"
import { omit } from "@/utils/objects"
import type { HullaConfigSchema } from "schemas/hulla.types"
import { writeJsonFile } from "./bunUtils"

export async function writeConfig(
  config: HullaConfigSchema | HullaConfig,
  filePath: string
) {
  const data = omit(config as HullaConfig, ["path"])
  await writeJsonFile(filePath, data, true)
}
