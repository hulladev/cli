import { apiCheck } from "@/modules/api/check"
import { controlCheck } from "@/modules/control/check"
import { dbCheck } from "@/modules/db/check"
import { styleCheck } from "@/modules/style/check"
import { uiCheck } from "@/modules/ui/check"
import type { IntegrationCheck } from "./types"

export const integrationChecks: IntegrationCheck[] = [
  uiCheck,
  styleCheck,
  apiCheck,
  dbCheck,
  controlCheck,
]
