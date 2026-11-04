import { getStringOption } from "@/app/options"
import { commandErr, commandOkMessage } from "@/app/result"
import type { CommandContext, CommandModule, ParserResult } from "@/app/types"
import { d } from "@/terminal/format"
import { log } from "@/terminal/prompts/log"
import { runUiAdd } from "./add/run"
import { runUiInit } from "./init/run"
import { runUiList } from "./list/run"
import { runUiRemove } from "./remove/run"
import { isUIConfigured } from "./shared/is-ui-configured"

export async function runUi({
  context,
  result,
}: {
  context: CommandContext
  result: ParserResult["commands"]["ui"]
}) {
  if (result.commands.list.detected)
    return runUiList({ context, result: result.commands.list })
  const uiConfigured = await isUIConfigured(context.config)
  if (result.commands.remove.detected && !uiConfigured) {
    return commandErr(
      new Error(
        "No UI configuration found. There are no configured components to remove."
      )
    )
  }
  const components = result.commands.add.arguments.components?.value
  if (
    result.commands.add.detected &&
    context.parserResult.argv.some((arg) => arg === "--yes" || arg === "-y") &&
    (!Array.isArray(components) || components.length === 0)
  ) {
    return commandErr(
      new Error(
        "With --yes, component input is required. Run hulla ui add button dialog --yes."
      )
    )
  }
  const setupRequested = [
    "source",
    "code-root",
    "components-root",
    "copy-root",
    "post-add-command",
  ].some((name) => getStringOption(context.parserResult, name) !== undefined)
  if (setupRequested && result.commands.remove.detected) {
    return commandErr(
      new Error(
        "Setup options belong to hulla ui init or hulla ui add, not ui remove."
      )
    )
  }
  if ((!uiConfigured || setupRequested) && !result.commands.init.detected) {
    log.info(
      uiConfigured
        ? "Updating UI configuration from the supplied setup options."
        : `Configuring ${d.package("normal", " @hulla/ui ")} before adding components.`
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
