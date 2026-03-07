import { commandErr, commandOk } from "@/app/result"
import type { CommandContext, CommandModule, ParserResult } from "@/app/types"
import { createUiAddTask } from "./services/workflow"

export async function runUiAdd({
  context,
  result,
}: {
  context: CommandContext
  result: ParserResult["commands"]["ui"]["commands"]["add"]
}) {
  try {
    const taskResult = await createUiAddTask({
      config: context.config,
      parserResult: context.parserResult,
      result,
    })

    if (taskResult.isErr()) {
      return commandErr(taskResult.error)
    }

    return commandOk("UI components added successfully", taskResult.value)
  } catch (error) {
    return commandErr(error as Error)
  }
}

export const uiAddRunner: CommandModule["run"] = runUiAdd
