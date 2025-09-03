import { z } from "zod"
import type { HullaConfigSchema } from "./hulla.types"

export const ConfigSchema = z.object({
  $schema: z.string().optional(),
  cli: z.object({
    scripts: z.object({
      add: z.string(),
      addDev: z.string(),
      uninstall: z.string(),
      upgrade: z.string(),
    }),
    packageManager: z.string().optional(),
    cache: z.boolean().optional(),
    logs: z.boolean().optional(),
  }),
}) satisfies z.ZodType<HullaConfigSchema>
