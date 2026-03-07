import type { HullaConfig } from "@/app/types"
import { readUIConfig } from "@/modules/ui/config"

export async function isUIConfigured(config: HullaConfig) {
  try {
    const uiConfig = await readUIConfig(config)
    return uiConfig.data.installs.length > 0
  } catch {
    return false
  }
}
