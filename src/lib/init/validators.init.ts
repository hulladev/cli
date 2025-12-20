import { d } from "@/decorators"
import type { HullaConfig } from "@/types.private"
import { existsSync } from "fs"
import { getHullaConfig } from "../shared/getHullaConfig"

export const validateDirectoryAndGetConfig = async (
  dir: string
): Promise<HullaConfig | null> => {
  if (!existsSync(dir)) {
    throw new Error(
      `Directory ${d.error(dir)} does not exist. Either cd to a valid directory or correct the ${d.highlight("--config")} option`
    )
  }

  const existingProject = await getHullaConfig(dir)
  if (existingProject) {
    return existingProject
  }

  return null
}
