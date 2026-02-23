import { d } from "@/decorators"
import { executeHandlers } from "@/lib/shared/executeHandlers"
import { isUIConfigured } from "@/lib/ui/isUiConfigured"
import { log } from "@/prompts/log"
import type { HandlerFunction } from "@/types"
import { err, ok } from "@hulla/control"
import { add } from "./ui.add.handler"
import { config } from "./ui.config.handler"
import { framework } from "./ui.framework.handler"
import { help } from "./ui.help.hander"
import { init } from "./ui.init.handler"
import { remove } from "./ui.remove.handler"

export const ui: HandlerFunction<"commands", "ui"> = async ({
  result,
  parserResult,
  config: hullaConfig,
  rawConfig,
}) => {
  const uiConfigured = await isUIConfigured(hullaConfig)
  if (!uiConfigured && !result.commands.init.detected) {
    log.info(
      `It looks like you don't have ${d.package("normal", " @hulla/ui ")} configured. Let's initialize it for you.`
    )
    await init({
      result: result.commands.init,
      parserResult,
      config: hullaConfig,
      rawConfig,
    })
  }

  await executeHandlers({
    result,
    on: "arguments",
    parserResult,
    config: hullaConfig,
    handlers: {
      help,
      config,
      framework,
    },
  })

  const subCommandResults = await executeHandlers({
    result,
    on: "commands",
    parserResult,
    config: hullaConfig,
    handlers: {
      add,
      remove,
      init,
    },
  })
  for (const handlerResult of subCommandResults.values()) {
    if (handlerResult && typeof handlerResult === "object") {
      const maybeControl = handlerResult as { isErr?: () => boolean }
      if (maybeControl.isErr?.()) {
        const failed = handlerResult as { error: Error }
        return err(failed.error)
      }
    }
  }

  return ok({
    data: null,
    meta: { on: "commands", key: "ui" },
    message: "UI command executed",
  })
}
