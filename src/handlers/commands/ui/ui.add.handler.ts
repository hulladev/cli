import { createUiAddTask } from "@/lib/ui/tasks/ui.add.task"
import type { SubHandlerFunction } from "@/types"
import { err, ok } from "@hulla/control"

export const add: SubHandlerFunction<"ui", "add"> = async ({
  result,
  parserResult,
  config,
}) => {
  try {
    const taskResult = await createUiAddTask({
      config,
      parserResult,
      result,
    })

    if (taskResult.isErr()) {
      return err(taskResult.error)
    }

    return ok({
      data: taskResult.value,
      meta: { on: "ui:add", key: "add" },
      message: "UI components added successfully",
    })
  } catch (error) {
    return err(error as Error)
  }
}
