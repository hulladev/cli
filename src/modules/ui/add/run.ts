import { commandErr, commandOk } from "@/app/result"
import type { CommandContext, CommandModule, ParserResult } from "@/app/types"
import { getProjectRootFromConfigPath, readUIConfig } from "../config"
import { runUiHooks } from "../shared/hooks"
import { createUiAddTask } from "./services/workflow"

export async function runUiAdd({
  context,
  result,
}: {
  context: CommandContext
  result: ParserResult["commands"]["ui"]["commands"]["add"]
}) {
  try {
    const ui = (await readUIConfig(context.config)).data
    const projectRoot = getProjectRootFromConfigPath(context.config.path)
    await runUiHooks({
      config: ui,
      phase: "pre",
      operation: "add",
      projectRoot,
      files: [],
    })
    const taskResult = await createUiAddTask({
      config: context.config,
      parserResult: context.parserResult,
      result,
    })

    if (taskResult.isErr()) {
      return commandErr(taskResult.error)
    }

    await runUiHooks({
      config: ui,
      phase: "post",
      operation: "add",
      projectRoot,
      files: taskResult.value.changedFilePaths,
    })

    return commandOk("UI components added successfully", taskResult.value)
  } catch (error) {
    return commandErr(error as Error)
  }
}

export const uiAddRunner: CommandModule["run"] = runUiAdd
