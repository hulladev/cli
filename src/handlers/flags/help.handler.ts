import type { HandlerFunction } from "@/types"
import { ok } from "@hulla/control"

export const help: HandlerFunction<"arguments", "help"> = ({
  result,
  parserResult,
}) => {
  return ok({
    data: "Help message - CLI usage information",
    meta: { on: "arguments", key: "help" },
    message: "Help message - CLI usage information",
  })
}
