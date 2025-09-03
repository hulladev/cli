import { log } from "@/prompts/log"
import type { HullaConfig } from "@/types.private"
import { existsSync } from "fs"
import pc from "picocolors"
import { getHullaConfig } from "../shared/getHullaConfig"

export const validateDirectoryAndGetConfig = async (
  dir: string
): Promise<HullaConfig | null> => {
  if (!existsSync(dir)) {
    throw new Error(
      `Directory ${pc.red(dir)} does not exist. Either cd to a valid directory or correct the ${pc.bold("--path")} option`
    )
  }

  const existingProject = await getHullaConfig(dir)
  if (existingProject) {
    await log.info(`Found existing hulla project in ${pc.green(dir)}`)
    return existingProject
  }

  return null
}
