import type { HullaConfig } from "@/app/types"
import { d } from "@/decorators"
import { readHullaConfig } from "@/platform/config/read-hulla-config"
import { directoryExists } from "@/platform/fs/bun"

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
    const existingProject = await readHullaConfig(dir, configPath)
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
