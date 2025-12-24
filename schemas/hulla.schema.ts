import { z } from "zod"

export const ConfigSchema = z.object({
  $schema: z.string().optional(),
  cli: z.object({
    scripts: z.object({
      add: z.string(),
      addDev: z.string(),
      uninstall: z.string(),
      upgrade: z.string(),
    }),
    cache: z.boolean().optional().default(true),
    cacheDir: z.string().optional().default("~/.cache/hulla"),
    logs: z.boolean().optional().default(true),
  }),
})

export type HullaConfigSchema = z.infer<typeof ConfigSchema>
