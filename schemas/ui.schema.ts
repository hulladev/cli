import { z } from "zod"

export const defaultUISources = [
  "https://github.com/hulladev/ui/tree/master/generated",
]

export const uiSourceSchema = z.union([
  z.url(),
  z.string().refine((val) => !/^(?:[a-z]+:)?\/\//i.test(val), {
    message: "Must be a valid URL or local path",
  }),
])

export const uiInstallFrameworkSchema = z.object({
  name: z.string(),
  templatePath: z.string(),
  outputPath: z.string(),
  tsconfigPath: z.string(),
})

export const uiInstallSchema = z.object({
  sourceUrl: z.string(),
  libraryName: z.string(),
  componentsRoot: z.string(),
  copyFilesRoot: z.string(),
  rootTsconfigPath: z.string().optional(),
  frameworks: z.array(uiInstallFrameworkSchema).default([]),
})

export const UIConfigSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.number().int().positive().optional().default(1),
    sources: z.array(uiSourceSchema).optional().default(defaultUISources),
    installs: z.array(uiInstallSchema).optional().default([]),
  })
  .default({
    version: 1,
    sources: defaultUISources,
    installs: [],
  })

export type UIConfigSchemaType = z.infer<typeof UIConfigSchema>
