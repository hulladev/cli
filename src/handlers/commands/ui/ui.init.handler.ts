import { createUiInstallTask } from "@/lib/ui/tasks/ui.install.task"
import type { SubHandlerFunction } from "@/types"
import { ok } from "@hulla/control"

export const init: SubHandlerFunction<"ui", "init"> = async ({ config }) => {
  const installTask = await createUiInstallTask(config)
  // const tsConfigTask = createUiTsconfigTask(initStore)

  // await tasks([installTask, tsConfigTask])

  return ok({
    data: null,
    meta: { on: "ui:init", key: "init" },
    message: "UI command executed",
  })
}
