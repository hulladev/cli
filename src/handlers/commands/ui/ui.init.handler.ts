import {
  getProjectRootFromConfigPath,
  normalizePath,
  normalizeProjectRelativePath,
  readUIConfig,
  writeUIConfig,
} from "@/lib/ui/config"
import { createUiCopyTask } from "@/lib/ui/tasks/ui.copy.task"
import { createUiInstallTask } from "@/lib/ui/tasks/ui.install.task"
import { createUiTsconfigTask } from "@/lib/ui/tasks/ui.tsconfig.task"
import type { SubHandlerFunction } from "@/types"
import { ok } from "@hulla/control"
import { isAbsolute, relative } from "path"

export const init: SubHandlerFunction<"ui", "init"> = async ({ config }) => {
  const loadedUIConfig = await readUIConfig(config)
  const { selectedFrameworks, installDrafts, copyContexts } =
    await createUiInstallTask({
      config,
      uiConfig: loadedUIConfig.data,
    })

  const tsconfigSelection = await createUiTsconfigTask({ selectedFrameworks })
  await createUiCopyTask({ config, copyContexts })
  const projectRoot = getProjectRootFromConfigPath(config.path)
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
  })

  return ok({
    data: null,
    meta: { on: "ui:init", key: "init" },
    message: "UI command executed",
  })
}

function toProjectRelativePath(path: string, projectRoot: string): string {
  const normalized = normalizePath(path)
  if (isAbsolute(normalized)) {
    return normalizeProjectRelativePath(relative(projectRoot, normalized))
  }
  return normalizeProjectRelativePath(normalized)
}
