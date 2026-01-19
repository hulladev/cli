import { store } from "@/lib/store"
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

  const initStore = store<UIInitTaskState>(state)

  const installTask = createUiInstallTask(config)
  const tsConfigTask = createUiTsconfigTask(initStore)

  await tasks([installTask, tsConfigTask])

  console.log(initStore.getState())

  return ok({
    data: null,
    meta: { on: "ui:init", key: "init" },
    message: "UI command executed",
  })
}
