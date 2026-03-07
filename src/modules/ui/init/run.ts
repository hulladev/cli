import { commandOkMessage } from "@/app/result"
import type { CommandContext, CommandModule, ParserResult } from "@/app/types"
import {
  getProjectRootFromConfigPath,
  normalizePath,
  normalizeProjectRelativePath,
  readUIConfig,
  writeUIConfig,
} from "@/modules/ui/config"
import { select } from "@/terminal/prompts/select"
import { text } from "@/terminal/prompts/text"
import { isAbsolute, relative } from "path"
import {
  buildFormatterPostAddCommand,
  runPostAddUpdateStep,
} from "../add/services/dependencies"
import { createUiCopyTask } from "./services/copy-files"
import { createUiDepsTask } from "./services/dependencies"
import { createUiInstallTask } from "./services/install-plan"
import { createUiTsconfigTask } from "./services/tsconfig-plan"
import { createUiViteTask } from "./services/vite"

export async function runUiInit({
  context,
}: {
  context: CommandContext
  result: ParserResult["commands"]["ui"]["commands"]["init"]
}) {
  const config = context.config
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
  const projectRoot = getProjectRootFromConfigPath(config.path)
  const postAddUpdateStep = await promptPostAddUpdateStep(
    projectRoot,
    loadedUIConfig.data.postAddUpdateStep
  )

  const tsconfigSelection = await createUiTsconfigTask({ selectedFrameworks })
  await runPostAddUpdateStep({
    postAddUpdateStep,
    projectRoot,
    changedFilePaths: tsconfigSelection.changedPaths,
  })
  await createUiViteTask({
    codeRoots: selectedFrameworks.map((framework) => framework.codeRoot),
  })
  await createUiCopyTask({ config, copyContexts })
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

  await writeUIConfig(loadedUIConfig.path, {
    ...loadedUIConfig.data,
    installs: [...retainedInstalls, ...updatedInstalls],
    postAddUpdateStep,
  })

  return commandOkMessage("UI command executed")
}

async function promptPostAddUpdateStep(
  projectRoot: string,
  initial: Awaited<ReturnType<typeof readUIConfig>>["data"]["postAddUpdateStep"]
): Promise<
  Awaited<ReturnType<typeof readUIConfig>>["data"]["postAddUpdateStep"]
> {
  const prettierCommand = await buildFormatterPostAddCommand({
    projectRoot,
    formatter: "prettier",
  })
  const oxfmtCommand = await buildFormatterPostAddCommand({
    projectRoot,
    formatter: "oxfmt",
  })
  const selectedType = await select<
    "prettier" | "oxfmt" | "custom-command" | "none"
  >({
    message: "Choose a post component add/update step",
    initialValue: getInitialPostStepChoice(initial),
    options: [
      {
        label: "prettier on changed files",
        value: "prettier",
        hint: prettierCommand,
      },
      {
        label: "oxfmt on changed files",
        value: "oxfmt",
        hint: oxfmtCommand,
      },
      { label: "Custom command", value: "custom-command" },
      { label: "No post add/update step", value: "none" },
    ],
  })

  if (selectedType === "prettier") {
    return prettierCommand
  }
  if (selectedType === "oxfmt") {
    return oxfmtCommand
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
  if (
    normalized === "prettier --write {files}" ||
    normalized === "npx prettier --write {files}" ||
    normalized === "bunx prettier --write {files}"
  ) {
    return "prettier"
  }
  if (
    normalized === "oxfmt {files}" ||
    normalized === "npx oxfmt {files}" ||
    normalized === "bunx oxfmt {files}"
  ) {
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

export const uiInitRunner: CommandModule["run"] = runUiInit
