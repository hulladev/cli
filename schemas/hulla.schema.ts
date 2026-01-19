import { homedir } from "os"
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
  cacheDir: z.string().optional().default(join(homedir(), ".cache/hulla")),
  logs: z.boolean().optional().default(true),
})

export const defaultUiConfig = {
  libs: ["https://github.com/hulladev/ui/tree/master/generated"],
}

export const uiSchema = z
  .object({
    libs: z
      .array(
        z.union([
          z.string().url(),
          z.string().refine((val) => !/^(?:[a-z]+:)?\/\//i.test(val), {
            message: "Must be a valid URL or local path",
          }),
        ])
      )
      .optional()
      .default(defaultUiConfig.libs),
  })
  .default(defaultUiConfig)

export const ConfigSchema = z.object({
  $schema: z.string().optional(),
  cli: cliSchema,
  ui: uiSchema.optional(),
})

export type HullaConfigSchema = z.infer<typeof ConfigSchema>
