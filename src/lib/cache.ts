import type { HullaConfig } from "@/types"
import { join } from "path"

export const getCacheDir = (config: HullaConfig, packageDir?: "ui") => {
  return join(config.cli.cacheDir, packageDir ?? "")
}
