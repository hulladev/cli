import { getCliCwd } from "@/app/runtime"
import { join } from "path"
import { z } from "zod"

export const cliSchema = z.object({
  scripts: z.object({
    add: z.string(),
    addDev: z.string(),
    uninstall: z.string(),
    upgrade: z.string(),
  }),
  cache: z.boolean().optional().default(true),
  cacheDir: z.string().optional().default(join(getCliCwd(), ".hulla/.cache")),
  logs: z.boolean().optional().default(true),
})

export const defaultConfigRefs = {
  ui: ".hulla/ui.json",
}

export const configRefsSchema = z
  .object({
    ui: z.string().optional().default(defaultConfigRefs.ui),
  })
  .optional()
  .default(defaultConfigRefs)

export const ConfigSchema = z.object({
  $schema: z.string().optional(),
  cli: cliSchema,
  configs: configRefsSchema,
})

export type HullaConfigSchema = z.infer<typeof ConfigSchema>

// UI Cache schemas
export const uiCacheConfigSchema = z.object({
  name: z.string(),
  url: z.string().optional(),
  author: z.union([z.string(), z.array(z.string())]).optional(),
  version: z.string(),
})

export const uiCacheItemSchema = z.object({
  url: z.string(),
  rootDir: z.string(),
  commit: z.string().optional(),
  branch: z.string().optional(),
  config: uiCacheConfigSchema,
  frameworks: z.record(z.string(), z.string()), // all available frameworks with resolved paths
})

export const uiCacheSchema = z.object({
  lastUpdated: z.string().datetime(),
  libs: z.record(z.string(), uiCacheItemSchema),
})

export type UICacheConfig = z.infer<typeof uiCacheConfigSchema>
export type UICacheItem = z.infer<typeof uiCacheItemSchema>
export type UICache = z.infer<typeof uiCacheSchema>
