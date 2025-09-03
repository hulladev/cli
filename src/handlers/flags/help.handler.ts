import type { Arg } from "@/cli"
import type { ok } from "@hulla/control"
import type { HandlerOutput } from "../types.handler"

export function help(flag: Arg<"help">): HandlerOutput {
  return ok({
    type: "success",
    message: "Help message - CLI usage information",
    fn: "info",
  })
}
