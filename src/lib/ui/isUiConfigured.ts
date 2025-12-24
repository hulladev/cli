import type { RawHullaConfig } from "@/types"
import { uiSchema } from "schemas/hulla.schema"

export function isUIConfigured(rawConfig: RawHullaConfig) {
  if (!rawConfig.ui) {
    return false
  }
  const result = uiSchema.safeParse(rawConfig.ui)
  if (!result.success) {
    return false
  }
  return true
}
