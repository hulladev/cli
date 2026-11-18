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
  composer: z.enum(["cn", "tailwind-merge"]).optional(),
  codeRoot: z.string().optional(),
  componentsRoot: z.string(),
  copyFilesRoot: z.string(),
  rootTsconfigPath: z.string().optional(),
  frameworks: z.array(uiInstallFrameworkSchema).default([]),
})

export const uiPostAddUpdateStepSchema = z
  .string()
  .trim()
  .optional()
  .default("")

const hookCommand = z.string().trim().min(1)
export const uiHooksSchema = z
  .object({
    pre: z
      .array(
        hookCommand.refine((command) => !command.includes("{files}"), {
          message:
            "Pre hooks run before file selection; use post hooks for {files}.",
        })
      )
      .optional(),
    post: z
      .array(
        z.union([
          hookCommand,
          z
            .object({
              command: hookCommand,
              preview: z.boolean().optional().default(false),
            })
            .refine(
              (hook) => !hook.preview || hook.command.includes("{files}"),
              {
                message:
                  "Preview hooks must contain {files} and operate only on supplied files.",
              }
            ),
        ])
      )
      .optional(),
  })
  .optional()

export const UIConfigSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.number().int().positive().optional().default(1),
    sources: z.array(uiSourceSchema).optional().default(defaultUISources),
    installs: z.array(uiInstallSchema).optional().default([]),
    postAddUpdateStep: uiPostAddUpdateStepSchema,
    hooks: uiHooksSchema,
  })
  .default({
    version: 1,
    sources: defaultUISources,
    installs: [],
    postAddUpdateStep: "",
  })

export type UIConfigSchemaType = z.infer<typeof UIConfigSchema>
