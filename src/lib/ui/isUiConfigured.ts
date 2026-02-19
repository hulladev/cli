import type { HullaConfig } from "@/types"
import { readUIConfig } from "./config"

export async function isUIConfigured(config: HullaConfig) {
  try {
    const uiConfig = await readUIConfig(config)
    return uiConfig.data.installs.length > 0
  } catch {
    return false
  }
}
