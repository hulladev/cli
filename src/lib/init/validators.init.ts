import { d } from "@/decorators"
import type { HullaConfig } from "@/types"
import { directoryExists } from "../shared/bunUtils"
import { getHullaConfig } from "../shared/getHullaConfig"

export const validateDirectoryAndGetConfig = async (
  dir: string,
  configPath?: string
): Promise<HullaConfig | null> => {
  if (!(await directoryExists(dir))) {
    throw new Error(
      `Directory ${d.error(dir)} does not exist. Either cd to a valid directory or correct the ${d.highlight("--config")} option`
    )
  }

  try {
    const existingProject = await getHullaConfig(dir, configPath)
    if (existingProject) {
      return existingProject
    }
  } catch (error) {
    // With explicit --config we should fail fast.
    if (configPath) {
      throw error
    }
    // For default discovery, treat load/parse failure as "no config"
    // so the init flow can recover the project interactively.
  }

  return null
}
