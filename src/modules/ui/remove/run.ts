import { commandOkMessage } from "@/app/result"
import type { CommandModule, ParserResult } from "@/app/types"

export async function runUiRemove({
  result,
}: {
  context: unknown
  result: ParserResult["commands"]["ui"]["commands"]["remove"]
}) {
  console.log("result ===", result)
  return commandOkMessage("UI command executed")
}

export const uiRemoveRunner: CommandModule["run"] = runUiRemove
