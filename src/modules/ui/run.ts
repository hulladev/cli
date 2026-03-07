import { commandErr, commandOkMessage } from "@/app/result"
import type { CommandContext, CommandModule, ParserResult } from "@/app/types"
import { d } from "@/terminal/format"
import { log } from "@/terminal/prompts/log"
import { runUiAdd } from "./add/run"
import { runUiInit } from "./init/run"
import { runUiRemove } from "./remove/run"
import { isUIConfigured } from "./shared/is-ui-configured"

export async function runUi({
  context,
  result,
}: {
  context: CommandContext
  result: ParserResult["commands"]["ui"]
}) {
  const uiConfigured = await isUIConfigured(context.config)
  if (!uiConfigured && !result.commands.init.detected) {
    log.info(
      `It looks like you don't have ${d.package("normal", " @hulla/ui ")} configured. Let's initialize it for you.`
    )
    const initResult = await runUiInit({
      context,
      result: result.commands.init,
    })
    if (initResult.isErr()) {
      return commandErr(initResult.error)
    }
  }

  if (result.commands.add.detected) {
    return runUiAdd({
      context,
      result: result.commands.add,
    })
  }

  if (result.commands.remove.detected) {
    return runUiRemove({
      context,
      result: result.commands.remove,
    })
  }

  if (result.commands.init.detected) {
    return runUiInit({
      context,
      result: result.commands.init,
    })
  }

  return commandOkMessage("UI command executed")
}

export const uiRunner: CommandModule["run"] = runUi
