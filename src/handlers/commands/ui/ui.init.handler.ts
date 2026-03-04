import {
  getProjectRootFromConfigPath,
  normalizePath,
  normalizeProjectRelativePath,
  readUIConfig,
  writeUIConfig,
} from "@/lib/ui/config"
import { createUiCopyTask } from "@/lib/ui/tasks/ui.copy.task"
import { createUiDepsTask } from "@/lib/ui/tasks/ui.deps.task"
import { createUiInstallTask } from "@/lib/ui/tasks/ui.install.task"
import { createUiTsconfigTask } from "@/lib/ui/tasks/ui.tsconfig.task"
import { createUiViteTask } from "@/lib/ui/tasks/ui.vite.task"
import { select } from "@/prompts/select"
import { text } from "@/prompts/text"
import type { SubHandlerFunction } from "@/types"
import { ok } from "@hulla/control"
import { isAbsolute, relative } from "path"

export const init: SubHandlerFunction<"ui", "init"> = async ({ config }) => {
  const loadedUIConfig = await readUIConfig(config)
  const {
    selectedFrameworks,
    installDrafts,
    copyContexts,
    sharedDependencies,
    sharedDevDependencies,
  } = await createUiInstallTask({
    config,
    uiConfig: loadedUIConfig.data,
  })

  const tsconfigSelection = await createUiTsconfigTask({ selectedFrameworks })
  await createUiViteTask({
    codeRoots: selectedFrameworks.map((framework) => framework.codeRoot),
  })
  await createUiCopyTask({ config, copyContexts })
  const projectRoot = getProjectRootFromConfigPath(config.path)
  await createUiDepsTask({
    config,
    projectRoot,
    dependencies: sharedDependencies,
    devDependencies: sharedDevDependencies,
  })
  const normalizedFrameworkTsconfigs = Object.fromEntries(
    Object.entries(tsconfigSelection.frameworkPaths).map(
      ([id, tsconfigPath]) => [
        id,
        toProjectRelativePath(tsconfigPath, projectRoot),
      ]
    )
  )

  const normalizedRootPath = tsconfigSelection.rootPath
    ? toProjectRelativePath(tsconfigSelection.rootPath, projectRoot)
    : undefined

  const updatedInstalls = installDrafts.map((draft) => ({
    sourceUrl: draft.sourceUrl,
    libraryName: draft.libraryName,
    codeRoot: draft.codeRoot,
    componentsRoot: draft.componentsRoot,
    copyFilesRoot: draft.copyFilesRoot,
    ...(normalizedRootPath ? { rootTsconfigPath: normalizedRootPath } : {}),
    frameworks: draft.frameworks.map((framework) => ({
      name: framework.name,
      templatePath: framework.templatePath,
      outputPath: framework.outputPath,
      tsconfigPath:
        normalizedFrameworkTsconfigs[framework.id] ?? "tsconfig.json",
    })),
  }))

  const replacedSourceUrls = new Set(
    updatedInstalls.map((item) => item.sourceUrl)
  )
  const retainedInstalls = loadedUIConfig.data.installs.filter(
    (item) => !replacedSourceUrls.has(item.sourceUrl)
  )
  const postAddUpdateStep = await promptPostAddUpdateStep(
    loadedUIConfig.data.postAddUpdateStep
  )

  await writeUIConfig(loadedUIConfig.path, {
    ...loadedUIConfig.data,
    installs: [...retainedInstalls, ...updatedInstalls],
    postAddUpdateStep,
  })

  return ok({
    data: null,
    meta: { on: "ui:init", key: "init" },
    message: "UI command executed",
  })
}

async function promptPostAddUpdateStep(
  initial: Awaited<ReturnType<typeof readUIConfig>>["data"]["postAddUpdateStep"]
): Promise<
  Awaited<ReturnType<typeof readUIConfig>>["data"]["postAddUpdateStep"]
> {
  const selectedType = await select<
    "prettier" | "oxfmt" | "custom-command" | "none"
  >({
    message: "Choose a post component add/update step",
    initialValue: getInitialPostStepChoice(initial),
    options: [
      {
        label: "prettier on changed files",
        value: "prettier",
      },
      {
        label: "oxfmt on changed files",
        value: "oxfmt",
      },
      {
        label: "Custom command",
        value: "custom-command",
      },
      {
        label: "No post add/update step",
        value: "none",
      },
    ],
  })

  if (selectedType === "prettier") {
    return "prettier --write {files}"
  }

  if (selectedType === "oxfmt") {
    return "oxfmt {files}"
  }

  if (selectedType === "none") {
    return ""
  }

  const command = await text({
    message: "Enter custom command (use {files} placeholder for changed files)",
    placeholder: "eslint --fix {files}",
    ...(initial ? { initialValue: initial } : {}),
    validate: (value) =>
      value && value.trim().length > 0 ? undefined : "Command is required",
  })

  return command.trim()
}

function getInitialPostStepChoice(
  command: Awaited<ReturnType<typeof readUIConfig>>["data"]["postAddUpdateStep"]
): "prettier" | "oxfmt" | "custom-command" | "none" {
  const normalized = command.trim()
  if (!normalized) {
    return "none"
  }
  if (normalized === "prettier --write {files}") {
    return "prettier"
  }
  if (normalized === "oxfmt {files}") {
    return "oxfmt"
  }
  return "custom-command"
}

function toProjectRelativePath(path: string, projectRoot: string): string {
  const normalized = normalizePath(path)
  if (isAbsolute(normalized)) {
    return normalizeProjectRelativePath(relative(projectRoot, normalized))
  }
  return normalizeProjectRelativePath(normalized)
}
