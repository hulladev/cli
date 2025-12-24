import { d } from "@/decorators"
import type { HullaConfig } from "@/types"
import { directoryExists } from "../shared/bunUtils"
import { getHullaConfig } from "../shared/getHullaConfig"

export const validateDirectoryAndGetConfig = async (
  dir: string
): Promise<HullaConfig | null> => {
  if (!(await directoryExists(dir))) {
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
