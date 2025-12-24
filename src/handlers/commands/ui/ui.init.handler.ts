import { createUiInstallTask } from "@/lib/ui/tasks/ui.install.task"
import { createUiTsconfigTask } from "@/lib/ui/tasks/ui.tsconfig.task"
import { tasks } from "@/prompts/tasks"
import type { SubHandlerFunction, UIInitTaskState } from "@/types"
import { ok } from "@hulla/control"

export const init: SubHandlerFunction<"ui", "init"> = async ({ config }) => {
  const state: UIInitTaskState = {
    tsConfigPath: null,
    dependencies: [],
    devDependencies: [],
  }

  const installTask = createUiInstallTask(config, state)
  const tsConfigTask = createUiTsconfigTask(state)

  await tasks([installTask, tsConfigTask])

  return ok({
    data: null,
    meta: { on: "ui:init", key: "init" },
    message: "UI command executed",
  })
}
