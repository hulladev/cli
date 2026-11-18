import { getProjectPackageDirectories } from "@/platform/package-json"
import { log } from "@/terminal/prompts/log"
import { delimiter, join, relative } from "node:path"
import { formatPostAddUpdateDiffPreview } from "../add/services/dependencies"
import type { UIProjectConfig } from "../config"

export type UIOperation = "init" | "add" | "remove"
export type PostHook = { command: string; preview: boolean }
type HookConfig = Pick<UIProjectConfig, "hooks" | "postAddUpdateStep">

export function postHooks(
  config: HookConfig,
  operation: UIOperation
): PostHook[] {
  if (config.hooks?.post !== undefined)
    return config.hooks.post.map((hook) =>
      typeof hook === "string"
        ? { command: hook, preview: false }
        : { command: hook.command, preview: hook.preview === true }
    )
  // Preserve the old file-command semantics only for the operations that used it.
  const legacy = config.postAddUpdateStep.trim()
  return legacy && operation !== "remove"
    ? [
        {
          command: legacy.includes("{files}") ? legacy : `${legacy} {files}`,
          preview: true,
        },
      ]
    : []
}

export async function runUiHooks(input: {
  config: HookConfig
  phase: "pre" | "post"
  operation: UIOperation
  projectRoot: string
  files: string[]
}): Promise<void> {
  const hooks =
    input.phase === "pre"
      ? (input.config.hooks?.pre ?? [])
      : postHooks(input.config, input.operation).map((hook) => hook.command)
  const directories = await getProjectPackageDirectories(input.projectRoot)
  const files = input.files.map((path) =>
    relative(input.projectRoot, path).replace(/\\/g, "/")
  )
  for (const command of hooks) {
    if (input.phase === "pre" && command.includes("{files}"))
      throw new Error(
        "UI pre hooks run before file selection; use a post hook for {files} commands."
      )
    if (command.includes("{files}") && files.length === 0) continue
    const script = command.replaceAll(
      "{files}",
      files.map((file) => `'${file.replaceAll("'", `'"'"'`)}'`).join(" ")
    )
    log.info(`Running UI ${input.operation} ${input.phase} hook: ${command}`)
    const process = Bun.spawn(["sh", "-c", script], {
      cwd: input.projectRoot,
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...globalThis.process.env,
        PATH: [
          ...directories.map((directory) =>
            join(directory, "node_modules/.bin")
          ),
          globalThis.process.env.PATH ?? "",
        ].join(delimiter),
        HULLA_UI_OPERATION: input.operation,
        HULLA_UI_PHASE: input.phase,
        HULLA_UI_FILES: JSON.stringify(files),
      },
    })
    const exit = await process.exited
    if (exit !== 0)
      throw new Error(
        `UI ${input.operation} ${input.phase} hook failed (exit ${exit}): ${command}`
      )
  }
}

export async function previewUiHooks(input: {
  config: HookConfig
  projectRoot: string
  files: Array<{ path: string; content: string }>
}): Promise<Map<string, string>> {
  let files = input.files
  let result = new Map<string, string>()
  const directories = await getProjectPackageDirectories(input.projectRoot)
  for (const hook of postHooks(input.config, "add").filter(
    (hook) => hook.preview
  )) {
    if (!hook.command.includes("{files}"))
      throw new Error(
        "A preview-enabled post hook must contain {files} and operate only on supplied files."
      )
    result = await formatPostAddUpdateDiffPreview({
      postAddUpdateStep: hook.command,
      projectRoot: input.projectRoot,
      files,
      environment: {
        PATH: [
          ...directories.map((directory) =>
            join(directory, "node_modules/.bin")
          ),
          process.env.PATH ?? "",
        ].join(delimiter),
        HULLA_UI_OPERATION: "add",
        HULLA_UI_PHASE: "preview",
      },
    })
    files = files.map((file) => ({
      ...file,
      content: result.get(file.path) ?? file.content,
    }))
  }
  return result
}
